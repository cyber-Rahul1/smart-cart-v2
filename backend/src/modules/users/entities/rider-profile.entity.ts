import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, VersionColumn, OneToOne, JoinColumn , type Relation } from 'typeorm';
import type { User } from './user.entity.js';
import { RiderAvailabilityStatus } from '../enums/rider-availability-status.enum.js';
import { RiderKycStatus } from '../enums/rider-kyc-status.enum.js';

@Entity('rider_profiles')
export class RiderProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @OneToOne('User', (user: any) => user.riderProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'enum', enum: RiderKycStatus, default: RiderKycStatus.PENDING })
  kycStatus: RiderKycStatus;

  @Column({ type: 'enum', enum: RiderAvailabilityStatus, default: RiderAvailabilityStatus.OFFLINE })
  availabilityStatus: RiderAvailabilityStatus;

  @Column({ nullable: true })
  vehicleType: string;

  @Column({ nullable: true })
  vehicleRegistration: string;

  @Column({ nullable: true })
  licenseNumber: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
