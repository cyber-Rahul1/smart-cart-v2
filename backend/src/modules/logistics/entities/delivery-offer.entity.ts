import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, VersionColumn, Index, type Relation } from 'typeorm';
import type { Delivery } from './delivery.entity.js';
import type { RiderProfile } from '../../users/entities/rider-profile.entity.js';
import { OfferStatus } from '../enums/offer-status.enum.js';

@Entity('delivery_offers')
@Index('IDX_UNIQUE_ACTIVE_OFFER', ['deliveryId', 'riderId'], { unique: true, where: "status = 'PENDING'" })
export class DeliveryOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deliveryId: string;

  @ManyToOne('Delivery', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliveryId' })
  delivery: Relation<Delivery>;

  @Column()
  riderId: string;

  @ManyToOne('RiderProfile', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'riderId' })
  rider: Relation<RiderProfile>;

  @Column({ type: 'enum', enum: OfferStatus, default: OfferStatus.PENDING })
  status: OfferStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
