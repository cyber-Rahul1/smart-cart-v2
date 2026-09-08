import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, UpdateDateColumn } from 'typeorm';

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Entity('outbox_events')
@Index(['status', 'createdAt']) // for polling pending events
@Index(['idempotencyKey'], { unique: true, where: "idempotency_key IS NOT NULL" }) // ensure no duplicate events
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ type: 'enum', enum: OutboxEventStatus, default: OutboxEventStatus.PENDING })
  status: OutboxEventStatus;

  @Column({ nullable: true, name: 'idempotency_key' })
  idempotencyKey: string;

  @Column({ nullable: true })
  error: string;

  @Column({ nullable: true, type: 'timestamptz' })
  processedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
