import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, type Relation } from 'typeorm';
import type { Point } from 'geojson';
import { CommunityMealRequestStatus } from '../enums/community-meal-request-status.enum.js';
import type { User } from '../../users/entities/user.entity.js';
import type { CommunityMealCluster } from './community-meal-cluster.entity.js';

@Entity('community_meal_requests')
@Index(['userId', 'status'])
@Index(['expiresAt'])
export class CommunityMealRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ nullable: true })
  clusterId: string;

  @ManyToOne('CommunityMealCluster', (cluster: any) => cluster.requests, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'clusterId' })
  cluster: Relation<CommunityMealCluster>;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  @Index({ spatial: true })
  location: Point;

  @Column()
  mealType: string;

  @Column()
  cuisine: string;

  @Column({ type: 'int', default: 1 })
  servings: number;

  @Column({ nullable: true })
  spiceLevel: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  budgetMin: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  budgetMax: number;

  @Column({ type: 'timestamptz' })
  timeWindowStart: Date;

  @Column({ type: 'timestamptz' })
  timeWindowEnd: Date;

  @Column({ type: 'enum', enum: CommunityMealRequestStatus, default: CommunityMealRequestStatus.SEARCHING })
  status: CommunityMealRequestStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
