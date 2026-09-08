import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, ManyToOne, VersionColumn, Index, type Relation } from 'typeorm';
import type {   Order   } from '../../orders/entities/order.entity.js';
import type {   RiderProfile   } from '../../users/entities/rider-profile.entity.js';
import { DeliveryStatus } from '../enums/delivery-status.enum.js';
import { DeliveryFailureReason } from '../enums/delivery-failure-reason.enum.js';
import type { Point } from 'geojson';

@Entity('deliveries')
@Index('IDX_UNIQUE_ACTIVE_DELIVERY_PER_RIDER', ['riderId'], { unique: true, where: "status IN ('ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING')" })
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @OneToOne('Order', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column({ nullable: true })
  riderId: string;

  @ManyToOne('RiderProfile', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'riderId' })
  rider: Relation<RiderProfile>;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  pickupLocation: Point;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  dropoffLocation: Point;

  @Column({ nullable: true })
  pickupOtpHashed: string;

  @Column({ type: 'int', default: 0 })
  pickupOtpAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  pickupOtpExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  pickupVerificationLockedUntil: Date;

  @Column({ type: 'boolean', default: false })
  pickupSupportRequired: boolean;

  @Column({ nullable: true })
  deliveryOtpHashed: string;

  @Column({ type: 'int', default: 0 })
  deliveryOtpAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryOtpExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryVerificationLockedUntil: Date;

  @Column({ type: 'boolean', default: false })
  deliverySupportRequired: boolean;

  @Column({ type: 'enum', enum: DeliveryFailureReason, nullable: true })
  failureReason: DeliveryFailureReason;

  @Column({ type: 'text', nullable: true })
  failureNotes: string;

  @Column({ type: 'timestamptz', nullable: true })
  pickedUpAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  outForDeliveryAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  arrivingAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING_DISPATCH })
  status: DeliveryStatus;

  @Column({ type: 'int', default: 0 })
  dispatchAttempts: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
