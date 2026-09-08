import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { TrackingService } from './tracking.service.js';
import { TrackingGateway } from './tracking.gateway.js';
import { TrackingProcessor } from './tracking.processor.js';
import { TrackingCron } from './tracking.cron.js';
import { RiderLocation } from '../logistics/entities/rider-location.entity.js';
import { Delivery } from '../logistics/entities/delivery.entity.js';
import { Order } from '../orders/entities/order.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiderLocation, Delivery, Order]),
    BullModule.registerQueue({
      name: 'persist-location',
    }),
    JwtModule.register({}),
  ],
  providers: [
    TrackingService,
    TrackingGateway,
    TrackingProcessor,
    TrackingCron,
  ],
  exports: [TrackingService, TrackingGateway],
})
export class TrackingModule {}
