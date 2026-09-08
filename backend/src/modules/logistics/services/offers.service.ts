import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DeliveryOffer } from '../entities/delivery-offer.entity.js';
import { Delivery } from '../entities/delivery.entity.js';
import { Order } from '../../orders/entities/order.entity.js';
import { RiderProfile } from '../../users/entities/rider-profile.entity.js';
import { OfferStatus } from '../enums/offer-status.enum.js';
import { DeliveryStatus } from '../enums/delivery-status.enum.js';
import { OrderStatus } from '../../orders/enums/order-status.enum.js';
import { RiderAvailabilityStatus } from '../../users/enums/rider-availability-status.enum.js';
import { RiderKycStatus } from '../../users/enums/rider-kyc-status.enum.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DISPATCH_QUEUE, JOB_DISPATCH_RETRY } from '../constants/logistics.constants.js';

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue(DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
  ) {}

  async acceptOffer(riderId: string, offerId: string): Promise<Delivery> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Order Lock (if necessary to prevent concurrent order cancellations while accepting)
      // Actually we just lock Delivery first, then Order if we need to modify it.
      // The user requested: Order -> Delivery -> RiderProfile -> Offer
      // Wait, can we lock Order first without knowing orderId? We need the offer to get deliveryId to get orderId.
      // So we read offer uncommitted first to get IDs, then lock in order.
      
      const offerPreview = await queryRunner.manager.findOne(DeliveryOffer, { 
        where: { id: offerId }, 
        relations: { delivery: true } 
      });
      if (!offerPreview) throw new NotFoundException('Offer not found');

      const orderId = offerPreview.delivery.orderId;
      const deliveryId = offerPreview.deliveryId;

      // Lock Ordering: Order -> Delivery -> RiderProfile -> DeliveryOffer
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');

      const delivery = await queryRunner.manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');

      const riderProfile = await queryRunner.manager.findOne(RiderProfile, {
        where: { userId: riderId }, // Note: RiderProfile PK is id, but we might search by userId.
        lock: { mode: 'pessimistic_write' },
      });
      if (!riderProfile) throw new NotFoundException('Rider profile not found');

      const offer = await queryRunner.manager.findOne(DeliveryOffer, {
        where: { id: offerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!offer) throw new NotFoundException('Offer not found');

      // Verify the offer belongs to this rider (profile.id matches riderId stored in offer)
      if (offer.riderId !== riderProfile.id) {
        throw new BadRequestException('Offer does not belong to rider');
      }

      // Preconditions
      if (delivery.status !== DeliveryStatus.OFFERING) {
        throw new ConflictException(`Delivery is in status ${delivery.status}, cannot accept offer`);
      }
      if (offer.status !== OfferStatus.PENDING) {
        throw new ConflictException(`Offer is in status ${offer.status}, cannot accept`);
      }
      if (offer.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException('Offer has expired');
      }
      if (order.status !== OrderStatus.READY_FOR_PICKUP) {
        throw new ConflictException(`Order is in status ${order.status}, cannot accept offer`);
      }
      if (riderProfile.kycStatus !== RiderKycStatus.APPROVED || riderProfile.availabilityStatus !== RiderAvailabilityStatus.ONLINE) {
        throw new ConflictException('Rider is not eligible (must be ONLINE and APPROVED)');
      }

      // Ensure Rider has no active delivery (Fallback check inside tx)
      const activeDelivery = await queryRunner.manager.findOne(Delivery, {
        where: [
          { riderId: riderProfile.id, status: DeliveryStatus.ASSIGNED },
          { riderId: riderProfile.id, status: DeliveryStatus.PICKED_UP },
          { riderId: riderProfile.id, status: DeliveryStatus.OUT_FOR_DELIVERY },
          { riderId: riderProfile.id, status: DeliveryStatus.ARRIVING },
        ]
      });
      if (activeDelivery) {
        throw new ConflictException('Rider already has an active delivery');
      }

      // Execute Transitions
      
      // 1. Rider -> BUSY (version check conceptually applied, though we locked it)
      const riderUpdateResult = await queryRunner.manager.update(RiderProfile, 
        { id: riderProfile.id, version: riderProfile.version, availabilityStatus: RiderAvailabilityStatus.ONLINE },
        { availabilityStatus: RiderAvailabilityStatus.BUSY, version: riderProfile.version + 1 }
      );
      if (riderUpdateResult.affected === 0) {
        throw new ConflictException('Rider availability update failed due to concurrent modification');
      }

      // 2. Offer -> ACCEPTED
      offer.status = OfferStatus.ACCEPTED;
      await queryRunner.manager.save(offer);

      // 3. Other active offers -> CANCELLED
      await queryRunner.manager.update(DeliveryOffer, 
        { deliveryId: delivery.id, status: OfferStatus.PENDING },
        { status: OfferStatus.CANCELLED }
      );

      // 4. Delivery -> ASSIGNED
      delivery.status = DeliveryStatus.ASSIGNED;
      delivery.riderId = riderProfile.id; // Assign to profile ID
      await queryRunner.manager.save(delivery);

      // 5. Order -> RIDER_ASSIGNED
      const oldOrderStatus = order.status;
      order.status = OrderStatus.RIDER_ASSIGNED;
      await queryRunner.manager.save(order);

      // 6. Audit Logs
      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'ORDER',
        entityId: order.id,
        action: 'ORDER_STATE_CHANGED',
        previousState: { status: oldOrderStatus },
        newState: { status: order.status },
        performedBy: riderProfile.userId,
      }));

      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'DELIVERY',
        entityId: delivery.id,
        action: 'RIDER_ASSIGNED',
        previousState: { status: DeliveryStatus.OFFERING, riderId: null },
        newState: { status: delivery.status, riderId: delivery.riderId },
        performedBy: riderProfile.userId,
      }));

      await queryRunner.manager.save(AuditLog, queryRunner.manager.create(AuditLog, {
        entityType: 'RIDER_PROFILE',
        entityId: riderProfile.id,
        action: 'RIDER_AVAILABILITY_CHANGED',
        previousState: { availabilityStatus: RiderAvailabilityStatus.ONLINE },
        newState: { availabilityStatus: RiderAvailabilityStatus.BUSY },
        performedBy: riderProfile.userId,
      }));

      await queryRunner.commitTransaction();
      this.logger.log(`Rider ${riderId} accepted offer ${offerId} for delivery ${deliveryId}`);
      return delivery;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async rejectOffer(riderId: string, offerId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let retryJobData = null;

    try {
      // Lock Offer
      const offer = await queryRunner.manager.findOne(DeliveryOffer, {
        where: { id: offerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!offer) throw new NotFoundException('Offer not found');
      
      const profile = await queryRunner.manager.findOne(RiderProfile, { where: { userId: riderId } });
      if (!profile || offer.riderId !== profile.id) throw new BadRequestException('Offer does not belong to rider');
      
      if (offer.status !== OfferStatus.PENDING) {
        throw new ConflictException(`Cannot reject offer in status ${offer.status}`);
      }

      offer.status = OfferStatus.REJECTED;
      await queryRunner.manager.save(offer);

      // Lock Delivery to check if we should trigger reassignment
      const delivery = await queryRunner.manager.findOne(Delivery, {
        where: { id: offer.deliveryId },
        lock: { mode: 'pessimistic_write' },
      });
      
      if (delivery && delivery.status === DeliveryStatus.OFFERING) {
        // Are there any pending offers left?
        const pendingOffersCount = await queryRunner.manager.count(DeliveryOffer, {
          where: { deliveryId: delivery.id, status: OfferStatus.PENDING }
        });

        if (pendingOffersCount === 0) {
          // Trigger retry immediately
          delivery.status = DeliveryStatus.REASSIGNING;
          await queryRunner.manager.save(delivery);
          retryJobData = { deliveryId: delivery.id, expectedAttempt: delivery.dispatchAttempts };
        }
      }

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    if (retryJobData) {
      await this.dispatchQueue.add(JOB_DISPATCH_RETRY, retryJobData);
    }
  }

  async expireOffer(offerId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let retryJobData = null;

    try {
      // Read without lock to get orderId, deliveryId
      const offerPreview = await queryRunner.manager.findOne(DeliveryOffer, { 
        where: { id: offerId }, 
        relations: { delivery: true } 
      });
      
      if (!offerPreview || offerPreview.status !== OfferStatus.PENDING) {
        // Idempotent exit
        await queryRunner.rollbackTransaction();
        return;
      }

      // Lock Order -> Delivery -> RiderProfile -> Offer
      // Expiration doesn't strictly need Order lock unless it's canceling the order, but to keep locking consistent:
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: offerPreview.delivery.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      const delivery = await queryRunner.manager.findOne(Delivery, {
        where: { id: offerPreview.deliveryId },
        lock: { mode: 'pessimistic_write' },
      });
      const riderProfile = await queryRunner.manager.findOne(RiderProfile, {
        where: { id: offerPreview.riderId },
        lock: { mode: 'pessimistic_write' },
      });
      const offer = await queryRunner.manager.findOne(DeliveryOffer, {
        where: { id: offerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!offer || offer.status !== OfferStatus.PENDING) {
        await queryRunner.rollbackTransaction();
        return;
      }

      // Update Offer
      offer.status = OfferStatus.EXPIRED;
      await queryRunner.manager.save(offer);

      // Check Delivery
      if (delivery && delivery.status === DeliveryStatus.OFFERING) {
        const pendingOffersCount = await queryRunner.manager.count(DeliveryOffer, {
          where: { deliveryId: delivery.id, status: OfferStatus.PENDING }
        });

        if (pendingOffersCount === 0) {
          delivery.status = DeliveryStatus.REASSIGNING;
          await queryRunner.manager.save(delivery);
          retryJobData = { deliveryId: delivery.id, expectedAttempt: delivery.dispatchAttempts };
        }
      }

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    if (retryJobData) {
      await this.dispatchQueue.add(JOB_DISPATCH_RETRY, retryJobData);
    }
  }
}
