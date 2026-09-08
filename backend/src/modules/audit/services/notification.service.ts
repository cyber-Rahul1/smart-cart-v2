import { Injectable, Logger, Inject } from '@nestjs/common';
import type { INotificationProvider } from '../providers/notification-provider.interface.js';
import { NOTIFICATION_PROVIDER } from '../providers/notification-provider.interface.js';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATION_PROVIDER)
    private readonly provider: INotificationProvider,
  ) {}

  async sendInAppPush(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
    try {
      await this.provider.sendPushNotification({ userId, title, body, data });
    } catch (error) {
      this.logger.error(`Failed to send push notification to ${userId}`, error);
      throw error;
    }
  }

  async sendSms(userId: string, message: string): Promise<void> {
    try {
      await this.provider.sendSms(userId, message);
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${userId}`, error);
      throw error;
    }
  }
}
