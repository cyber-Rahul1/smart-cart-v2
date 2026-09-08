import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, type Relation } from 'typeorm';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import type { Order } from '../../orders/entities/order.entity.js';
import type { Shop } from '../../shops/entities/shop.entity.js';

@Entity('settlement_instructions')
@Index(['providerAccountId', 'status'])
@Index(['orderId'])
@Index(['idempotencyKey'], { unique: true })
export class SettlementInstruction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  orderId: string;

  @ManyToOne('Order', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column()
  providerAccountId: string;

  @ManyToOne('Shop', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'providerAccountId' })
  providerAccount: Relation<Shop>; // Using shop as the provider account reference for now

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  customerGrossAmount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  providerGrossAmount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  platformCommission: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  paymentGatewayFees: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  discounts: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  refunds: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  adjustments: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  providerNetSettlement: number;

  @Column({ type: 'enum', enum: SettlementInstructionStatus, default: SettlementInstructionStatus.PENDING })
  status: SettlementInstructionStatus;

  @Column({ nullable: true })
  providerTransferId: string;

  @Column()
  idempotencyKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
