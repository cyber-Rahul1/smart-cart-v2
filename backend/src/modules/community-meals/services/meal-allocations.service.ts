import { Injectable, NotFoundException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CommunityMealRequest } from '../entities/community-meal-request.entity.js';
import { CommunityMealOffer } from '../entities/community-meal-offer.entity.js';
import { MealAllocation } from '../entities/meal-allocation.entity.js';
import { CommunityMealCluster } from '../entities/community-meal-cluster.entity.js';
import { MealAllocationStatus } from '../enums/meal-allocation-status.enum.js';
import { CommunityMealRequestStatus } from '../enums/community-meal-request-status.enum.js';
import { CommunityMealClusterStatus } from '../enums/community-meal-cluster-status.enum.js';
import { CommunityMealOfferStatus } from '../enums/community-meal-offer-status.enum.js';

@Injectable()
export class MealAllocationsService {
  private readonly logger = new Logger(MealAllocationsService.name);

  constructor(
    @InjectRepository(CommunityMealRequest)
    private readonly requestRepo: Repository<CommunityMealRequest>,
    @InjectRepository(CommunityMealOffer)
    private readonly offerRepo: Repository<CommunityMealOffer>,
    @InjectRepository(MealAllocation)
    private readonly allocationRepo: Repository<MealAllocation>,
    @InjectRepository(CommunityMealCluster)
    private readonly clusterRepo: Repository<CommunityMealCluster>,
    @InjectQueue('community-meals-allocations')
    private readonly allocationsQueue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  async createAllocation(userId: string, requestId: string, offerId: string): Promise<MealAllocation> {
    // 1. Pre-flight checks
    const request = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.userId !== userId) throw new ForbiddenException('You do not own this request');
    if (request.status !== CommunityMealRequestStatus.SEARCHING && request.status !== CommunityMealRequestStatus.OFFERING) {
      throw new ConflictException('Request is no longer eligible for allocation');
    }
    const offer = await this.offerRepo.findOne({ where: { id: offerId }, relations: { cluster: true } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== CommunityMealOfferStatus.ACTIVE) throw new ConflictException('Offer is no longer active');
    
    // Check cluster state.
    if (!offer.cluster) throw new NotFoundException('Cluster not found for this offer');
    if (offer.cluster.status !== CommunityMealClusterStatus.OFFERING && offer.cluster.status !== CommunityMealClusterStatus.SELECTION_OPEN) {
      throw new ConflictException('Cluster is not accepting selections');
    }

    // Check if offer expired
    if (new Date(offer.expiresAt).getTime() <= Date.now()) {
      throw new ConflictException('Offer has expired');
    }

    const servings = request.servings;

    // Idempotency: Check if an active allocation exists for this user/request
    const existingAllocation = await this.allocationRepo.findOne({
      where: [
        { userId, requestId, status: MealAllocationStatus.RESERVED },
        { userId, requestId, status: MealAllocationStatus.CONFIRMING },
        { userId, requestId, status: MealAllocationStatus.CONFIRMED },
      ]
    });

    if (existingAllocation) {
      if (existingAllocation.offerId === offerId) {
        return existingAllocation; // Idempotent success
      }
      throw new ConflictException('An active allocation already exists for a different offer');
    }

    // 2. Atomic Capacity Update & Allocation Insert inside a single transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // a. Update Capacity Atomically
      const updateResult = await queryRunner.manager
        .createQueryBuilder()
        .update(CommunityMealOffer)
        .set({
          availableQty: () => `"availableQty" - ${servings}`,
          reservedQty: () => `"reservedQty" + ${servings}`
        })
        .where('id = :offerId', { offerId })
        .andWhere('"availableQty" >= :servings', { servings })
        .andWhere('status = :status', { status: CommunityMealOfferStatus.ACTIVE })
        .execute();

      if (updateResult.affected === 0) {
        throw new ConflictException('Offer capacity exhausted or offer unavailable');
      }

      // b. Insert Allocation
      const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes from now
      
      const newAllocation = queryRunner.manager.create(MealAllocation, {
        userId,
        requestId,
        offerId,
        status: MealAllocationStatus.RESERVED,
        expiresAt,
      });

      const savedAllocation = await queryRunner.manager.save(newAllocation);

      // Commit transaction
      await queryRunner.commitTransaction();

      await this.allocationsQueue.add(
        'expire-reservation',
        { allocationId: savedAllocation.id },
        {
          jobId: `reservation-expiry-${savedAllocation.id}`,
          delay: 10 * 60000,
        }
      );

      return savedAllocation;

    } catch (error: any) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      
      // Handle DB unique constraint violation from partial unique index
      // Postgres unique violation code is 23505
      if (error.code === '23505') {
        const doubleCheck = await this.allocationRepo.findOne({
          where: [
            { userId, requestId, status: MealAllocationStatus.RESERVED },
            { userId, requestId, status: MealAllocationStatus.CONFIRMING },
            { userId, requestId, status: MealAllocationStatus.CONFIRMED },
          ]
        });
        
        if (doubleCheck) {
           if (doubleCheck.offerId === offerId) return doubleCheck;
           throw new ConflictException('An active allocation already exists for a different offer');
        }
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
