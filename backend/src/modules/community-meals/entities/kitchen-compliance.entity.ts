import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, type Relation } from 'typeorm';
import { FssaiStatus } from '../enums/fssai-status.enum.js';
import { KitchenOperationalStatus } from '../enums/kitchen-operational-status.enum.js';
import type { Shop } from '../../shops/entities/shop.entity.js';

@Entity('kitchen_compliance')
export class KitchenCompliance {
  @PrimaryColumn()
  shopId: string;

  @OneToOne('Shop', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Relation<Shop>;

  @Column({ default: 'PENDING' })
  kycStatus: string;

  @Column({ nullable: true })
  fssaiLicense: string;

  @Column({ type: 'timestamptz', nullable: true })
  fssaiValidFrom: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fssaiValidUntil: Date;

  @Column({ type: 'enum', enum: FssaiStatus, default: FssaiStatus.PENDING })
  fssaiStatus: FssaiStatus;

  @Column({ default: 'PENDING' })
  settlementAccountStatus: string;

  @Column({ type: 'enum', enum: KitchenOperationalStatus, default: KitchenOperationalStatus.INACTIVE })
  operationalStatus: KitchenOperationalStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
