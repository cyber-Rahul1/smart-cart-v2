import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cart } from './entities/cart.entity.js';
import { CartItem } from './entities/cart-item.entity.js';
import { AddToCartDto, UpdateCartItemDto, MAX_CART_QUANTITY } from './dto/cart.dto.js';
import { Product } from '../products/entities/product.entity.js';
import { ProductStatus } from '../products/enums/product-status.enum.js';
import { ShopAvailabilityService } from '../shops/services/shop-availability.service.js';
import { MoneyUtil } from '../../core/utils/money.util.js';

@Injectable()
export class CartsService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    private readonly dataSource: DataSource,
    private readonly shopAvailabilityService: ShopAvailabilityService,
  ) {}

  async getCart(userId: string) {
    const cart = await this.cartRepo.findOne({
      where: { userId },
      relations: { items: { product: true }, shop: true },
    });

    if (!cart) {
      return {
        id: null,
        shop: null,
        items: [],
        subtotal: 0,
        minimumOrder: 0,
        remainingAmount: 0,
        itemCount: 0,
        totalQuantity: 0,
      };
    }

    let subtotalCents = 0;
    let totalQuantity = 0;

    const items = cart.items.map(item => {
      const product = item.product;
      const isAvailable = product.status === ProductStatus.AVAILABLE;
      
      const unitPriceCents = MoneyUtil.toMinorUnit(product.price);
      const lineTotalCents = unitPriceCents * item.quantity;
      
      if (isAvailable) {
        subtotalCents += lineTotalCents;
      }
      totalQuantity += item.quantity;

      return {
        id: item.id,
        productId: product.id,
        name: product.name,
        image: product.image,
        quantity: item.quantity,
        unitPrice: Number(product.price),
        lineTotal: MoneyUtil.toDecimal(lineTotalCents),
        isAvailable,
        status: product.status,
      };
    });

    const subtotal = MoneyUtil.toDecimal(subtotalCents);
    const minimumOrder = cart.shop ? Number(cart.shop.minimumOrder) : 0;
    const remainingAmount = Math.max(0, minimumOrder - subtotal);

    return {
      id: cart.id,
      shop: cart.shop ? {
        id: cart.shop.id,
        name: cart.shop.name,
        minimumOrder,
      } : null,
      items,
      subtotal,
      minimumOrder,
      remainingAmount,
      itemCount: items.length,
      totalQuantity,
    };
  }

  async addItem(userId: string, dto: AddToCartDto) {
    await this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, { where: { id: dto.productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }

      if (product.status !== ProductStatus.AVAILABLE) {
        throw new BadRequestException('Product is not available for purchase');
      }

      const isShopAvailable = await this.shopAvailabilityService.isShopAvailable(product.shopId);
      if (!isShopAvailable) {
        throw new BadRequestException('Shop is currently not accepting orders');
      }

      let cart = await manager.findOne(Cart, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!cart) {
        cart = manager.create(Cart, { userId, shopId: product.shopId });
        cart = await manager.save(Cart, cart);
      } else {
        if (!cart.shopId) {
          cart.shopId = product.shopId;
          cart = await manager.save(Cart, cart);
        } else if (cart.shopId !== product.shopId) {
          throw new ConflictException('Cart contains items from a different shop. Clear your cart first.');
        }
      }

      // Upsert logic for concurrency
      const existingItem = await manager.findOne(CartItem, {
        where: { cartId: cart.id, productId: product.id },
        lock: { mode: 'pessimistic_write' }
      });

      if (existingItem) {
        const newQuantity = existingItem.quantity + dto.quantity;
        if (newQuantity > MAX_CART_QUANTITY) {
          throw new BadRequestException(`Cannot exceed maximum quantity of ${MAX_CART_QUANTITY}`);
        }
        existingItem.quantity = newQuantity;
        await manager.save(CartItem, existingItem);
      } else {
        const newItem = manager.create(CartItem, {
          cartId: cart.id,
          productId: product.id,
          quantity: dto.quantity,
        });
        await manager.save(CartItem, newItem);
      }
    });

    return this.getCart(userId);
  }

  async updateItemQuantity(userId: string, cartItemId: string, dto: UpdateCartItemDto) {
    const cartItem = await this.cartItemRepo.findOne({
      where: { id: cartItemId },
      relations: { cart: true },
    });

    if (!cartItem || cartItem.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    if (dto.quantity === 0) {
      await this.cartItemRepo.delete({ id: cartItemId });
    } else {
      cartItem.quantity = dto.quantity;
      await this.cartItemRepo.save(cartItem);
    }

    return this.getCart(userId);
  }

  async removeItem(userId: string, cartItemId: string) {
    const cartItem = await this.cartItemRepo.findOne({
      where: { id: cartItemId },
      relations: { cart: true },
    });

    if (!cartItem || cartItem.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartItemRepo.delete({ id: cartItemId });
    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const cart = await manager.findOne(Cart, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!cart) {
        return;
      }

      // Delete all cart items for this cart
      await manager.delete(CartItem, { cartId: cart.id });

      // Reset shop association
      cart.shopId = null;
      await manager.save(Cart, cart);
    });

    return this.getCart(userId);
  }
}
