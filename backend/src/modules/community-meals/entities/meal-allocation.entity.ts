import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, type Relation } from 'typeorm';
import type { Point } from 'geojson';
import { MealAllocationStatus } from '../enums/meal-allocation-status.enum.js';
import type { CommunityMealRequest } from './community-meal-request.entity.js';
import type { CommunityMealOffer } from './community-meal-offer.entity.js';
import type { User } from '../../users/entities/user.entity.js';

@Entity('meal_allocations')
@Index(['userId', 'requestId'], { unique: true, where: "status IN ('RESERVED', 'CONFIRMING', 'CONFIRMED')" })
@Index(['status'])
export class MealAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  requestId: string;

  @ManyToOne('CommunityMealRequest', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requestId' })
  request: Relation<CommunityMealRequest>;

  @Column()
  offerId: string;

  @ManyToOne('CommunityMealOffer', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'offerId' })
  offer: Relation<CommunityMealOffer>;

  @Column()
  userId: string;

  @ManyToOne('User', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ type: 'enum', enum: MealAllocationStatus, default: MealAllocationStatus.PENDING })
  status: MealAllocationStatus;

  @Column({ nullable: true })
  paymentSessionId: string;

  @Column({ nullable: true, unique: true })
  orderId: string;

  @ManyToOne('Order', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<any>; // Using any to avoid circular import or just import Order

  @Column({ nullable: true })
  deliveryAddressLabel: string;

  @Column({ nullable: true })
  deliveryAddressLine: string;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true
  })
  deliveryLocation: Point;

  @Column({ nullable: true, type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
