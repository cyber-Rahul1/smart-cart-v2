import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, OneToOne, VersionColumn, Index, type Relation } from 'typeorm';
import type { Point } from 'geojson';
import type {   User   } from '../../users/entities/user.entity.js';
import type {   Shop   } from '../../shops/entities/shop.entity.js';
import type {   Delivery   } from '../../logistics/entities/delivery.entity.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import type {   OrderItem   } from './order-item.entity.js';

@Entity('orders')
@Index(['customerId', 'idempotencyKey'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne('User', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerId' })
  customer: Relation<User>;

  @Column()
  shopId: string;

  @ManyToOne('Shop', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Relation<Shop>;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.CREATED })
  status: OrderStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  totalAmount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  deliveryFee: number;

  @OneToMany('OrderItem', (item: any) => item.order, { cascade: true })
  items: Relation<OrderItem[]>;

  @OneToOne('Delivery', (delivery: any) => delivery.order)
  delivery: Relation<Delivery>;

  @Column({ nullable: true })
  idempotencyKey: string;

  @Column({ nullable: true })
  requestPayloadHash: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  subtotal: number;

  @Column()
  deliveryAddressLabel: string;

  @Column()
  deliveryAddressLine: string;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  deliveryLocation: Point;

  @Column({ nullable: true, type: 'timestamptz' })
  cancelledAt: Date;

  @Column({ nullable: true })
  cancellationReason: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
