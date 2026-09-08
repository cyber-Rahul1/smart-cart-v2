import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartsService } from './carts.service.js';
import { CartsController } from './carts.controller.js';
import { Cart } from './entities/cart.entity.js';
import { CartItem } from './entities/cart-item.entity.js';
import { ShopsModule } from '../shops/shops.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem]),
    ShopsModule,
  ],
  providers: [CartsService],
  controllers: [CartsController],
  exports: [CartsService],
})
export class CartsModule {}
