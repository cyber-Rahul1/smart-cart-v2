import { Injectable } from '@nestjs/common';
import { PushNotificationPayload } from '../providers/push-provider.interface.js';

@Injectable()
export class PushPayloadBuilder {
  /**
   * Builds a safe, data-only payload for push notifications.
   * Ensures NO sensitive data is leaked into FCM metadata.
   */
  buildPayload(eventType: string, entityId: string): PushNotificationPayload {
    // Generate deep links based on the context of the event
    let deepLink = `smartcart://orders/${entityId}`;

    if (eventType.startsWith('rider.')) {
      deepLink = `smartcart-rider://deliveries/${entityId}`;
    } else if (eventType.startsWith('shop.')) {
      deepLink = `smartcart-shop://orders/${entityId}`;
    }

    return {
      type: eventType,
      entityId,
      deepLink,
    };
  }
}
