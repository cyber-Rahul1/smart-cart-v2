import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index , type Relation } from 'typeorm';
import type { RiderProfile } from '../../users/entities/rider-profile.entity.js';
import type { Delivery } from './delivery.entity.js';
import type { Point } from 'geojson';

@Entity('rider_locations')
@Index(['riderId', 'timestamp'], { unique: true })
export class RiderLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  riderId: string;

  @ManyToOne('RiderProfile', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'riderId' })
  rider: Relation<RiderProfile>;

  @Column({ nullable: true })
  deliveryId: string;

  @ManyToOne('Delivery', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'deliveryId' })
  delivery: Relation<Delivery>;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: Point;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
