import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, VersionColumn , type Relation } from 'typeorm';
import type {   Shop   } from '../../shops/entities/shop.entity.js';
import type {   Category   } from './category.entity.js';
import { ProductStatus } from '../enums/product-status.enum.js';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  shopId: string;

  @ManyToOne('Shop', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Relation<Shop>;

  @Column()
  categoryId: string;

  @ManyToOne('Category', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: Relation<Category>;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  image: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  price: number;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.AVAILABLE })
  status: ProductStatus;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date;
}
