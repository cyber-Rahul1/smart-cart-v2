import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class WsRateLimitService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async checkLimit(userId: string, action: string, limit: number, windowSecs: number): Promise<boolean> {
    const key = `rate-limit:ws:cm:${action}:${userId}`;
    
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSecs);
    }
    
    return count <= limit;
  }
}
