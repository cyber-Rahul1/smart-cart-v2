import { OrderStatus } from './enums/order-status.enum.js';
import { BadRequestException } from '@nestjs/common';

export class OrderStateMachine {
  private static readonly validTransitions: Record<OrderStatus, Set<OrderStatus>> = {
    [OrderStatus.CREATED]: new Set([OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED]),
    [OrderStatus.PAYMENT_PENDING]: new Set([OrderStatus.PLACED, OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED]),
    [OrderStatus.PLACED]: new Set([OrderStatus.SHOP_ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED]),
    [OrderStatus.SHOP_ACCEPTED]: new Set([OrderStatus.PREPARING, OrderStatus.CANCELLED]),
    [OrderStatus.PREPARING]: new Set([OrderStatus.READY_FOR_PICKUP]),
    [OrderStatus.READY_FOR_PICKUP]: new Set([OrderStatus.RIDER_ASSIGNED]),
    [OrderStatus.RIDER_ASSIGNED]: new Set([OrderStatus.RIDER_ACCEPTED]),
    [OrderStatus.RIDER_ACCEPTED]: new Set([OrderStatus.PICKED_UP]),
    [OrderStatus.PICKED_UP]: new Set([OrderStatus.OUT_FOR_DELIVERY]),
    [OrderStatus.OUT_FOR_DELIVERY]: new Set([OrderStatus.ARRIVING]),
    [OrderStatus.ARRIVING]: new Set([OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED]),
    [OrderStatus.DELIVERED]: new Set([OrderStatus.DISPUTED]),

    // Terminal or exception states that don't transition further in normal flow
    [OrderStatus.PAYMENT_FAILED]: new Set(),
    [OrderStatus.REJECTED]: new Set(),
    [OrderStatus.CANCELLED]: new Set([OrderStatus.REFUNDED]),
    [OrderStatus.DELIVERY_FAILED]: new Set([OrderStatus.REFUNDED]),
    [OrderStatus.REFUNDED]: new Set(),
    [OrderStatus.DISPUTED]: new Set([OrderStatus.REFUNDED]),
  };

  /**
   * Allowed states from which a customer can cancel an order.
   * Customer cancellation is only allowed BEFORE 'PREPARING'.
   */
  private static readonly CUSTOMER_CANCELLABLE_STATES = new Set([
    OrderStatus.CREATED,
    OrderStatus.PAYMENT_PENDING,
    OrderStatus.PLACED,
    OrderStatus.SHOP_ACCEPTED,
  ]);

  /**
   * Validates if a transition is legal.
   */
  static validateTransition(currentStatus: OrderStatus, nextStatus: OrderStatus): void {
    const allowed = this.validTransitions[currentStatus]?.has(nextStatus);
    if (!allowed) {
      throw new BadRequestException(`Invalid order state transition from ${currentStatus} to ${nextStatus}`);
    }
  }

  /**
   * Validates if a customer is allowed to cancel the order.
   */
  static validateCustomerCancellation(currentStatus: OrderStatus): void {
    if (!this.CUSTOMER_CANCELLABLE_STATES.has(currentStatus)) {
      throw new BadRequestException(`Order cannot be cancelled by customer in state ${currentStatus}`);
    }
  }
}
