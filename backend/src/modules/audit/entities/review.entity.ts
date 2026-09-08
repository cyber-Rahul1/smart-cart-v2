import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn , Unique, type Relation } from 'typeorm';
import type {   User   } from '../../users/entities/user.entity.js';
import type {   Shop   } from '../../shops/entities/shop.entity.js';
import type {   Order   } from '../../orders/entities/order.entity.js';

@Entity('reviews')
@Unique(['orderId'])
export class Review {
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

  @Column()
  orderId: string;

  @ManyToOne('Order', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column({ type: 'int', nullable: true })
  shopRating: number; // 1 to 5

  @Column({ nullable: true })
  riderId: string;

  @Column({ type: 'int', nullable: true })
  riderRating: number; // 1 to 5

  @Column({ type: 'text', nullable: true })
  comment: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
