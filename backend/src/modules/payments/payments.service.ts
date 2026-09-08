import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { Payment } from './entities/payment.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { PaymentStatus } from './enums/payment-status.enum.js';
import { PaymentMethod } from './enums/payment-method.enum.js';
import { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import { RazorpayProvider } from './providers/razorpay.provider.js';
import { MoneyUtil } from '../../core/utils/money.util.js';
import { OrderStateMachine } from '../orders/orders.state-machine.js';
import { OrderStatus } from '../orders/enums/order-status.enum.js';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly razorpayProvider: RazorpayProvider,
  ) {}

  async initiatePayment(
    orderId: string,
    customerId: string,
    dto: InitiatePaymentDto,
    idempotencyKey: string,
  ): Promise<any> {
    const requestPayloadHash = this.generatePayloadHash(orderId, dto);

    // 1. Fetch Order and verify ownership
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.customerId !== customerId) {
      throw new NotFoundException('Order not found'); // Mask actual existence for security
    }

    // 2. Check for successful payments
    const successfulPayment = await this.paymentRepo.findOne({
      where: [
        { orderId, status: PaymentStatus.AUTHORIZED },
        { orderId, status: PaymentStatus.CAPTURED },
        { orderId, status: PaymentStatus.REFUND_PENDING },
        { orderId, status: PaymentStatus.REFUNDED },
        { orderId, status: PaymentStatus.PARTIALLY_REFUNDED },
      ],
    });

    if (successfulPayment) {
      throw new ConflictException('Order already has a successful payment');
    }

    // 3. Idempotency Check
    const existingAttempt = await this.paymentRepo.findOne({
      where: { orderId, idempotencyKey },
    });

    if (existingAttempt) {
      if (existingAttempt.requestPayloadHash !== requestPayloadHash) {
        throw new ConflictException('Idempotency conflict: A request with the same key but different payload was already processed');
      }

      if (existingAttempt.status === PaymentStatus.PENDING) {
        return {
          paymentId: existingAttempt.id,
          providerOrderId: existingAttempt.providerOrderId,
          status: existingAttempt.status,
          paymentMethod: existingAttempt.paymentMethod,
        };
      }
      
      // If it's failed or cancelled, we allow retrying but wait, the client is sending the same idempotency key.
      // Usually, if they want to retry, they should send a *new* idempotency key.
      // If they send the same key for a FAILED attempt, we return the failed attempt result (idempotency rule).
      return {
        paymentId: existingAttempt.id,
        providerOrderId: existingAttempt.providerOrderId,
        status: existingAttempt.status,
        paymentMethod: existingAttempt.paymentMethod,
      };
    }

    // 4. Validate order state for payment
    if (order.status !== OrderStatus.CREATED && order.status !== OrderStatus.PAYMENT_PENDING) {
      throw new ConflictException(`Order cannot accept payment in state ${order.status}`);
    }

    // 5. Create new payment attempt in a transaction
    return this.dataSource.transaction(async (manager) => {
      // Re-fetch order with lock
      const lockedOrder = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedOrder) {
        throw new NotFoundException('Order not found');
      }

      const amountInMinorUnits = MoneyUtil.toMinorUnit(lockedOrder.totalAmount);
      
      let providerOrderId: string | null = null;
      let paymentStatus = PaymentStatus.CREATED;

      if (dto.paymentMethod === PaymentMethod.ONLINE) {
        const session = await this.razorpayProvider.createPaymentSession(
          amountInMinorUnits,
          'INR', // We assume INR for now
          lockedOrder.id,
        );
        providerOrderId = session.providerOrderId;
        paymentStatus = PaymentStatus.PENDING;

        // Transition order to PAYMENT_PENDING if not already
        if (lockedOrder.status === OrderStatus.CREATED) {
          OrderStateMachine.validateTransition(lockedOrder.status, OrderStatus.PAYMENT_PENDING);
          lockedOrder.status = OrderStatus.PAYMENT_PENDING;
          await manager.save(lockedOrder);
        }
      } else if (dto.paymentMethod === PaymentMethod.COD) {
        paymentStatus = PaymentStatus.PENDING;
        // COD immediately transitions to PLACED
        OrderStateMachine.validateTransition(lockedOrder.status, OrderStatus.PAYMENT_PENDING);
        OrderStateMachine.validateTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.PLACED);
        lockedOrder.status = OrderStatus.PLACED;
        await manager.save(lockedOrder);
      }

      const payment = manager.create(Payment, {
        orderId,
        amount: lockedOrder.totalAmount, // numeric(14,2)
        currency: 'INR',
        paymentMethod: dto.paymentMethod,
        provider: 'RAZORPAY',
        providerOrderId: providerOrderId || undefined,
        idempotencyKey,
        requestPayloadHash,
        status: paymentStatus,
      });

      try {
        const savedPayment = await manager.save(payment);
        return {
          paymentId: savedPayment.id,
          providerOrderId: savedPayment.providerOrderId,
          status: savedPayment.status,
          paymentMethod: savedPayment.paymentMethod,
        };
      } catch (error: any) {
        if (error instanceof QueryFailedError && error.message.includes('unique')) {
          // Could be the IDX_unique_successful_payment or idempotencyKey conflict during race
          throw new ConflictException('Concurrent payment initiation conflict');
        }
        throw error;
      }
    });
  }

  async initiateRefund(orderId: string, reason: string): Promise<any> {
    const idempotencyKey = `refund:${orderId}`;

    // Look for existing refund (idempotency check)
    const existingRefund = await this.paymentRepo.findOne({
      where: [
        { orderId, status: PaymentStatus.REFUNDED },
        { orderId, status: PaymentStatus.REFUND_PENDING },
        { orderId, idempotencyKey }
      ],
    });

    if (existingRefund) {
      if (existingRefund.status === PaymentStatus.REFUNDED || existingRefund.status === PaymentStatus.REFUND_PENDING) {
        return {
          paymentId: existingRefund.id,
          status: existingRefund.status,
          providerRefundId: existingRefund.providerPaymentId,
        };
      }
      if (existingRefund.idempotencyKey === idempotencyKey && existingRefund.status === PaymentStatus.FAILED) {
        // Can retry a failed refund attempt
      } else {
        throw new ConflictException('Refund already initiated or pending');
      }
    }

    const successfulPayment = await this.paymentRepo.findOne({
      where: { orderId, status: PaymentStatus.CAPTURED },
    });

    if (!successfulPayment) {
      // It might be a COD order or payment is not captured. 
      // If no online payment was captured, there's nothing to refund online.
      return { status: 'NO_ONLINE_REFUND_NEEDED' };
    }

    // Call provider
    const amountInMinorUnits = MoneyUtil.toMinorUnit(successfulPayment.amount);
    
    // We create a new refund record
    const refundPayment = this.paymentRepo.create({
      orderId,
      amount: successfulPayment.amount,
      currency: successfulPayment.currency,
      paymentMethod: successfulPayment.paymentMethod,
      provider: successfulPayment.provider,
      idempotencyKey,
      status: PaymentStatus.CREATED,
    });

    const savedRefund = await this.paymentRepo.save(refundPayment);

    try {
      const refundResult = await this.razorpayProvider.refundPayment(
        successfulPayment.providerOrderId!,
        amountInMinorUnits,
        reason,
      );

      savedRefund.providerPaymentId = refundResult.providerRefundId;
      savedRefund.status = refundResult.status;
      await this.paymentRepo.save(savedRefund);

      return {
        paymentId: savedRefund.id,
        status: savedRefund.status,
        providerRefundId: savedRefund.providerPaymentId,
      };
    } catch (error) {
      savedRefund.status = PaymentStatus.FAILED;
      await this.paymentRepo.save(savedRefund);
      throw error;
    }
  }

  private generatePayloadHash(orderId: string, dto: InitiatePaymentDto): string {
    const payloadString = JSON.stringify({ orderId, paymentMethod: dto.paymentMethod });
    return crypto.createHash('sha256').update(payloadString).digest('hex');
  }
}
