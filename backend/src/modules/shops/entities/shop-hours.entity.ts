import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn , type Relation } from 'typeorm';
import type {   Shop   } from './shop.entity.js';

@Entity('shop_hours')
export class ShopHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  shopId: string;

  @ManyToOne('Shop', (shop: any) => shop.hours, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Relation<Shop>;

  @Column()
  dayOfWeek: number; // 0=Sunday, 6=Saturday

  @Column({ type: 'time' })
  openTime: string;

  @Column({ type: 'time' })
  closeTime: string;

  @Column({ default: false })
  isClosed: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
