import { Injectable, Logger } from '@nestjs/common';
import { IPushNotificationProvider, PushNotificationPayload } from './push-provider.interface.js';

@Injectable()
export class MockPushProvider implements IPushNotificationProvider {
  private readonly logger = new Logger(MockPushProvider.name);

  async sendToDevice(token: string, payload: PushNotificationPayload): Promise<void> {
    this.logger.log(`[MOCK] Sending push to token ${token} with payload: ${JSON.stringify(payload)}`);
    
    // Simulate invalid token for tests
    if (token === 'invalid-token-test') {
      const { InvalidTokenError } = await import('./push-provider.interface.js');
      throw new InvalidTokenError(token, 'Mock invalid token');
    }

    if (token === 'transient-error-test') {
      throw new Error('Mock transient error');
    }
  }
}
