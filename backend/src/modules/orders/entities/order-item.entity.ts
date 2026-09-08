import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn , type Relation } from 'typeorm';
import type {   Order   } from './order.entity.js';
import type {   Product   } from '../../products/entities/product.entity.js';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne('Order', (order: any) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column({ nullable: true })
  productId: string;

  @ManyToOne('Product', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  // Snapshot of product details for immutability
  @Column()
  productNameSnapshot: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  unitPriceSnapshot: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  lineTotal: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
