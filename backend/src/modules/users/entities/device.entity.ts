import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, VersionColumn, type Relation } from 'typeorm';
import type { User } from './user.entity.js';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  userId: string;

  @ManyToOne('User', 'devices', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ nullable: true })
  deviceId: string;

  @Column({ nullable: true })
  platform: string;

  @Column({ nullable: true })
  refreshTokenHash: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  pushToken: string | null;

  @Column({ type: 'varchar', nullable: true })
  pushProvider: string | null; // e.g., 'FCM', 'APNS'

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  lastSeenAt: Date;

  @Column({ default: false })
  isRevoked: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
