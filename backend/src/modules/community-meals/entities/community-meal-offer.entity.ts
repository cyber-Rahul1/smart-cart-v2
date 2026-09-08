import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, Check, type Relation } from 'typeorm';
import { CommunityMealOfferStatus } from '../enums/community-meal-offer-status.enum.js';
import type { CommunityMealCluster } from './community-meal-cluster.entity.js';
import type { Shop } from '../../shops/entities/shop.entity.js';

@Entity('community_meal_offers')
@Index(['clusterId', 'status'])
@Index(['expiresAt'])
@Check('"availableQty" >= 0')
@Check('"reservedQty" >= 0')
@Check('"committedQty" >= 0')
@Check('"availableQty" + "reservedQty" + "committedQty" <= "maxQuantity"')
export class CommunityMealOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  clusterId: string;

  @ManyToOne('CommunityMealCluster', (cluster: any) => cluster.offers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clusterId' })
  cluster: Relation<CommunityMealCluster>;

  @Column()
  shopId: string;

  @ManyToOne('Shop', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Relation<Shop>;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  pricePerServing: number;

  @Column({ type: 'int', default: 1 })
  minQuantity: number;

  @Column({ type: 'int' })
  maxQuantity: number;

  @Column({ type: 'int', default: 0 })
  availableQty: number;

  @Column({ type: 'int', default: 0 })
  reservedQty: number;

  @Column({ type: 'int', default: 0 })
  committedQty: number;

  @Column({ type: 'text' })
  menuDescription: string;

  @Column({ type: 'enum', enum: CommunityMealOfferStatus, default: CommunityMealOfferStatus.ACTIVE })
  status: CommunityMealOfferStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  menuLockAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
