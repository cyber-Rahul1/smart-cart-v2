import { Injectable, Logger, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Delivery } from '../entities/delivery.entity.js';
import { Order } from '../../orders/entities/order.entity.js';
import { RiderProfile } from '../../users/entities/rider-profile.entity.js';
import { DeliveryStatus } from '../enums/delivery-status.enum.js';
import { OrderStatus } from '../../orders/enums/order-status.enum.js';
import { RiderAvailabilityStatus } from '../../users/enums/rider-availability-status.enum.js';
import { Payment } from '../../payments/entities/payment.entity.js';
import { PaymentMethod } from '../../payments/enums/payment-method.enum.js';
import { PaymentStatus } from '../../payments/enums/payment-status.enum.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { OutboxEvent } from '../../outbox/entities/outbox-event.entity.js';
import { DeliveryFailureReason } from '../enums/delivery-failure-reason.enum.js';
import { TrackingGateway } from '../../tracking/tracking.gateway.js';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RiderDeliveriesService {
  private readonly logger = new Logger(RiderDeliveriesService.name);
  
  // Configuration
  private readonly MAX_OTP_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly dataSource: DataSource,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  async getActiveDelivery(userId: string): Promise<Delivery | null> {
    const riderProfile = await this.dataSource.manager.findOne(RiderProfile, { where: { userId } });
    if (!riderProfile) throw new NotFoundException('Rider profile not found');

    return this.dataSource.manager.findOne(Delivery, {
      where: {
        riderId: riderProfile.id,
        status: In([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.ARRIVING]),
      },
      relations: { order: { items: true, shop: true, customer: true } }
    });
  }

  async getDeliveryDetails(userId: string, deliveryId: string): Promise<Delivery> {
    const riderProfile = await this.dataSource.manager.findOne(RiderProfile, { where: { userId } });
    if (!riderProfile) throw new NotFoundException('Rider profile not found');

    const delivery = await this.dataSource.manager.findOne(Delivery, {
      where: { id: deliveryId, riderId: riderProfile.id },
      relations: { order: { items: true, shop: true, customer: true } }
    });

    if (!delivery) throw new NotFoundException('Delivery not found or not assigned to you');
    return delivery;
  }

  async pickupDelivery(userId: string, deliveryId: string, pickupOtp: string): Promise<Delivery> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const deliveryPreview = await queryRunner.manager.findOne(Delivery, { where: { id: deliveryId } });
      if (!deliveryPreview) throw new NotFoundException('Delivery not found');

      // Lock Ordering: Order -> Delivery -> RiderProfile
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: deliveryPreview.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');

      const delivery = await queryRunner.manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');

      const riderProfile = await queryRunner.manager.findOne(RiderProfile, {
        where: { id: delivery.riderId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!riderProfile || riderProfile.userId !== userId) {
         throw new ForbiddenException('You are not assigned to this delivery');
      }

      // Validations
      if (delivery.status !== DeliveryStatus.ASSIGNED) {
        throw new ConflictException(`Invalid status for pickup: ${delivery.status}`);
      }

      // Check support flag
      if (delivery.pickupSupportRequired) {
        throw new ForbiddenException('Pickup verification blocked. Support intervention required.');
      }

      // Check lockout
      if (delivery.pickupVerificationLockedUntil && delivery.pickupVerificationLockedUntil > new Date()) {
        throw new ConflictException('Too many failed attempts. Try again later.');
      }

      // Check Expiry
      if (!delivery.pickupOtpHashed) {
        throw new BadRequestException('No pickup OTP set');
      }
      if (delivery.pickupOtpExpiresAt && delivery.pickupOtpExpiresAt < new Date()) {
        throw new BadRequestException('Pickup OTP has expired');
      }

      // Verify OTP
      const isMatch = await bcrypt.compare(pickupOtp, delivery.pickupOtpHashed);
      if (!isMatch) {
        delivery.pickupOtpAttempts += 1;
        if (delivery.pickupOtpAttempts >= this.MAX_OTP_ATTEMPTS) {
          if (delivery.pickupVerificationLockedUntil && delivery.pickupVerificationLockedUntil <= new Date()) {
            // Already had a lockout, this is attempt 6
            delivery.pickupSupportRequired = true;
          } else {
             // 5th attempt, lock for 15 mins
            delivery.pickupVerificationLockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION_MS);
          }
        }
        await queryRunner.manager.save(delivery);
        await queryRunner.commitTransaction(); // Commit the failed attempt
        throw new BadRequestException('Invalid OTP');
      }

      // Success!
      // Clear OTP state
      delivery.pickupOtpHashed = null as any;
      delivery.pickupOtpAttempts = 0;
      delivery.pickupOtpExpiresAt = null as any;
      delivery.pickupVerificationLockedUntil = null as any;
      
      // Update status
      const oldDeliveryStatus = delivery.status;
      delivery.status = DeliveryStatus.PICKED_UP;
      delivery.pickedUpAt = new Date();
      await queryRunner.manager.save(delivery);

      const oldOrderStatus = order.status;
      order.status = OrderStatus.PICKED_UP;
      await queryRunner.manager.save(order);

      // Generate Delivery OTP now!
      const rawDeliveryOtp = crypto.randomInt(100000, 999999).toString();
      delivery.deliveryOtpHashed = await bcrypt.hash(rawDeliveryOtp, 10);
      delivery.deliveryOtpExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
      await queryRunner.manager.save(delivery);

      // Audit Logs
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'DELIVERY',
        entityId: delivery.id,
        action: 'DELIVERY_PICKED_UP',
        previousState: { status: oldDeliveryStatus },
        newState: { status: delivery.status },
        performedBy: userId,
      }));
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'ORDER',
        entityId: order.id,
        action: 'ORDER_PICKED_UP',
        previousState: { status: oldOrderStatus },
        newState: { status: order.status },
        performedBy: userId,
      }));

      // Outbox (for Customer Notification with OTP)
      await queryRunner.manager.save(OutboxEvent, queryRunner.manager.create(OutboxEvent, {
        type: 'notifications.delivery.otp',
        payload: {
          deliveryId: delivery.id,
          orderId: order.id,
          customerId: order.customerId,
          otp: rawDeliveryOtp
        },
        idempotencyKey: `delivery-otp-${delivery.id}-${delivery.version}`
      }));
      
      await queryRunner.manager.save(OutboxEvent, queryRunner.manager.create(OutboxEvent, {
        type: 'order.status.changed',
        payload: { orderId: order.id, status: order.status },
        idempotencyKey: `order-status-${order.id}-${order.version}`
      }));

      await queryRunner.commitTransaction();
      return delivery;
    } catch (e) {
      if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async startDelivery(userId: string, deliveryId: string): Promise<Delivery> {
    return this.transitionDeliveryState(userId, deliveryId, DeliveryStatus.PICKED_UP, DeliveryStatus.OUT_FOR_DELIVERY, OrderStatus.OUT_FOR_DELIVERY, 'outForDeliveryAt');
  }

  async arrivingAtDelivery(userId: string, deliveryId: string): Promise<Delivery> {
    return this.transitionDeliveryState(userId, deliveryId, DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.ARRIVING, OrderStatus.ARRIVING, 'arrivingAt');
  }

  private async transitionDeliveryState(
    userId: string, 
    deliveryId: string, 
    expectedDeliveryStatus: DeliveryStatus, 
    newDeliveryStatus: DeliveryStatus,
    newOrderStatus: OrderStatus,
    timestampField: string
  ): Promise<Delivery> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const deliveryPreview = await queryRunner.manager.findOne(Delivery, { where: { id: deliveryId } });
      if (!deliveryPreview) throw new NotFoundException('Delivery not found');

      // Lock Order -> Delivery -> RiderProfile
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: deliveryPreview.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      const delivery = await queryRunner.manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: 'pessimistic_write' },
      });
      const riderProfile = await queryRunner.manager.findOne(RiderProfile, {
        where: { id: delivery!.riderId! },
        lock: { mode: 'pessimistic_write' },
      });
      
      if (!order || !delivery || !riderProfile) throw new NotFoundException();
      if (riderProfile.userId !== userId) throw new ForbiddenException();
      if (delivery.status !== expectedDeliveryStatus) throw new ConflictException(`Invalid status for transition: ${delivery.status}`);

      const oldDeliveryStatus = delivery.status;
      const oldOrderStatus = order.status;

      delivery.status = newDeliveryStatus;
      (delivery as any)[timestampField] = new Date();
      await queryRunner.manager.save(delivery);

      order.status = newOrderStatus;
      await queryRunner.manager.save(order);

      // Audit and Outbox
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'DELIVERY', entityId: delivery.id, action: `DELIVERY_STATE_${newDeliveryStatus}`, previousState: { status: oldDeliveryStatus }, newState: { status: delivery.status }, performedBy: userId
      }));
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'ORDER', entityId: order.id, action: `ORDER_STATE_${newOrderStatus}`, previousState: { status: oldOrderStatus }, newState: { status: order.status }, performedBy: userId
      }));
      await queryRunner.manager.save(OutboxEvent, queryRunner.manager.create(OutboxEvent, {
        type: 'order.status.changed', payload: { orderId: order.id, status: order.status }, idempotencyKey: `order-status-${order.id}-${order.version}`
      }));

      await queryRunner.commitTransaction();
      return delivery;
    } catch (e) {
      if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async completeDelivery(userId: string, deliveryId: string, deliveryOtp: string): Promise<Delivery> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const deliveryPreview = await queryRunner.manager.findOne(Delivery, { where: { id: deliveryId } });
      if (!deliveryPreview) throw new NotFoundException('Delivery not found');

      // Lock Order -> Delivery -> RiderProfile
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: deliveryPreview.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');

      const delivery = await queryRunner.manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');

      const riderProfile = await queryRunner.manager.findOne(RiderProfile, {
        where: { id: delivery.riderId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!riderProfile || riderProfile.userId !== userId) throw new ForbiddenException();

      // Lock Payment
      const payment = await queryRunner.manager.findOne(Payment, {
        where: { orderId: order.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) throw new NotFoundException('Payment not found');

      // Validations
      if (delivery.status !== DeliveryStatus.ARRIVING) throw new ConflictException(`Invalid status for completion: ${delivery.status}`);
      
      // COD Preconditions
      if (payment.paymentMethod === PaymentMethod.COD) {
         if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.AUTHORIZED) {
           throw new ConflictException(`Payment is COD but status is ${payment.status}, expected PENDING/AUTHORIZED`);
         }
      }

      // Check support flag
      if (delivery.deliverySupportRequired) throw new ForbiddenException('Delivery verification blocked. Support intervention required.');

      // Check lockout
      if (delivery.deliveryVerificationLockedUntil && delivery.deliveryVerificationLockedUntil > new Date()) {
        throw new ConflictException('Too many failed attempts. Try again later.');
      }

      // Check Expiry
      if (!delivery.deliveryOtpHashed) throw new BadRequestException('No delivery OTP set');
      if (delivery.deliveryOtpExpiresAt && delivery.deliveryOtpExpiresAt < new Date()) {
        throw new BadRequestException('Delivery OTP has expired');
      }

      // Verify OTP
      const isMatch = await bcrypt.compare(deliveryOtp, delivery.deliveryOtpHashed);
      if (!isMatch) {
        delivery.deliveryOtpAttempts += 1;
        if (delivery.deliveryOtpAttempts >= this.MAX_OTP_ATTEMPTS) {
          if (delivery.deliveryVerificationLockedUntil && delivery.deliveryVerificationLockedUntil <= new Date()) {
            delivery.deliverySupportRequired = true; // Attempt 6
          } else {
            delivery.deliveryVerificationLockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION_MS);
          }
        }
        await queryRunner.manager.save(delivery);
        await queryRunner.commitTransaction(); // Commit the failure
        throw new BadRequestException('Invalid OTP');
      }

      // Success!
      // Clear OTP state
      delivery.deliveryOtpHashed = null as any;
      delivery.deliveryOtpAttempts = 0;
      delivery.deliveryOtpExpiresAt = null as any;
      delivery.deliveryVerificationLockedUntil = null as any;

      // Update Order & Delivery to DELIVERED
      const oldDeliveryStatus = delivery.status;
      delivery.status = DeliveryStatus.DELIVERED;
      delivery.deliveredAt = new Date();
      await queryRunner.manager.save(delivery);

      const oldOrderStatus = order.status;
      order.status = OrderStatus.DELIVERED;
      await queryRunner.manager.save(order);

      // Free up Rider
      // Free up Rider
      riderProfile.availabilityStatus = RiderAvailabilityStatus.ONLINE;
      await queryRunner.manager.save(riderProfile);

      // Handle COD Payment Capture
      let oldPaymentStatus = payment.status;
      if (payment.paymentMethod === PaymentMethod.COD) {
        payment.status = PaymentStatus.CAPTURED;
        await queryRunner.manager.save(payment);

        await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
          entityType: 'PAYMENT', entityId: payment.id, action: 'PAYMENT_COD_CAPTURED',
          previousState: { status: oldPaymentStatus }, newState: { status: payment.status }, performedBy: userId,
          metadata: { note: 'COD collected upon delivery verification' }
        }));
      }

      // Audits & Outbox
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'DELIVERY', entityId: delivery.id, action: 'DELIVERY_COMPLETED', previousState: { status: oldDeliveryStatus }, newState: { status: delivery.status }, performedBy: userId
      }));
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'ORDER', entityId: order.id, action: 'ORDER_COMPLETED', previousState: { status: oldOrderStatus }, newState: { status: order.status }, performedBy: userId
      }));
      
      await queryRunner.manager.save(OutboxEvent, queryRunner.manager.create(OutboxEvent, {
        type: 'order.status.changed', payload: { orderId: order.id, status: order.status }, idempotencyKey: `order-status-${order.id}-${order.version}`
      }));

      await queryRunner.commitTransaction();
      
      // Terminate WS Tracking
      await this.trackingGateway.terminateDeliveryTracking(delivery.id);
      
      return delivery;
    } catch (e) {
      if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async failDelivery(userId: string, deliveryId: string, reason: DeliveryFailureReason, notes?: string): Promise<Delivery> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const deliveryPreview = await queryRunner.manager.findOne(Delivery, { where: { id: deliveryId } });
      if (!deliveryPreview) throw new NotFoundException('Delivery not found');

      // Lock Order -> Delivery -> RiderProfile
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: deliveryPreview.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');

      const delivery = await queryRunner.manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');

      const riderProfile = await queryRunner.manager.findOne(RiderProfile, {
        where: { id: delivery.riderId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!riderProfile || riderProfile.userId !== userId) throw new ForbiddenException();

      // Check current status
      const validStatuses = [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.ARRIVING];
      if (!validStatuses.includes(delivery.status)) throw new ConflictException(`Invalid status for failure: ${delivery.status}`);

      // Validate Failure Reason against current state
      switch (reason) {
        case DeliveryFailureReason.CUSTOMER_UNAVAILABLE:
        case DeliveryFailureReason.INCORRECT_ADDRESS:
        case DeliveryFailureReason.CUSTOMER_REFUSED_DELIVERY:
          if (![DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.ARRIVING].includes(delivery.status)) {
            throw new BadRequestException(`${reason} is only valid during OUT_FOR_DELIVERY or ARRIVING`);
          }
          break;
        case DeliveryFailureReason.CUSTOMER_REFUSED_PAYMENT:
          if (![DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.ARRIVING].includes(delivery.status)) {
            throw new BadRequestException(`CUSTOMER_REFUSED_PAYMENT is only valid during OUT_FOR_DELIVERY or ARRIVING`);
          }
          const payment = await queryRunner.manager.findOne(Payment, { where: { orderId: order.id }});
          if (payment?.paymentMethod !== PaymentMethod.COD) {
             throw new BadRequestException(`CUSTOMER_REFUSED_PAYMENT is only valid for COD orders`);
          }
          break;
        case DeliveryFailureReason.VEHICLE_BREAKDOWN:
          // Valid anywhere
          break;
        case DeliveryFailureReason.SHOP_CLOSED_OR_UNAVAILABLE:
          if (![DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP].includes(delivery.status)) {
            throw new BadRequestException(`SHOP_CLOSED_OR_UNAVAILABLE is only valid during ASSIGNED or PICKED_UP`);
          }
          break;
        case DeliveryFailureReason.ITEMS_DAMAGED:
          if (![DeliveryStatus.PICKED_UP, DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.ARRIVING].includes(delivery.status)) {
            throw new BadRequestException(`ITEMS_DAMAGED is only valid after pickup`);
          }
          break;
      }

      // Update Order & Delivery
      const oldDeliveryStatus = delivery.status;
      delivery.status = DeliveryStatus.FAILED;
      delivery.failureReason = reason;
      if (notes) delivery.failureNotes = notes;
      await queryRunner.manager.save(delivery);

      const oldOrderStatus = order.status;
      order.status = OrderStatus.DELIVERY_FAILED;
      await queryRunner.manager.save(order);

      // Free up Rider
      // Free up Rider
      riderProfile.availabilityStatus = RiderAvailabilityStatus.ONLINE;
      await queryRunner.manager.save(riderProfile);

      // Audits & Outbox
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'DELIVERY', entityId: delivery.id, action: 'DELIVERY_FAILED', previousState: { status: oldDeliveryStatus }, newState: { status: delivery.status }, performedBy: userId, metadata: { reason, notes }
      }));
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'ORDER', entityId: order.id, action: 'ORDER_DELIVERY_FAILED', previousState: { status: oldOrderStatus }, newState: { status: order.status }, performedBy: userId
      }));
      
      await queryRunner.manager.save(OutboxEvent, queryRunner.manager.create(OutboxEvent, {
        type: 'order.status.changed', payload: { orderId: order.id, status: order.status }, idempotencyKey: `order-status-${order.id}-${order.version}`
      }));

      await queryRunner.commitTransaction();

      // Terminate WS Tracking
      await this.trackingGateway.terminateDeliveryTracking(delivery.id);
      
      return delivery;
    } catch (e) {
      if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

}
