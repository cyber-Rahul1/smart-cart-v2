import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, Index, type Relation } from 'typeorm';
import type { MealAllocation } from './meal-allocation.entity.js';

@Entity('meal_conversations')
@Index(['allocationId'], { unique: true })
export class MealConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  allocationId: string;

  @OneToOne('MealAllocation', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'allocationId' })
  allocation: Relation<MealAllocation>;

  @Column({ default: 'ACTIVE' })
  status: string; // Could be ACTIVE, READ_ONLY

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
