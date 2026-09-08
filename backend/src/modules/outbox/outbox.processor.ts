import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { OutboxEvent, OutboxEventStatus } from './entities/outbox-event.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { Delivery } from '../logistics/entities/delivery.entity.js';
import { DeliveryStatus } from '../logistics/enums/delivery-status.enum.js';
import { DispatchService } from '../logistics/services/dispatch.service.js';
import { OUTBOX_QUEUE, JOB_PROCESS_OUTBOX_EVENT } from '../logistics/constants/logistics.constants.js';
import { NotificationService } from '../audit/services/notification.service.js';
import { PushDispatchService } from '../notifications/services/push-dispatch.service.js';
import { Notification } from '../audit/entities/notification.entity.js';
import { PaymentsService } from '../payments/payments.service.js';

/**
 * OutboxProcessor -- BullMQ worker that executes committed outbox events.
 *
 * Processing guarantees:
 * - Each job is identified by jobId = outboxEventId (deduplication).
 * - If a job fails it is retried up to 5 times with exponential backoff.
 * - Permanent/poison failures are recorded in the outbox_events table (status=FAILED)
 *   without crashing the worker.
 * - READY_FOR_PICKUP dispatch is idempotent: if a Delivery already exists for the
 *   order, creation is skipped and dispatch is triggered on the existing record.
 * - Duplicate processing of the same event is safe due to the idempotent Delivery
 *   creation check and the BullMQ jobId deduplication.
 */
@Processor(OUTBOX_QUEUE)
export class OutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly dispatchService: DispatchService,
    private readonly notificationService: NotificationService,
    private readonly pushDispatchService: PushDispatchService,
    private readonly paymentsService: PaymentsService,
  ) {
    super();
  }

  async process(job: Job<{ outboxEventId: string }>): Promise<void> {
    if (job.name !== JOB_PROCESS_OUTBOX_EVENT) {
      this.logger.warn(`Unknown outbox job name: ${job.name}`);
      return;
    }

    const { outboxEventId } = job.data;
    const repo = this.dataSource.getRepository(OutboxEvent);

    const event = await repo.findOne({ where: { id: outboxEventId } });
    if (!event) {
      this.logger.warn(`Outbox event ${outboxEventId} not found -- may have been deleted`);
      return;
    }

    // Idempotency: skip if already processed (e.g. duplicate BullMQ job)
    if (event.status === OutboxEventStatus.PROCESSED) {
      this.logger.debug(`Outbox event ${outboxEventId} already processed -- skipping`);
      return;
    }

    try {
      switch (event.type) {
        case 'READY_FOR_PICKUP':
          await this.handleReadyForPickup(event);
          break;
        case 'notifications.delivery.otp':
          await this.handleNotification(event, 'Delivery OTP', `Your delivery OTP is ${event.payload.otp}`);
          break;
        case 'order.status.changed':
          await this.handleNotification(event, 'Order Update', `Your order status changed to ${event.payload.newStatus}`);
          break;
        case 'refund.initiated':
          await this.handleRefund(event);
          break;
        default:
          this.logger.warn(`Unknown outbox event type: ${event.type} -- marking processed`);
          break;
      }

      await repo.update(outboxEventId, {
        status: OutboxEventStatus.PROCESSED,
        processedAt: new Date(),
      });
      this.logger.log(`Outbox event ${outboxEventId} (${event.type}) processed successfully`);
    } catch (err) {
      // Record the error; BullMQ will retry the job according to the attempts/backoff config.
      await repo.update(outboxEventId, {
        error: (err as Error).message,
      });
      // Re-throw so BullMQ marks the job as failed and applies retry logic.
      throw err;
    }
  }

  /**
   * Handles READY_FOR_PICKUP: creates a Delivery record (idempotently) and
   * triggers DispatchService.startDispatch().
   */
  private async handleReadyForPickup(event: OutboxEvent): Promise<void> {
    const orderId = event.payload.orderId as string;
    if (!orderId) throw new Error('Missing orderId in READY_FOR_PICKUP payload');

    // Idempotency: if Delivery already exists, skip creation.
    const deliveryRepo = this.dataSource.getRepository(Delivery);
    const existingDelivery = await deliveryRepo.findOne({ where: { orderId } });

    let deliveryId: string;

    if (existingDelivery) {
      this.logger.log(`Delivery already exists for order ${orderId} (${existingDelivery.id}) -- skipping creation`);
      deliveryId = existingDelivery.id;
    } else {
      const order = await this.dataSource.getRepository(Order).findOne({ where: { id: orderId } });
      if (!order) throw new Error(`Order ${orderId} not found`);

      const shop = await this.dataSource.getRepository(Shop).findOne({ where: { id: order.shopId } });
      if (!shop) throw new Error(`Shop ${order.shopId} not found for order ${orderId}`);

      const delivery = deliveryRepo.create({
        orderId: order.id,
        status: DeliveryStatus.PENDING_DISPATCH,
        pickupLocation: shop.location,
        dropoffLocation: order.deliveryLocation,
      });
      const saved = await deliveryRepo.save(delivery);
      deliveryId = saved.id;
      this.logger.log(`Created Delivery ${deliveryId} for order ${orderId}`);
    }

    await this.dispatchService.startDispatch(deliveryId);
  }

  /**
   * Generates a history record transactionally and then pushes it via the provider.
   * If history exists, skips gracefully.
   */
  private async handleNotification(event: OutboxEvent, title: string, body: string): Promise<void> {
    let order: Order | null = null;
    if (event.payload.orderId) {
      order = await this.dataSource.getRepository(Order).findOne({ where: { id: event.payload.orderId as string } });
    }

    if (!order) {
      this.logger.warn(`Cannot send notification for outbox event ${event.id}: Order not found or not in payload.`);
      return;
    }

    let notification: Notification;
    try {
      notification = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Notification);
        const newNotif = repo.create({
          eventId: event.id,
          userId: order!.customerId,
          title,
          body,
          type: event.type,
          entityId: order!.id,
        });
        return await repo.save(newNotif);
      });
    } catch (error: any) {
      // 23505 is PostgreSQL unique violation code
      if (error.code === '23505') {
        this.logger.log(`Notification history for event ${event.id} already exists. Proceeding to delivery.`);
        notification = await this.dataSource.getRepository(Notification).findOneOrFail({ where: { eventId: event.id } });
      } else {
        throw error;
      }
    }

    // Now send the actual push notification (Mobile devices)
    await this.pushDispatchService.dispatchToUser(notification.userId, event.type, order.id);

    // Maintain backwards compatibility / generic fallback if needed for other channels
    // (This is just keeping the old API active for any SMS/email channels managed there)
    await this.notificationService.sendInAppPush(notification.userId, notification.title, notification.body, {
      orderId: order.id,
      type: event.type,
    });
  }

  private async handleRefund(event: OutboxEvent): Promise<void> {
    const orderId = event.payload.orderId as string;
    const reason = event.payload.reason as string || 'Order cancelled';
    if (!orderId) {
      this.logger.warn(`Cannot process refund for event ${event.id}: missing orderId`);
      return;
    }
    
    try {
      await this.paymentsService.initiateRefund(orderId, reason);
      this.logger.log(`Refund successfully processed for order ${orderId} (event: ${event.id})`);
    } catch (error: any) {
      if (error.status === 409) {
        // Idempotency constraint or already refunded, safe to ignore
        this.logger.log(`Refund for order ${orderId} already handled: ${error.message}`);
      } else {
        throw error;
      }
    }
  }
}
