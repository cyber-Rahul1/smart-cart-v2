export interface PushNotificationPayload {
  type: string;
  entityId: string;
  deepLink: string;
}

export class InvalidTokenError extends Error {
  constructor(public readonly token: string, message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export interface IPushNotificationProvider {
  /**
   * Sends a push notification to a specific token.
   * Throws InvalidTokenError if the token is unregistered or malformed.
   * May throw other errors for transient/permanent provider failures.
   */
  sendToDevice(token: string, payload: PushNotificationPayload): Promise<void>;
}

export const PUSH_NOTIFICATION_PROVIDER = 'PUSH_NOTIFICATION_PROVIDER';
