import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, OneToMany , type Relation } from 'typeorm';
import { ShopStatus } from '../enums/shop-status.enum.js';
import type {   User   } from '../../users/entities/user.entity.js';
import type {   ShopHours   } from './shop-hours.entity.js';
import type { Point } from 'geojson';

@Entity('shops')
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @ManyToOne('User', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner: Relation<User>;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: Point;

  @Column({ nullable: true })
  logo: string;

  @Column({ nullable: true })
  banner: string;

  @Column({ type: 'int', default: 5000 })
  deliveryRadius: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  minimumOrder: number;

  @Column({ type: 'int', default: 30 })
  preparationTime: number;

  @Column({ type: 'enum', enum: ShopStatus, default: ShopStatus.ACTIVE })
  status: ShopStatus;

  @OneToMany('ShopHours', (hours: any) => hours.shop, { cascade: true })
  hours: Relation<ShopHours>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date;
}
