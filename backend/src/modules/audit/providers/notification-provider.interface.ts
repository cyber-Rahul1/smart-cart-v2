export interface SendNotificationParams {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface INotificationProvider {
  sendPushNotification(params: SendNotificationParams): Promise<void>;
  sendSms(userId: string, message: string): Promise<void>;
  sendEmail(userId: string, subject: string, body: string): Promise<void>;
}

export const NOTIFICATION_PROVIDER = 'NOTIFICATION_PROVIDER';
