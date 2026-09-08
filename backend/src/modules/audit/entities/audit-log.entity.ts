import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column()
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  previousState: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  newState: Record<string, any>;

  @Column({ nullable: true })
  performedBy: string; // UserId or 'SYSTEM'

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
