import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { Review } from '../audit/entities/review.entity.js';
import { Delivery } from '../logistics/entities/delivery.entity.js';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity.js';
import { Cart } from '../carts/entities/cart.entity.js';
import { CartItem } from '../carts/entities/cart-item.entity.js';
import { Address } from '../users/entities/address.entity.js';
import { ShopAvailabilityService } from '../shops/services/shop-availability.service.js';
import { OrderStatus } from './enums/order-status.enum.js';
import { CreateOrderDto, OrderResponseDto } from './dto/orders.dto.js';
import { OrderStateMachine } from './orders.state-machine.js';
import { MoneyUtil } from '../../core/utils/money.util.js';
import { ProductStatus } from '../products/enums/product-status.enum.js';
import * as crypto from 'crypto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly shopAvailabilityService: ShopAvailabilityService,
    private readonly dataSource: DataSource,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    try {
      const payloadString = JSON.stringify({ addressId: dto.addressId });
      const requestPayloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

      // Early idempotency check for sequential duplicate requests
      const existing = await this.orderRepo.findOne({
        where: { customerId: userId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        if (existing.requestPayloadHash !== requestPayloadHash) {
          throw new ConflictException('Idempotency key already used for a different request');
        }
        return this.getOrder(userId, existing.id);
      }

      const orderId = await this.dataSource.transaction(async (manager) => {
        // 1. Fetch the Cart with items and product details inside the transaction
        const cart = await manager.findOne(Cart, {
          where: { userId },
          relations: { items: { product: true }, shop: true },
        });

        if (!cart || cart.items.length === 0) {
          throw new BadRequestException('Cart is empty');
        }

        if (!cart.shop) {
          throw new BadRequestException('Cart does not belong to a valid shop');
        }

        const shop = cart.shop;

        // 2. Fetch the Address
        const address = await manager.findOne(Address, { where: { id: dto.addressId } });
        if (!address) {
          throw new NotFoundException('Address not found');
        }
        if (address.userId !== userId) {
          throw new BadRequestException('Address does not belong to the authenticated user');
        }

        // 3. Shop Availability Validation
        const isShopAvailable = await this.shopAvailabilityService.isShopAvailable(shop.id);
        if (!isShopAvailable) {
          throw new BadRequestException('Shop is currently not accepting orders');
        }

        // 4. Product Availability and Authoritative Price Calculation
        let subtotalCents = 0;
        const orderItems: Partial<OrderItem>[] = [];

        for (const item of cart.items) {
          const product = item.product;
          
          if (!product || product.status !== ProductStatus.AVAILABLE) {
            throw new BadRequestException(`Product ${product?.name || 'Unknown'} is not available`);
          }
          if (product.shopId !== shop.id) {
            throw new BadRequestException(`Product ${product.name} does not belong to the cart's shop`);
          }

          const unitPriceCents = MoneyUtil.toMinorUnit(product.price);
          const lineTotalCents = unitPriceCents * item.quantity;
          subtotalCents += lineTotalCents;

          orderItems.push({
            productId: product.id,
            productNameSnapshot: product.name,
            unitPriceSnapshot: MoneyUtil.toDecimal(unitPriceCents),
            quantity: item.quantity,
            lineTotal: MoneyUtil.toDecimal(lineTotalCents),
          });
        }

        const subtotal = MoneyUtil.toDecimal(subtotalCents);
        const minimumOrder = Number(shop.minimumOrder);
        
        if (subtotal < minimumOrder) {
          throw new BadRequestException(`Subtotal is less than the shop's minimum order amount of ${minimumOrder}`);
        }

        // 5. Address Distance Validation (PostGIS)
        const result = await manager.query(
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
        if (distanceMeters > shop.deliveryRadius) {
          throw new BadRequestException('Delivery address is outside the shop delivery radius');
        }

        // 6. Create Order Entity
        const order = manager.create(Order, {
          customerId: userId,
          shopId: shop.id,
          idempotencyKey: dto.idempotencyKey,
          requestPayloadHash,
          status: OrderStatus.CREATED,
          subtotal,
          deliveryFee: 0,
          totalAmount: MoneyUtil.toDecimal(subtotalCents),
          deliveryAddressLabel: address.label,
          deliveryAddressLine: address.addressLine,
          deliveryLocation: address.location,
          items: orderItems as any,
        });

        // 7. Insert Order (this will throw unique constraint violation if idempotency key conflicts)
        const savedOrder = await manager.save(Order, order);

        // 8. Create Audit Log
        const auditLog = manager.create(AuditLog, {
          entityType: 'Order',
          entityId: savedOrder.id,
          action: 'CREATED',
          newState: { status: savedOrder.status },
          performedBy: userId,
        });
        await manager.save(AuditLog, auditLog);

        // 9. Clear Cart Items and Reset Shop
        await manager.delete(CartItem, { cartId: cart.id });
        await manager.update(Cart, { id: cart.id }, { shopId: null });

        return savedOrder.id;
      });

      return this.getOrder(userId, orderId);
    } catch (error: any) {
      // Catch PostgreSQL unique constraint violation for idempotency
      if (error.code === '23505' && error.constraint === 'IDX_463446ea64e2ea8c5b29c0a3a2') {
        // Concurrency / duplicate request. The other transaction succeeded. 
        // We will retrieve and return the successfully committed order.
        const existingOrder = await this.orderRepo.findOne({
          where: { customerId: userId, idempotencyKey: dto.idempotencyKey },
        });
        if (!existingOrder) {
          throw new ConflictException('Idempotency conflict occurred, but existing order could not be retrieved.');
        }
        return this.getOrder(userId, existingOrder.id);
      }
      throw error;
    }
  }

  async getOrders(userId: string): Promise<OrderResponseDto[]> {
    const orders = await this.orderRepo.find({
      where: { customerId: userId },
      relations: { items: true, delivery: true } as any,
      order: { createdAt: 'DESC' },
    });
    return orders.map(this.mapToDto);
  }

  async getOrder(userId: string, orderId: string): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, customerId: userId },
      relations: { items: true, delivery: true } as any,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.mapToDto(order);
  }

  async cancelOrder(userId: string, orderId: string, reason?: string): Promise<OrderResponseDto> {
    // 1. Fetch current order
    const order = await this.orderRepo.findOne({ where: { id: orderId, customerId: userId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // 2. Validate cancellation allowed
    OrderStateMachine.validateCustomerCancellation(order.status);
    const newStatus = OrderStatus.CANCELLED;
    OrderStateMachine.validateTransition(order.status, newStatus);

    // 3. Perform versioned update for concurrency control inside a transaction
    await this.dataSource.transaction(async (manager) => {
      const updateResult = await manager.update(
        Order,
        { id: orderId, version: order.version },
        { 
          status: newStatus, 
          cancelledAt: new Date(),
          cancellationReason: reason || 'Customer requested cancellation' 
        }
      );

      if (updateResult.affected === 0) {
        throw new ConflictException('The order state was modified by another request. Please try again.');
      }

      // 4. Audit Log
      const auditLog = manager.create(AuditLog, {
        entityType: 'Order',
        entityId: order.id,
        action: 'STATUS_CHANGED',
        previousState: { status: order.status },
        newState: { status: newStatus },
        performedBy: userId,
      });
      await manager.save(AuditLog, auditLog);

      // 5. Emit refund outbox event
      const refundEvent = manager.create(OutboxEvent, {
        type: 'refund.initiated',
        payload: { orderId: order.id, reason: reason || 'Customer requested cancellation' },
      });
      await manager.save(OutboxEvent, refundEvent);

      // We also might want to emit order.status.changed for notifications
      const notificationEvent = manager.create(OutboxEvent, {
        type: 'order.status.changed',
        payload: { orderId: order.id, newStatus: newStatus },
      });
      await manager.save(OutboxEvent, notificationEvent);
    });

    return this.getOrder(userId, orderId);
  }

  async addReview(userId: string, orderId: string, dto: { shopRating?: number; riderRating?: number; comment?: string }): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId, customerId: userId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Can only review delivered orders');
    }

    // Try inserting review to handle idempotency via DB constraint
    try {
      await this.dataSource.transaction(async (manager) => {
        let riderId = null;
        // Fetch riderId from delivery if provided riderRating
        if (dto.riderRating !== undefined) {
          const delivery = await manager.findOne(Delivery, { where: { orderId: order.id } });
          if (delivery && delivery.riderId) {
            riderId = delivery.riderId;
          }
        }

        const review = manager.create(Review, {
          orderId: order.id,
          customerId: userId,
          shopId: order.shopId,
          shopRating: dto.shopRating,
          riderId: riderId || undefined,
          riderRating: dto.riderRating,
          comment: dto.comment,
        } as any);

        await manager.save(Review, review);

        // Optionally, one could trigger an OutboxEvent here to asynchronously update the shop/rider average rating
        // But for simplicity, we'll assume a batch process or DB view handles average ratings,
        // or we just emit an event.
        const updateAvgEvent = manager.create(OutboxEvent, {
          type: 'review.submitted',
          payload: { orderId: order.id, shopId: order.shopId, riderId },
        });
        await manager.save(OutboxEvent, updateAvgEvent);
      });
    } catch (error: any) {
      if (error.code === '23505') { // Postgres unique violation
        throw new ConflictException('Order already reviewed');
      }
      throw error;
    }
  }

  private mapToDto(order: Order): OrderResponseDto {
    return {
      id: order.id,
      shopId: order.shopId,
      status: order.status,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      totalAmount: Number(order.totalAmount),
      deliveryAddressLabel: order.deliveryAddressLabel,
      deliveryAddressLine: order.deliveryAddressLine,
      cancellationReason: order.cancellationReason,
      cancelledAt: order.cancelledAt,
      deliveryId: (order as any).delivery?.id || null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items?.map(item => ({
        id: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        unitPriceSnapshot: Number(item.unitPriceSnapshot),
        quantity: item.quantity,
        lineTotal: Number(item.lineTotal),
      })),
    };
  }
}
