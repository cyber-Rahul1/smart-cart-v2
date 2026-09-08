import { PaymentStatus } from '../enums/payment-status.enum.js';

export interface PaymentSessionResult {
  providerOrderId: string;
  amountInMinorUnits: number;
  currency: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: PaymentStatus;
}

export interface ParsedWebhookEvent {
  providerEventId: string;
  providerOrderId: string;
  providerPaymentId?: string;
  eventName: string; // Internal normalized event name
  status: PaymentStatus;
}

export interface IPaymentProvider {
  createPaymentSession(amountInMinorUnits: number, currency: string, receiptId: string): Promise<PaymentSessionResult>;
  getPaymentStatus(providerOrderId: string): Promise<PaymentStatus>;
  refundPayment(providerPaymentId: string, amountInMinorUnits: number, reason: string): Promise<RefundResult>;
  verifyWebhook(signature: string, rawBody: Buffer): boolean;
  parseWebhookEvent(payload: unknown): ParsedWebhookEvent;
}
