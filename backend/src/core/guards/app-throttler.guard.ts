import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If there's a phone number in the body, use it for throttling to prevent IP rotation attacks
    if (req.body && req.body.phoneNumber) {
      // Normalize it slightly just for tracking
      return req.body.phoneNumber.replace(/\s+/g, '');
    }
    // Fallback to IP address
    return req.ip;
  }
}
