import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn , type Relation } from 'typeorm';
import type {   Payout   } from './payout.entity.js';
import type {   Order   } from '../../orders/entities/order.entity.js';

@Entity('settlements')
export class Settlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  payoutId: string;

  @ManyToOne('Payout', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payoutId' })
  payout: Relation<Payout>;

  @Column()
  orderId: string;

  @ManyToOne('Order', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
