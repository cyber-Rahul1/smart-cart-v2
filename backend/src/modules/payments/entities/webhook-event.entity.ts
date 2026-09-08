import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum WebhookEventStatus {
  RECEIVED = 'RECEIVED',
  VERIFIED = 'VERIFIED',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Entity('webhook_events')
@Index(['provider', 'eventId'], { unique: true })
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  provider: string; // e.g., 'RAZORPAY'

  @Column()
  eventId: string; // The unique ID of the event from the provider

  @Column({ type: 'enum', enum: WebhookEventStatus, default: WebhookEventStatus.RECEIVED })
  status: WebhookEventStatus;

  @Column({ nullable: true, type: 'timestamptz' })
  processedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
