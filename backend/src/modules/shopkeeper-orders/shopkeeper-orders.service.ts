import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from '../orders/entities/order.entity.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { OutboxEvent, OutboxEventStatus } from '../outbox/entities/outbox-event.entity.js';
import { OrderStatus } from '../orders/enums/order-status.enum.js';

@Injectable()
export class ShopkeeperOrdersService {
  private readonly logger = new Logger(ShopkeeperOrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Verify that the authenticated shopkeeper owns the given shop.
   * This is a server-side ownership check in addition to the OwnershipGuard on the controller.
   */
  private async verifyShopOwnership(shopkeeperId: string, shopId: string): Promise<void> {
    const count = await this.shopRepository.count({ where: { id: shopId, ownerId: shopkeeperId } });
    if (count === 0) {
      throw new ForbiddenException('You do not have permission to access this shop');
    }
  }

  /**
   * Verify that the order belongs to the given shop.
   */
  private async findOrderForShop(orderId: string, shopId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, shopId },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found in this shop');
    }
    return order;
  }

  async getOrders(shopkeeperId: string, shopId: string, status?: OrderStatus) {
    await this.verifyShopOwnership(shopkeeperId, shopId);

    const where: any = { shopId };
    if (status) {
      where.status = status;
    }

    return this.orderRepository.find({
      where,
      order: { createdAt: 'DESC' },
      relations: { items: true },
    });
  }

  async getOrder(shopkeeperId: string, shopId: string, orderId: string) {
    await this.verifyShopOwnership(shopkeeperId, shopId);
    return this.findOrderForShop(orderId, shopId);
  }

  /**
   * Execute an atomic state transition with audit logging and optional outbox events.
   * The UPDATE enforces both the expected `status` AND `version` in the WHERE clause.
   */
  private async executeAtomicTransition(
    shopkeeperId: string,
    shopId: string,
    orderId: string,
    expectedStatus: OrderStatus,
    newStatus: OrderStatus,
    actionName: string,
    extraOutboxEvents: Partial<OutboxEvent>[] = [],
  ): Promise<Order> {
    await this.verifyShopOwnership(shopkeeperId, shopId);
    const order = await this.findOrderForShop(orderId, shopId);

    // Application-level guard for clearer error messages before the atomic update
    if (order.status !== expectedStatus) {
      throw new BadRequestException(
        `Cannot ${actionName}: order is in state ${order.status}, expected ${expectedStatus}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Atomic update: enforce BOTH expected version AND expected status
      const updateResult = await queryRunner.manager.update(
        Order,
        {
          id: order.id,
          version: order.version,
          status: expectedStatus,
        },
        {
          status: newStatus,
        },
      );

      if (updateResult.affected === 0) {
        throw new ConflictException(
          'Order state was modified by another request. Please refresh and try again.',
        );
      }

      // 2. Audit Log (reusing existing AuditLog entity)
      const auditLog = queryRunner.manager.create(AuditLog, {
        entityType: 'Order',
        entityId: order.id,
        action: actionName,
        previousState: { status: order.status, shopId },
        newState: { status: newStatus, shopId },
        performedBy: shopkeeperId,
      });
      await queryRunner.manager.save(auditLog);

      // 3. Outbox Events (e.g., dispatch trigger for READY_FOR_PICKUP)
      for (const outboxData of extraOutboxEvents) {
        const outboxEvent = queryRunner.manager.create(OutboxEvent, outboxData);
        await queryRunner.manager.save(outboxEvent);
      }

      await queryRunner.commitTransaction();

      return {
        ...order,
        status: newStatus,
        version: order.version + 1,
      } as Order;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async acceptOrder(shopkeeperId: string, shopId: string, orderId: string): Promise<Order> {
    return this.executeAtomicTransition(
      shopkeeperId, shopId, orderId,
      OrderStatus.PLACED, OrderStatus.SHOP_ACCEPTED,
      'SHOP_ACCEPTED',
    );
  }

  async rejectOrder(shopkeeperId: string, shopId: string, orderId: string, reason?: string): Promise<Order> {
    return this.executeAtomicTransition(
      shopkeeperId, shopId, orderId,
      OrderStatus.PLACED, OrderStatus.REJECTED,
      'SHOP_REJECTED',
    );
  }

  async prepareOrder(shopkeeperId: string, shopId: string, orderId: string): Promise<Order> {
    return this.executeAtomicTransition(
      shopkeeperId, shopId, orderId,
      OrderStatus.SHOP_ACCEPTED, OrderStatus.PREPARING,
      'SHOP_PREPARING',
    );
  }

  async readyOrder(shopkeeperId: string, shopId: string, orderId: string): Promise<Order> {
    const dispatchOutboxEvent: Partial<OutboxEvent> = {
      type: 'READY_FOR_PICKUP',
      payload: { orderId, shopId },
      status: OutboxEventStatus.PENDING,
      idempotencyKey: `dispatch_ready_${orderId}`,
    };

    return this.executeAtomicTransition(
      shopkeeperId, shopId, orderId,
      OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP,
      'SHOP_READY_FOR_PICKUP',
      [dispatchOutboxEvent],
    );
  }
}
