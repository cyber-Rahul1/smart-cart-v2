import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../enums/order-status.enum.js';

export class CreateOrderDto {
  @ApiProperty({ description: 'The ID of the address to deliver to' })
  @IsUUID()
  @IsNotEmpty()
  addressId: string;

  @ApiProperty({ description: 'Unique idempotency key for this order request' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotencyKey: string;
}

export class OrderItemResponseDto {
  @ApiProperty({ description: 'The unique ID of the order item' })
  id: string;

  @ApiProperty({ description: 'The ID of the product (if still available)' })
  productId: string | null;

  @ApiProperty({ description: 'Snapshot of the product name at the time of order' })
  productNameSnapshot: string;

  @ApiProperty({ description: 'Snapshot of the unit price at the time of order' })
  unitPriceSnapshot: number;

  @ApiProperty({ description: 'Quantity ordered' })
  quantity: number;

  @ApiProperty({ description: 'Line total calculated as unitPrice * quantity' })
  lineTotal: number;
}

export class OrderResponseDto {
  @ApiProperty({ description: 'The unique UUID of the order' })
  id: string;

  @ApiProperty({ description: 'The ID of the shop this order belongs to' })
  shopId: string;

  @ApiProperty({ description: 'The current status of the order', enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ description: 'Subtotal of the order items' })
  subtotal: number;

  @ApiProperty({ description: 'Delivery fee' })
  deliveryFee: number;

  @ApiProperty({ description: 'Total amount (subtotal + deliveryFee)' })
  totalAmount: number;

  @ApiProperty({ description: 'Snapshot of the delivery address label' })
  deliveryAddressLabel: string;

  @ApiProperty({ description: 'Snapshot of the delivery address line' })
  deliveryAddressLine: string;

  @ApiProperty({ description: 'Order cancellation reason, if applicable' })
  cancellationReason: string | null;

  @ApiProperty({ description: 'When the order was cancelled' })
  cancelledAt: Date | null;

  @ApiProperty({ description: 'When the order was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the order was last updated' })
  updatedAt: Date;

  @ApiProperty({ description: 'The list of items in the order', type: [OrderItemResponseDto] })
  items?: OrderItemResponseDto[];

  @ApiProperty({ description: 'The ID of the active delivery, if assigned', required: false, nullable: true })
  deliveryId?: string | null;
}
