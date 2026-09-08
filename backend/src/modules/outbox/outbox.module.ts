import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { OutboxEvent } from './entities/outbox-event.entity.js';
import { OutboxService } from './outbox.service.js';
import { OutboxProcessor } from './outbox.processor.js';
import { LogisticsModule } from '../logistics/logistics.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { OUTBOX_QUEUE } from '../logistics/constants/logistics.constants.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent]),
    BullModule.registerQueue({ name: OUTBOX_QUEUE }),
    LogisticsModule,
    NotificationsModule,
    PaymentsModule,
  ],
  providers: [OutboxService, OutboxProcessor],
  exports: [OutboxService, TypeOrmModule],
})
export class OutboxModule {}
