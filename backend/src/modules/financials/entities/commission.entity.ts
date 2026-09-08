import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn , type Relation } from 'typeorm';
import type {   Shop   } from '../../shops/entities/shop.entity.js';
import type {   Order   } from '../../orders/entities/order.entity.js';

@Entity('commissions')
export class Commission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  shopId: string;

  @ManyToOne('Shop', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Relation<Shop>;

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
