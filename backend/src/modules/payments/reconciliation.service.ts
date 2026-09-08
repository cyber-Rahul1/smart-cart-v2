import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { Payment } from './entities/payment.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { RazorpayProvider } from './providers/razorpay.provider.js';
import { PaymentStatus } from './enums/payment-status.enum.js';
import { OrderStatus } from '../orders/enums/order-status.enum.js';
import { OrderStateMachine } from '../orders/orders.state-machine.js';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly razorpayProvider: RazorpayProvider,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleReconciliation() {
    this.logger.log('Starting payment reconciliation...');

    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - 15);

    const pendingPayments = await this.paymentRepo.find({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: LessThan(thresholdTime), // Only check payments older than 15 mins
        provider: 'RAZORPAY',
      },
      take: 50,
    });

    for (const payment of pendingPayments) {
      await this.reconcilePayment(payment);
    }

    this.logger.log('Completed payment reconciliation.');
  }

  private async reconcilePayment(payment: Payment) {
    if (!payment.providerOrderId) {
      return;
    }

    try {
      // Fetch provider status OUTSIDE the transaction
      const providerStatus = await this.razorpayProvider.getPaymentStatus(payment.providerOrderId);

      if (providerStatus === PaymentStatus.PENDING || providerStatus === PaymentStatus.CREATED) {
        // Still pending at provider, do nothing
        return;
      }

      // Open a short transaction to update
      await this.dataSource.transaction(async (manager) => {
        const currentPayment = await manager.findOne(Payment, {
          where: { id: payment.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!currentPayment || currentPayment.status !== PaymentStatus.PENDING) {
          // It might have been updated by a webhook concurrently
          return;
        }

        const currentOrder = await manager.findOne(Order, {
          where: { id: currentPayment.orderId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!currentOrder) return;

        currentPayment.status = providerStatus;
        await manager.save(currentPayment);

        if (providerStatus === PaymentStatus.CAPTURED) {
          if (currentOrder.status === OrderStatus.PAYMENT_PENDING) {
            OrderStateMachine.validateTransition(currentOrder.status, OrderStatus.PLACED);
            currentOrder.status = OrderStatus.PLACED;
            await manager.save(currentOrder);
          }
        } else if (providerStatus === PaymentStatus.FAILED) {
          if (currentOrder.status === OrderStatus.PAYMENT_PENDING) {
            OrderStateMachine.validateTransition(currentOrder.status, OrderStatus.PAYMENT_FAILED);
            currentOrder.status = OrderStatus.PAYMENT_FAILED;
            await manager.save(currentOrder);
          }
        }
      });
      
      this.logger.log(`Reconciled payment ${payment.id} to ${providerStatus}`);
    } catch (error) {
      this.logger.error(`Error reconciling payment ${payment.id}`, error);
    }
  }
}
