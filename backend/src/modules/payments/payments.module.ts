import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { RazorpayProvider } from './providers/razorpay.provider.js';
import { ReconciliationService } from './reconciliation.service.js';
import { Payment } from './entities/payment.entity.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';
import { Order } from '../orders/entities/order.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, WebhookEvent, Order])],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, WebhooksService, RazorpayProvider, ReconciliationService],
  exports: [PaymentsService, RazorpayProvider],
})
export class PaymentsModule {}
