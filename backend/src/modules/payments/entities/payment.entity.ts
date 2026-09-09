import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, VersionColumn, Index, Check, type Relation } from 'typeorm';
import type { Order } from '../../orders/entities/order.entity.js';
import type { MealAllocation } from '../../community-meals/entities/meal-allocation.entity.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';

@Entity('payments')
@Check('CHK_payment_target', '"orderId" IS NOT NULL OR "allocationId" IS NOT NULL')
@Index('IDX_unique_successful_payment', ['orderId'], {
  unique: true,
  where: "status IN ('AUTHORIZED', 'CAPTURED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED')"
})
@Index('IDX_unique_successful_alloc_payment', ['allocationId'], {
  unique: true,
  where: "status IN ('AUTHORIZED', 'CAPTURED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED')"
})
@Index(['orderId', 'idempotencyKey'], { unique: true })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  orderId: string;

  @ManyToOne('Order', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column({ nullable: true })
  allocationId: string;

  @ManyToOne('MealAllocation', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'allocationId' })
  allocation: Relation<MealAllocation>;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ default: 'INR' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column()
  provider: string; // e.g., 'RAZORPAY'

  @Column({ nullable: true, unique: true })
  providerOrderId: string;

  @Column({ nullable: true, unique: true })
  providerPaymentId: string;

  @Column({ nullable: true })
  idempotencyKey: string;

  @Column({ nullable: true })
  requestPayloadHash: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.CREATED })
  status: PaymentStatus;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
