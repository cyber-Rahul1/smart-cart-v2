import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn , type Relation } from 'typeorm';
import type {   User   } from '../../users/entities/user.entity.js';
import type {   Order   } from '../../orders/entities/order.entity.js';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  senderId: string;

  @ManyToOne('User', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'senderId' })
  sender: Relation<User>;

  @Column()
  receiverId: string;

  @ManyToOne('User', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receiverId' })
  receiver: Relation<User>;

  @Column({ nullable: true })
  orderId: string;

  @ManyToOne('Order', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
