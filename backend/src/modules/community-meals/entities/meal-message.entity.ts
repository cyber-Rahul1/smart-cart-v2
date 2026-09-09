import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, type Relation } from 'typeorm';
import type { MealConversation } from './meal-conversation.entity.js';

export enum MealMessageSenderRole {
  CUSTOMER = 'CUSTOMER',
  SHOPKEEPER = 'SHOPKEEPER',
}

@Entity('meal_messages')
@Index(['conversationId', 'createdAt'])
@Index(['conversationId', 'idempotencyKey'], { unique: true })
export class MealMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne('MealConversation', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Relation<MealConversation>;

  @Column()
  senderId: string;

  @Column({ type: 'enum', enum: MealMessageSenderRole })
  senderRole: MealMessageSenderRole;

  @Column({ type: 'varchar', length: 2000 })
  content: string;

  @Column({ nullable: true })
  idempotencyKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
