import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WebhookEvent, WebhookEventStatus } from './entities/webhook-event.entity.js';
import { Payment } from './entities/payment.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { RazorpayProvider } from './providers/razorpay.provider.js';
import { PaymentStatus } from './enums/payment-status.enum.js';
import { OrderStatus } from '../orders/enums/order-status.enum.js';
import { OrderStateMachine } from '../orders/orders.state-machine.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly webhookEventRepo: Repository<WebhookEvent>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly razorpayProvider: RazorpayProvider,
  ) {}

  async processWebhook(signature: string, eventId: string | undefined, rawBody: Buffer, payload: unknown) {
    // 1. Verify Signature
    const isValid = this.razorpayProvider.verifyWebhook(signature, rawBody);
    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // 2. Parse Event
    const parsedEvent = this.razorpayProvider.parseWebhookEvent(payload);
    const finalEventId = eventId || parsedEvent.providerEventId || `gen_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 3. Check for Duplicate Event
    const existingEvent = await this.webhookEventRepo.findOne({
      where: { provider: 'RAZORPAY', eventId: finalEventId },
    });

    if (existingEvent && existingEvent.status === WebhookEventStatus.PROCESSED) {
      this.logger.log(`Webhook event ${finalEventId} already processed. Ignored.`);
      return;
    }

    let webhookEvent = existingEvent;
    if (!webhookEvent) {
      webhookEvent = this.webhookEventRepo.create({
        provider: 'RAZORPAY',
        eventId: finalEventId,
        status: WebhookEventStatus.VERIFIED,
      });
      await this.webhookEventRepo.save(webhookEvent);
    }

    // 4. Process State Change in a short Transaction
    try {
      await this.dataSource.transaction(async (manager) => {
        // Lock the payment row
        const payment = await manager.findOne(Payment, {
          where: { providerOrderId: parsedEvent.providerOrderId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!payment) {
          throw new BadRequestException(`Payment with provider order ID ${parsedEvent.providerOrderId} not found`);
        }

        // Lock the associated order
        const order = await manager.findOne(Order, {
          where: { id: payment.orderId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!order) {
          throw new InternalServerErrorException(`Order ${payment.orderId} not found`);
        }

        if (
          (payment.status === PaymentStatus.CAPTURED || payment.status === PaymentStatus.REFUNDED || payment.status === PaymentStatus.REFUND_PENDING) &&
          (parsedEvent.status === PaymentStatus.FAILED || parsedEvent.status === PaymentStatus.PENDING)
        ) {
          this.logger.warn(`Ignoring stale event updating status to ${parsedEvent.status} for already successful/refunded payment ${payment.id}`);
        } else if (order.status === OrderStatus.CANCELLED && parsedEvent.status === PaymentStatus.CAPTURED) {
          this.logger.warn(`Payment captured for already cancelled order ${order.id} - ignoring order state transition`);
          payment.status = parsedEvent.status;
        } else {
          payment.status = parsedEvent.status;
        }

        if (parsedEvent.providerPaymentId) {
          payment.providerPaymentId = parsedEvent.providerPaymentId;
        }
        await manager.save(payment);

        if (parsedEvent.status === PaymentStatus.CAPTURED) {
          if (order.status === OrderStatus.PAYMENT_PENDING) {
            OrderStateMachine.validateTransition(order.status, OrderStatus.PLACED);
            order.status = OrderStatus.PLACED;
            await manager.save(order);
          }
        } else if (parsedEvent.status === PaymentStatus.FAILED) {
          if (order.status === OrderStatus.PAYMENT_PENDING) {
            OrderStateMachine.validateTransition(order.status, OrderStatus.PAYMENT_FAILED);
            order.status = OrderStatus.PAYMENT_FAILED;
            await manager.save(order);
          }
        }

        // Mark webhook event as processed
        webhookEvent!.status = WebhookEventStatus.PROCESSED;
        webhookEvent!.processedAt = new Date();
        await manager.save(webhookEvent);
      });
    } catch (error) {
      this.logger.error(`Failed to process webhook event ${finalEventId}`, error);
      webhookEvent.status = WebhookEventStatus.FAILED;
      await this.webhookEventRepo.save(webhookEvent);
      // We don't throw error to provider to avoid infinite retries if it's a valid but unprocessable event,
      // but maybe we should throw so Razorpay retries if it was a deadlock.
      throw error;
    }
  }
}
