import { Injectable, Logger } from '@nestjs/common';
import type { IPushNotificationProvider, PushNotificationPayload } from './push-provider.interface.js';
import { InvalidTokenError } from './push-provider.interface.js';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';

@Injectable()
export class FcmPushProvider implements IPushNotificationProvider {
  private readonly logger = new Logger(FcmPushProvider.name);
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      if (getApps().length === 0) {
        // Automatically picks up GOOGLE_APPLICATION_CREDENTIALS 
        // if present in the environment
        initializeApp({
          credential: applicationDefault()
        });
        this.logger.log('Firebase Admin initialized with applicationDefault()');
      }
      this.initialized = true;
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin', err);
    }
  }

  async sendToDevice(token: string, payload: PushNotificationPayload): Promise<void> {
    if (!this.initialized) {
      this.logger.warn('FCM not initialized, dropping push notification');
      return;
    }

    const message: Message = {
      token,
      data: {
        type: payload.type,
        entityId: payload.entityId,
        deepLink: payload.deepLink,
      },
    };

    try {
      await getMessaging().send(message);
      this.logger.debug(`Successfully sent FCM push to ${token}`);
    } catch (error: any) {
      this.logger.error(`Error sending FCM push to ${token}`, error);
      
      // Handle known FCM invalid token errors
      const invalidTokenCodes = [
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered',
      ];

      if (error.code && invalidTokenCodes.includes(error.code)) {
        throw new InvalidTokenError(token, error.message);
      }

      throw error; // Let BullMQ retry transient errors
    }
  }
}
