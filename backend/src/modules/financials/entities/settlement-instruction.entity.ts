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

  // ---- Phase 12B-8 payout-processing foundation (all additive/nullable) ----

  /** Timestamp when the provider confirmed successful settlement. */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Timestamp of a terminal (FAILED) transition. */
  @Column({ type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  /** Normalized failure class (e.g. COMPLIANCE_BLOCKED, PROVIDER_TIMEOUT). */
  @Column({ type: 'varchar', nullable: true })
  errorCode: string | null;

  /** Structured, secret-free failure context. */
  @Column({ type: 'jsonb', nullable: true })
  errorDetails: Record<string, any> | null;

  /** Dispatch/reconciliation attempt counter (drives retry policy). */
  @Column({ type: 'int', default: 0 })
  retryCount: number;

  /** Last dispatch/reconciliation attempt time (stale-PROCESSING detection). */
  @Column({ type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  /** Sanitized provider response snapshot (never credentials/PII). */
  @Column({ type: 'jsonb', nullable: true })
  providerResponse: Record<string, any> | null;

  @Column()
  idempotencyKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
