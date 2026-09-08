import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, OneToMany, type Relation } from 'typeorm';
import type { Point } from 'geojson';
import { CommunityMealClusterStatus } from '../enums/community-meal-cluster-status.enum.js';
import type { CommunityMealRequest } from './community-meal-request.entity.js';
import type { CommunityMealOffer } from './community-meal-offer.entity.js';

@Entity('community_meal_clusters')
@Index(['status', 'timeWindowStart'])
export class CommunityMealCluster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  @Index({ spatial: true })
  centroid: Point;

  @Column({ type: 'timestamptz' })
  timeWindowStart: Date;

  @Column({ type: 'timestamptz' })
  timeWindowEnd: Date;

  @Column({ type: 'enum', enum: CommunityMealClusterStatus, default: CommunityMealClusterStatus.GATHERING_DEMAND })
  status: CommunityMealClusterStatus;

  @Column({ type: 'int', default: 3 })
  minimumThreshold: number;

  @OneToMany('CommunityMealRequest', (request: any) => request.cluster)
  requests: Relation<CommunityMealRequest[]>;

  @OneToMany('CommunityMealOffer', (offer: any) => offer.cluster)
  offers: Relation<CommunityMealOffer[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
