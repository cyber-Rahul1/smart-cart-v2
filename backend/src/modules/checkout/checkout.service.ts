import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cart } from '../carts/entities/cart.entity.js';
import { Address } from '../users/entities/address.entity.js';
import { ProductStatus } from '../products/enums/product-status.enum.js';
import { ShopAvailabilityService } from '../shops/services/shop-availability.service.js';
import { CheckoutPreviewRequestDto, CheckoutQuoteDto } from './dto/checkout.dto.js';
import { CheckoutErrorCode } from './enums/checkout-error.enum.js';
import { MoneyUtil } from '../../core/utils/money.util.js';
import { randomUUID } from 'crypto';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
    private readonly shopAvailabilityService: ShopAvailabilityService,
    private readonly dataSource: DataSource,
  ) {}

  async prepareCheckout(userId: string, dto: CheckoutPreviewRequestDto): Promise<CheckoutQuoteDto> {
    const validationErrors: { code: string; message: string; details?: any }[] = [];

    // 1. Resolve Address and verify ownership
    const address = await this.addressRepo.findOne({ where: { id: dto.addressId } });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    if (address.userId !== userId) {
      throw new BadRequestException('Address does not belong to the authenticated user');
    }

    // 2. Load Cart with Items, Product, and Shop
    const cart = await this.cartRepo.findOne({
      where: { userId },
      relations: { items: { product: true }, shop: true },
    });

    if (!cart || cart.items.length === 0) {
      validationErrors.push({
        code: CheckoutErrorCode.CART_EMPTY,
        message: 'Cart is empty',
      });
      return this.buildFailedQuote(validationErrors);
    }

    if (!cart.shop) {
      validationErrors.push({
        code: CheckoutErrorCode.SHOP_UNAVAILABLE,
        message: 'Cart shop is invalid',
      });
      return this.buildFailedQuote(validationErrors);
    }

    const shop = cart.shop;

    // 3. Verify Shop Availability
    const isShopAvailable = await this.shopAvailabilityService.isShopAvailable(shop.id);
    if (!isShopAvailable) {
      validationErrors.push({
        code: CheckoutErrorCode.SHOP_UNAVAILABLE,
        message: 'Shop is currently not accepting orders',
      });
    }

    // 4. Verify Product Availability & Calculate Subtotal
    let subtotalCents = 0;
    const items = [];

    for (const item of cart.items) {
      const product = item.product;
      const isAvailable = product.status === ProductStatus.AVAILABLE;
      
      if (!isAvailable) {
        validationErrors.push({
          code: CheckoutErrorCode.PRODUCT_UNAVAILABLE,
          message: `Product ${product.name} is not available`,
          details: { productId: product.id },
        });
      }

      if (product.shopId !== shop.id) {
        validationErrors.push({
          code: CheckoutErrorCode.INVALID_CART_ITEM,
          message: `Product ${product.name} does not belong to the cart's shop`,
          details: { productId: product.id },
        });
      }

      const unitPriceCents = MoneyUtil.toMinorUnit(product.price);
      const lineTotalCents = unitPriceCents * item.quantity;
      
      if (isAvailable) {
        subtotalCents += lineTotalCents;
      }

      items.push({
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPrice: Number(product.price),
        lineTotal: MoneyUtil.toDecimal(lineTotalCents),
        isAvailable,
      });
    }

    const subtotal = MoneyUtil.toDecimal(subtotalCents);
    const minimumOrder = Number(shop.minimumOrder);
    const minimumOrderSatisfied = subtotal >= minimumOrder;

    if (!minimumOrderSatisfied) {
      validationErrors.push({
        code: CheckoutErrorCode.MINIMUM_ORDER_NOT_MET,
        message: `Subtotal is less than the shop's minimum order amount of ${minimumOrder}`,
        details: { subtotal, minimumOrder },
      });
    }

    // 5. PostGIS Distance Calculation
    // Extract geometry object to query string representation
    const result = await this.dataSource.query(
      `SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
      ) as distance`,
      [
        address.location.coordinates[0], 
        address.location.coordinates[1],
        shop.location.coordinates[0], 
        shop.location.coordinates[1]
      ]
    );

    const distanceMeters = Math.round(result[0].distance);
    const deliveryEligible = distanceMeters <= shop.deliveryRadius;

    if (!deliveryEligible) {
      validationErrors.push({
        code: CheckoutErrorCode.OUTSIDE_DELIVERY_RADIUS,
        message: 'Delivery address is outside the shop delivery radius',
        details: { distanceMeters, deliveryRadius: shop.deliveryRadius },
      });
    }

    return {
      quoteId: randomUUID(),
      generatedAt: new Date(),
      cartId: cart.id,
      shop: {
        id: shop.id,
        name: shop.name,
        minimumOrder,
        deliveryRadius: shop.deliveryRadius,
      },
      address: {
        id: address.id,
        label: address.label,
        distanceMeters,
      },
      items,
      subtotal,
      minimumOrderSatisfied,
      deliveryEligible,
      ...(validationErrors.length > 0 && { validationErrors }),
    };
  }

  private buildFailedQuote(validationErrors: any[]): CheckoutQuoteDto {
    return {
      quoteId: randomUUID(),
      generatedAt: new Date(),
      cartId: '',
      shop: {
        id: '',
        name: '',
        minimumOrder: 0,
        deliveryRadius: 0,
      },
      address: {
        id: '',
        label: '',
        distanceMeters: 0,
      },
      items: [],
      subtotal: 0,
      minimumOrderSatisfied: false,
      deliveryEligible: false,
      validationErrors,
    };
  }
}
