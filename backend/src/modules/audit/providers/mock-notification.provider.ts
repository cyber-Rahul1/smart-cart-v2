import { Injectable, Logger } from '@nestjs/common';
import { INotificationProvider, SendNotificationParams } from './notification-provider.interface.js';

@Injectable()
export class MockNotificationProvider implements INotificationProvider {
  private readonly logger = new Logger(MockNotificationProvider.name);

  async sendPushNotification(params: SendNotificationParams): Promise<void> {
    this.logger.log(`[MOCK PUSH] To: ${params.userId} | Title: ${params.title} | Body: ${params.body}`);
  }

  async sendSms(userId: string, message: string): Promise<void> {
    this.logger.log(`[MOCK SMS] To: ${userId} | Message: ${message}`);
  }

  async sendEmail(userId: string, subject: string, body: string): Promise<void> {
    this.logger.log(`[MOCK EMAIL] To: ${userId} | Subject: ${subject} | Body: ${body}`);
  }
}
