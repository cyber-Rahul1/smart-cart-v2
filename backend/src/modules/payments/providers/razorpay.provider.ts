import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { IPaymentProvider, PaymentSessionResult, RefundResult, ParsedWebhookEvent } from '../interfaces/payment-provider.interface.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import { ProviderException, ProviderErrorType } from '../../../core/exceptions/provider.exception.js';

@Injectable()
export class RazorpayProvider implements IPaymentProvider {
  private readonly logger = new Logger(RazorpayProvider.name);
  private razorpay: Razorpay;
  private readonly webhookSecret: string;

  constructor(private configService: ConfigService) {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    this.webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || '';

    if (!keyId || !keySecret) {
      this.logger.warn('Razorpay credentials not fully configured.');
    } else {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }
  }

  async createPaymentSession(amountInMinorUnits: number, currency: string, receiptId: string): Promise<PaymentSessionResult> {
    if (!this.razorpay) {
      throw new InternalServerErrorException('Payment provider not configured');
    }

    try {
      const order = await this.razorpay.orders.create({
        amount: amountInMinorUnits,
        currency,
        receipt: receiptId,
      });

      return {
        providerOrderId: order.id,
        amountInMinorUnits: order.amount as number,
        currency: order.currency,
      };
    } catch (error: any) {
      this.logger.error('Failed to create Razorpay order', error);
      throw new ProviderException('Razorpay', ProviderErrorType.UNKNOWN, 'Failed to initiate payment session', error);
    }
  }

  async getPaymentStatus(providerOrderId: string): Promise<PaymentStatus> {
    if (!this.razorpay) {
      throw new InternalServerErrorException('Payment provider not configured');
    }

    try {
      const order = await this.razorpay.orders.fetch(providerOrderId);
      return this.mapRazorpayStatus(order.status);
    } catch (error: any) {
      this.logger.error(`Failed to fetch status for Razorpay order ${providerOrderId}`, error);
      throw new ProviderException('Razorpay', ProviderErrorType.UNKNOWN, 'Failed to fetch payment status', error);
    }
  }

  async refundPayment(providerPaymentId: string, amountInMinorUnits: number, reason: string): Promise<RefundResult> {
    if (!this.razorpay) {
      throw new InternalServerErrorException('Payment provider not configured');
    }

    try {
      const refund = await this.razorpay.payments.refund(providerPaymentId, {
        amount: amountInMinorUnits,
        notes: { reason },
      });

      return {
        providerRefundId: refund.id,
        status: refund.status === 'processed' ? PaymentStatus.REFUNDED : PaymentStatus.REFUND_PENDING,
      };
    } catch (error: any) {
      this.logger.error(`Failed to initiate refund for payment ${providerPaymentId}`, error);
      throw new ProviderException('Razorpay', ProviderErrorType.UNKNOWN, 'Failed to process refund', error);
    }
  }

  verifyWebhook(signature: string, rawBody: Buffer): boolean {
    if (!this.webhookSecret) {
      this.logger.error('Webhook secret not configured');
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody.toString('utf8'))
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      this.logger.error('Error verifying webhook signature', error);
      return false;
    }
  }

  parseWebhookEvent(payload: unknown): ParsedWebhookEvent {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid webhook payload format');
    }

    const eventObj = payload as any;
    
    // Basic structural validation
    if (!eventObj.event || typeof eventObj.event !== 'string') {
      throw new BadRequestException('Missing event name in payload');
    }

    const eventName = eventObj.event;
    
    // Extract headers (like x-razorpay-event-id) if passed inside payload wrapper by controller,
    // otherwise generate a fallback or rely on DB idempotency if eventID isn't in body. 
    // Razorpay puts it in the header `x-razorpay-event-id`. We assume the controller will pass the payload.
    // Wait, Razorpay sends the payload with a generated header. But the payload itself sometimes has `event_id`.
    // Actually, `x-razorpay-event-id` is in the headers. We will make the controller pass the event ID,
    // but the interface requires parsing from payload. Let's just trust what is given or return it.
    
    let providerOrderId = '';
    let providerPaymentId = '';

    if (eventObj.payload && eventObj.payload.payment && eventObj.payload.payment.entity) {
      providerPaymentId = eventObj.payload.payment.entity.id;
      providerOrderId = eventObj.payload.payment.entity.order_id;
    }
    
    if (eventObj.payload && eventObj.payload.order && eventObj.payload.order.entity) {
      providerOrderId = eventObj.payload.order.entity.id;
    }

    if (!providerOrderId) {
      throw new BadRequestException('Could not extract providerOrderId from webhook payload');
    }

    return {
      providerEventId: '', // To be filled by the controller from headers if not present in body
      providerOrderId,
      providerPaymentId,
      eventName,
      status: this.mapRazorpayEventToStatus(eventName),
    };
  }

  private mapRazorpayStatus(status: string): PaymentStatus {
    switch (status) {
      case 'created':
        return PaymentStatus.CREATED;
      case 'attempted':
        return PaymentStatus.PENDING;
      case 'paid':
        return PaymentStatus.CAPTURED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  private mapRazorpayEventToStatus(eventName: string): PaymentStatus {
    switch (eventName) {
      case 'payment.authorized':
        return PaymentStatus.AUTHORIZED;
      case 'payment.captured':
        return PaymentStatus.CAPTURED;
      case 'payment.failed':
        return PaymentStatus.FAILED;
      case 'refund.processed':
        return PaymentStatus.REFUNDED;
      case 'order.paid':
        return PaymentStatus.CAPTURED;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
