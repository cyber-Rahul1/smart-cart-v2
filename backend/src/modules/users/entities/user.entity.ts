import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, OneToOne, OneToMany , type Relation } from 'typeorm';
import { UserRole } from '../enums/user-role.enum.js';
import { UserStatus } from '../enums/user-status.enum.js';
import type {   CustomerProfile   } from './customer-profile.entity.js';
import type {   RiderProfile   } from './rider-profile.entity.js';
import type {   ShopkeeperProfile   } from './shopkeeper-profile.entity.js';
import type {   Address   } from './address.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phoneNumber: string;

  @Column({ type: 'enum', enum: UserRole, array: true, default: [UserRole.CUSTOMER] })
  roles: UserRole[];

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @OneToOne('CustomerProfile', (profile: any) => profile.user, { cascade: true })
  customerProfile: Relation<CustomerProfile>;

  @OneToOne('RiderProfile', (profile: any) => profile.user, { cascade: true })
  riderProfile: Relation<RiderProfile>;

  @OneToOne('ShopkeeperProfile', (profile: any) => profile.user, { cascade: true })
  shopkeeperProfile: Relation<ShopkeeperProfile>;

  @OneToMany('Address', (address: any) => address.user, { cascade: true })
  addresses: Relation<Address>;

  @OneToMany('Device', (device: any) => device.user, { cascade: true })
  devices: import('./device.entity.js').Device[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date;
}
