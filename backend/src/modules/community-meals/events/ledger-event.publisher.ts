import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class LedgerEventPublisher {
  private readonly logger = new Logger(LedgerEventPublisher.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async publishEvent(type: string, allocationId: string, payload: any): Promise<void> {
    try {
      const message = JSON.stringify({ type, allocationId, payload });
      await this.redis.publish('community-meals:events', message);
    } catch (error) {
      // Required by constraint: Do not make Redis availability a prerequisite for DB operations
      this.logger.error(`Failed to publish Redis event ${type} for allocation ${allocationId}: ${(error as Error).message}`);
    }
  }
}
