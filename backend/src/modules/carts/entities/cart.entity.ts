import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';
import type { Shop } from '../../shops/entities/shop.entity.js';
import type { CartItem } from './cart-item.entity.js';

@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ nullable: true })
  shopId: string | null;

  @ManyToOne('Shop', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Relation<Shop> | null;

  @OneToMany('CartItem', (cartItem: any) => cartItem.cart, { cascade: true })
  items: Relation<CartItem[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
