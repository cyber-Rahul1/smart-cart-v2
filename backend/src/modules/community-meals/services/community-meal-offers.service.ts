import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, MoreThanOrEqual } from 'typeorm';
import { CommunityMealOffer } from '../entities/community-meal-offer.entity.js';
import { CommunityMealCluster } from '../entities/community-meal-cluster.entity.js';
import { CreateCommunityMealOfferDto } from '../dto/create-community-meal-offer.dto.js';
import { CommunityMealOfferStatus } from '../enums/community-meal-offer-status.enum.js';
import { CommunityMealClusterStatus } from '../enums/community-meal-cluster-status.enum.js';
import { KitchenEligibilityService } from './kitchen-eligibility.service.js';
import { CommunityMealClusteringService } from './community-meal-clustering.service.js';

@Injectable()
export class CommunityMealOffersService {
  constructor(
    @InjectRepository(CommunityMealOffer)
    private readonly offerRepo: Repository<CommunityMealOffer>,
    @InjectRepository(CommunityMealCluster)
    private readonly clusterRepo: Repository<CommunityMealCluster>,
    private readonly eligibilityService: KitchenEligibilityService,
    private readonly clusteringService: CommunityMealClusteringService,
    private readonly dataSource: DataSource,
  ) {}

  async getEligibleDemandClusters(userId: string, shopId: string, lat: number, lng: number, limit: number, cursor?: string) {
    // 1. Verify eligibility
    await this.eligibilityService.requireEligibility(userId, shopId);

    // 2. Return nearby clusters in OFFERING phase using existing clustering service
    // Ensure we don't expose individual customers or location. The clusteringService returns aggregates.
    return this.clusteringService.getNearbyClusters(lat, lng, limit, cursor);
  }

  async createOffer(userId: string, shopId: string, dto: CreateCommunityMealOfferDto): Promise<CommunityMealOffer> {
    // 1. Verify eligibility
    await this.eligibilityService.requireEligibility(userId, shopId);

    if (dto.minQuantity > dto.maxQuantity) {
      throw new BadRequestException('minQuantity cannot be greater than maxQuantity');
    }

    return this.dataSource.transaction(async (manager) => {
      // 2. Verify cluster is valid and OFFERING
      // Lock the cluster to avoid race conditions with its lifecycle
      const cluster = await manager.findOne(CommunityMealCluster, {
        where: { id: dto.clusterId },
        lock: { mode: 'pessimistic_read' },
      });

      if (!cluster) {
        throw new NotFoundException('Cluster not found');
      }

      if (cluster.status !== CommunityMealClusterStatus.OFFERING) {
        throw new BadRequestException(`Cluster is not accepting offers (Current status: ${cluster.status})`);
      }

      // 3. Ensure idempotency (one active offer per shop per cluster)
      const existingOffer = await manager.findOne(CommunityMealOffer, {
        where: {
          shopId,
          clusterId: dto.clusterId,
          status: CommunityMealOfferStatus.ACTIVE,
        },
      });

      if (existingOffer) {
        throw new ConflictException('An active offer already exists for this shop in this cluster');
      }

      // 4. Create the offer
      // We set expiration to the cluster's timeWindowEnd minus some buffer or exactly at timeWindowEnd
      const expiresAt = cluster.timeWindowEnd;
      const menuLockAt = new Date(cluster.timeWindowStart.getTime() - 45 * 60 * 1000); // 45 min before window

      const offer = manager.create(CommunityMealOffer, {
        clusterId: cluster.id,
        shopId,
        pricePerServing: dto.pricePerServing,
        minQuantity: dto.minQuantity,
        maxQuantity: dto.maxQuantity,
        availableQty: dto.maxQuantity, // fully available at start
        reservedQty: 0,
        committedQty: 0,
        menuDescription: dto.menuDescription,
        status: CommunityMealOfferStatus.ACTIVE,
        expiresAt,
        menuLockAt,
      });

      return await manager.save(offer);
    });
  }

  async getCustomerOffers(clusterId: string): Promise<any[]> {
    // Return all ACTIVE offers for this cluster
    // Do not leak internal compliance info or backend statuses unnecessarily.
    const now = new Date();
    const offers = await this.offerRepo.find({
      where: {
        clusterId,
        status: CommunityMealOfferStatus.ACTIVE,
        expiresAt: MoreThanOrEqual(now),
      },
      relations: { shop: true },
    });

    return offers.map(offer => ({
      id: offer.id,
      shopId: offer.shopId,
      shopName: offer.shop.name,
      shopLogo: offer.shop.logo,
      pricePerServing: Number(offer.pricePerServing),
      minQuantity: offer.minQuantity,
      maxQuantity: offer.maxQuantity,
      availableQty: offer.availableQty,
      menuDescription: offer.menuDescription,
      expiresAt: offer.expiresAt,
      menuLockAt: offer.menuLockAt,
    }));
  }
}
