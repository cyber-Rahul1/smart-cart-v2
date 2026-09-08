import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { Cart } from '../carts/entities/cart.entity.js';
import { Address } from '../users/entities/address.entity.js';
import { ShopsModule } from '../shops/shops.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, Address]),
    ShopsModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
