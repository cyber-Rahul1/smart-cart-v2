import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Delivery } from './entities/delivery.entity.js';
import { DeliveryOffer } from './entities/delivery-offer.entity.js';
import { RiderLocation } from './entities/rider-location.entity.js';
import { DispatchService } from './services/dispatch.service.js';
import { OffersService } from './services/offers.service.js';
import { RiderDeliveriesService } from './services/rider-deliveries.service.js';
import { DispatchProcessor } from './jobs/dispatch.processor.js';
import { RiderOffersController } from './controllers/rider-offers.controller.js';
import { RiderDeliveriesController } from './controllers/rider-deliveries.controller.js';
import { DISPATCH_QUEUE } from './constants/logistics.constants.js';
import { TrackingModule } from '../tracking/tracking.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, DeliveryOffer, RiderLocation]),
    BullModule.registerQueue({
      name: DISPATCH_QUEUE,
    }),
    TrackingModule,
  ],
  controllers: [RiderOffersController, RiderDeliveriesController],
  providers: [DispatchService, OffersService, RiderDeliveriesService, DispatchProcessor],
  exports: [DispatchService, OffersService, RiderDeliveriesService],
})
export class LogisticsModule {}
