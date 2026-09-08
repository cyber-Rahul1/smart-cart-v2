import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, type Relation } from 'typeorm';
import { MealMenuLedgerStatus } from '../enums/meal-menu-ledger-status.enum.js';
import type { MealAllocation } from './meal-allocation.entity.js';

@Entity('meal_menu_ledgers')
export class MealMenuLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  allocationId: string;

  @OneToOne('MealAllocation', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'allocationId' })
  allocation: Relation<MealAllocation>;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  basePrice: number;

  @Column({ type: 'jsonb', nullable: true })
  allergens: any;

  @Column({ type: 'jsonb', nullable: true })
  ingredients: any;

  @Column({ type: 'jsonb', nullable: true })
  substitutions: any;

  @Column({ nullable: true })
  spiceLevel: string;

  @Column({ type: 'enum', enum: MealMenuLedgerStatus, default: MealMenuLedgerStatus.DRAFT })
  status: MealMenuLedgerStatus;

  @Column({ type: 'timestamptz', nullable: true })
  menuLockAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
