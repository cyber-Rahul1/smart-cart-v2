import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from './entities/shop.entity.js';
import { ShopHours } from './entities/shop-hours.entity.js';
import { ShopsService } from './services/shops.service.js';
import { ShopAvailabilityService } from './services/shop-availability.service.js';
import { ShopkeeperShopsController } from './controllers/shopkeeper-shops.controller.js';
import { ShopsController } from './controllers/shops.controller.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Shop, ShopHours, AuditLog])],
  controllers: [ShopkeeperShopsController, ShopsController],
  providers: [ShopsService, ShopAvailabilityService],
  exports: [ShopsService, ShopAvailabilityService],
})
export class ShopsModule {}
