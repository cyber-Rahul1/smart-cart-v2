import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { Cart } from '../carts/entities/cart.entity.js';
import { CartItem } from '../carts/entities/cart-item.entity.js';
import { Address } from '../users/entities/address.entity.js';
import { ShopsModule } from '../shops/shops.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, AuditLog, Cart, CartItem, Address]),
    ShopsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
