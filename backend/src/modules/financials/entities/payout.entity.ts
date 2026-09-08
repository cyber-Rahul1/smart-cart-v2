import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, VersionColumn , type Relation } from 'typeorm';
import type {   User   } from '../../users/entities/user.entity.js';
import { PayoutStatus } from '../enums/payout-status.enum.js';

@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recipientId: string; // Could be a Shop owner or Rider

  @ManyToOne('User', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recipientId' })
  recipient: Relation<User>;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  providerReference: string;

  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
