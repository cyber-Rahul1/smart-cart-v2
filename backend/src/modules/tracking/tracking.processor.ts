import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiderLocation } from '../logistics/entities/rider-location.entity.js';

export interface PersistLocationPayload {
  riderId: string;
  lat: number;
  lng: number;
  riderTimestamp: number;
  deliveryId: string | null;
}

@Processor('persist-location')
export class TrackingProcessor extends WorkerHost {
  private readonly logger = new Logger(TrackingProcessor.name);

  constructor(
    @InjectRepository(RiderLocation)
    private readonly locationRepo: Repository<RiderLocation>,
  ) {
    super();
  }

  async process(job: Job<PersistLocationPayload>): Promise<void> {
    const { riderId, lat, lng, riderTimestamp, deliveryId } = job.data;

    try {
      // Create the geometry point using PostGIS native functions
      // The ON CONFLICT DO NOTHING relies on the unique constraint for riderId and timestamp
      await this.locationRepo.query(
        `INSERT INTO rider_locations ("id", "riderId", "location", "timestamp", "createdAt", "deliveryId")
         VALUES (uuid_generate_v4(), $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, NOW(), $5)
         ON CONFLICT ("riderId", "timestamp") DO NOTHING`,
        [riderId, lng, lat, new Date(riderTimestamp), deliveryId]
      );
      this.logger.debug(`Persisted location for rider ${riderId} at ${riderTimestamp}`);
    } catch (error) {
      this.logger.error(`Failed to persist location for rider ${riderId}: ${(error as Error).message}`, (error as Error).stack);
      throw error; // Let BullMQ handle retries
    }
  }
}
