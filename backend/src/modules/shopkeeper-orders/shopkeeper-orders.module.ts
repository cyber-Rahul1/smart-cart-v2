import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopkeeperOrdersController } from './shopkeeper-orders.controller.js';
import { ShopkeeperOrdersService } from './shopkeeper-orders.service.js';
import { Order } from '../orders/entities/order.entity.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Shop, AuditLog, OutboxEvent])
  ],
  controllers: [ShopkeeperOrdersController],
  providers: [ShopkeeperOrdersService],
})
export class ShopkeeperOrdersModule {}
