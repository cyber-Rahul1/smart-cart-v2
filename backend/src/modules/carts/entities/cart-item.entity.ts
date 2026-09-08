import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique, type Relation } from 'typeorm';
import type { Cart } from './cart.entity.js';
import type { Product } from '../../products/entities/product.entity.js';

@Entity('cart_items')
@Unique(['cartId', 'productId'])
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  cartId: string;

  @ManyToOne('Cart', (cart: any) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart: Relation<Cart>;

  @Column()
  productId: string;

  @ManyToOne('Product', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
