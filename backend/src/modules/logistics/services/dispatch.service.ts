import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Delivery } from '../entities/delivery.entity.js';
import { DeliveryOffer } from '../entities/delivery-offer.entity.js';
import { OfferStatus } from '../enums/offer-status.enum.js';
import { DeliveryStatus } from '../enums/delivery-status.enum.js';
import { DISPATCH_QUEUE, JOB_EXPIRE_OFFER, JOB_DISPATCH_RETRY, DISPATCH_CONFIG } from '../constants/logistics.constants.js';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue(DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
  ) {}

  async attemptDispatch(deliveryId: string, expectedAttempt: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let expirationJobs = [];
    let retryJobData = null;

    try {
      const delivery = await queryRunner.manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!delivery || delivery.dispatchAttempts !== expectedAttempt) {
        this.logger.log(`Dispatch attempt skipped. Expected attempt mismatch or missing delivery.`);
        await queryRunner.rollbackTransaction();
        return;
      }

      if (delivery.status !== DeliveryStatus.PENDING_DISPATCH && delivery.status !== DeliveryStatus.REASSIGNING) {
        this.logger.log(`Dispatch attempt skipped. Delivery not in dispatchable state (${delivery.status}).`);
        await queryRunner.rollbackTransaction();
        return;
      }

      // Check max attempts
      if (delivery.dispatchAttempts >= DISPATCH_CONFIG.MAX_DISPATCH_ATTEMPTS) {
        delivery.status = DeliveryStatus.FAILED;
        await queryRunner.manager.save(delivery);
        await queryRunner.commitTransaction();
        return;
      }

      // Increment attempt counter and transition to OFFERING
      delivery.dispatchAttempts += 1;
      delivery.status = DeliveryStatus.OFFERING;
      await queryRunner.manager.save(delivery);

      // Find candidates using Redis GEO
      const searchRadius = DISPATCH_CONFIG.SEARCH_RADIUS_METERS;
      const p = delivery.pickupLocation as any;
      const lng = p.coordinates[0];
      const lat = p.coordinates[1];
      
      let geoResults: [string, string][] = [];
      try {
        // We need to use 'geosearch' but ioredis type might be a bit tricky. 
        // We can use georadius as a simpler alternative since it's universally supported
        geoResults = await (this.dispatchQueue as any).client.georadius(
          'rider:locations:geo',
          lng, lat,
          searchRadius, 'm',
          'WITHDIST', 'ASC'
        ) as any;
      } catch (e) {
        this.logger.error('Redis unavailable during candidate discovery. Failing safely.', (e as Error).stack);
        await queryRunner.rollbackTransaction();
        return;
      }

      if (!geoResults || geoResults.length === 0) {
        delivery.status = DeliveryStatus.REASSIGNING;
        await queryRunner.manager.save(delivery);
        await queryRunner.commitTransaction();
        // Delay retry slightly to allow processing
        await this.dispatchQueue.add(JOB_DISPATCH_RETRY, { deliveryId: delivery.id, expectedAttempt: delivery.dispatchAttempts }, { delay: 5000 });
        return;
      }

      // Check Hash freshness
      const redisClient = (this.dispatchQueue as any).client;
      const pipeline = redisClient.pipeline();
      geoResults.forEach(([riderId]) => {
        pipeline.hgetall(`rider:location:${riderId}`);
      });
      const hashResults = await pipeline.exec();

      const now = Date.now();
      const freshRiderMap = new Map<string, number>(); // riderId -> distance
      
      geoResults.forEach(([riderId, distanceStr], index) => {
        const [err, hash] = hashResults[index] as [Error | null, any];
        if (err || !hash || Object.keys(hash).length === 0) return;
        
        const serverTimestamp = parseInt(hash.serverTimestamp, 10);
        if (now - serverTimestamp <= DISPATCH_CONFIG.LOCATION_FRESHNESS_THRESHOLD_SEC * 1000) {
          freshRiderMap.set(riderId, parseFloat(distanceStr));
        }
      });

      if (freshRiderMap.size === 0) {
        delivery.status = DeliveryStatus.REASSIGNING;
        await queryRunner.manager.save(delivery);
        await queryRunner.commitTransaction();
        await this.dispatchQueue.add(JOB_DISPATCH_RETRY, { deliveryId: delivery.id, expectedAttempt: delivery.dispatchAttempts }, { delay: 5000 });
        return;
      }

      const freshRiderIds = Array.from(freshRiderMap.keys());

      // Validate candidates via PostgreSQL
      const candidates = await queryRunner.query(`
        SELECT rp.id as "riderId"
        FROM "rider_profiles" rp
        JOIN "users" u ON u.id = rp."userId"
        WHERE u.status = 'ACTIVE'
          AND 'RIDER' = ANY(u.roles)
          AND rp."kycStatus" = 'APPROVED'
          AND rp."availabilityStatus" = 'ONLINE'
          AND rp.id = ANY($1)
          AND NOT EXISTS (
            SELECT 1 FROM deliveries d
            WHERE d."riderId" = rp.id
            AND d.status IN ('ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING')
          )
      `, [freshRiderIds]);

      // Map back to distance and sort
      const validatedCandidates = candidates.map((c: any) => ({
        riderId: c.riderId,
        distance: freshRiderMap.get(c.riderId)!,
      }));
      validatedCandidates.sort((a: any, b: any) => a.distance - b.distance);

      const topCandidates = validatedCandidates.slice(0, DISPATCH_CONFIG.TOP_N_CANDIDATES);

      if (topCandidates.length === 0) {
        delivery.status = DeliveryStatus.REASSIGNING;
        await queryRunner.manager.save(delivery);
        retryJobData = { deliveryId: delivery.id, expectedAttempt: delivery.dispatchAttempts };
      } else {
        const expiresAt = new Date(Date.now() + (DISPATCH_CONFIG.OFFER_EXPIRY_SEC * 1000));
        
        for (const candidate of topCandidates) {
          const offer = queryRunner.manager.create(DeliveryOffer, {
            deliveryId: delivery.id,
            riderId: candidate.riderId,
            status: OfferStatus.PENDING,
            expiresAt,
          });
          const savedOffer = await queryRunner.manager.save(offer);
          
          expirationJobs.push({
            name: JOB_EXPIRE_OFFER,
            data: { offerId: savedOffer.id },
            opts: { delay: DISPATCH_CONFIG.OFFER_EXPIRY_SEC * 1000 }
          });
        }
      }

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    // Queue jobs post-commit
    for (const job of expirationJobs) {
      await this.dispatchQueue.add(job.name, job.data, job.opts);
    }
    if (retryJobData) {
      // Delay retry slightly to allow processing
      await this.dispatchQueue.add(JOB_DISPATCH_RETRY, retryJobData, { delay: 5000 });
    }
  }

  // Used when order moves to READY_FOR_PICKUP
  async startDispatch(deliveryId: string): Promise<void> {
    await this.dispatchQueue.add(JOB_DISPATCH_RETRY, { deliveryId, expectedAttempt: 0 });
  }
}
