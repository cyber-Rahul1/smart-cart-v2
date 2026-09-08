import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TrackingService } from './tracking.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiderLocation } from '../logistics/entities/rider-location.entity.js';
import { RiderProfile } from '../users/entities/rider-profile.entity.js';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class TrackingCron {
  private readonly logger = new Logger(TrackingCron.name);

  constructor(
    private readonly trackingService: TrackingService,
    @InjectQueue('persist-location') private persistQueue: Queue,
    @InjectRepository(RiderLocation) private locationRepo: Repository<RiderLocation>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // Scanner running every 15 seconds for active deliveries / online riders
  @Cron('*/15 * * * * *')
  async scanAndPersistLocations() {
    this.logger.debug('Running 15-second location persistence scanner');

    // Get all riders in the GEO index as a baseline of active tracking
    const riderIds = await this.redis.zrange('rider:locations:geo', 0, -1);
    if (!riderIds.length) return;

    for (const riderId of riderIds) {
      try {
        const latest = await this.trackingService.getLatestLocation(riderId);
        if (!latest) continue;

        // Check if we need to persist it.
        // We track the last persisted timestamp in Redis to avoid querying Postgres on every scan
        const lastPersistedKey = `rider:last_persisted:${riderId}`;
        const lastPersisted = await this.redis.get(lastPersistedKey);

        const lastPersistedTime = lastPersisted ? parseInt(lastPersisted, 10) : 0;

        // If the location we have is newer than what we last persisted, enqueue it
        if (latest.riderTimestamp > lastPersistedTime) {
          await this.persistQueue.add(
            'persist',
            {
              riderId: latest.riderId,
              lat: latest.lat,
              lng: latest.lng,
              riderTimestamp: latest.riderTimestamp,
              deliveryId: latest.deliveryId,
            },
            {
              jobId: `persist-loc:${latest.riderId}:${latest.riderTimestamp}`, // Idempotency key
              removeOnComplete: true,
              removeOnFail: 10,
            }
          );

          // Update the last persisted tracking
          await this.redis.set(lastPersistedKey, latest.riderTimestamp.toString(), 'EX', 3600);
        }
      } catch (error) {
        this.logger.error(`Error scanning location for rider ${riderId}: ${(error as Error).message}`);
      }
    }
  }

  // Cleanup stale GEO members every 5 minutes
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupStaleGeoMembers() {
    this.logger.debug('Running GEO cleanup');
    await this.trackingService.cleanupStaleGeo();
  }
}
