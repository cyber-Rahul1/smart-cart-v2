import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MealAllocationStatus } from '../enums/meal-allocation-status.enum.js';
import { MealAllocation } from '../entities/meal-allocation.entity.js';
import { CommunityMealOffer } from '../entities/community-meal-offer.entity.js';

@Processor('community-meals-allocations')
export class ReservationExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(ReservationExpiryProcessor.name);
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async process(job: Job<{ allocationId: string }>): Promise<void> {
    const { allocationId } = job.data;
    
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // 1. Lock the allocation row
      const allocation = await queryRunner.manager.createQueryBuilder(MealAllocation, 'allocation')
        .setLock('pessimistic_write')
        .where('allocation.id = :id', { id: allocationId })
        .andWhere('allocation.status = :status', { status: MealAllocationStatus.RESERVED })
        .innerJoinAndSelect('allocation.request', 'request')
        .getOne();

      if (!allocation || !allocation.request) {
        // Idempotent: already handled, deleted, or progressed to another state
        await queryRunner.commitTransaction();
        return;
      }

      const servings = allocation.request.servings;

      // 2. Restore capacity on the offer
      await queryRunner.manager
        .createQueryBuilder()
        .update(CommunityMealOffer)
        .set({
          reservedQty: () => `"reservedQty" - ${servings}`,
          availableQty: () => `"availableQty" + ${servings}`
        })
        .where('id = :offerId', { offerId: allocation.offerId })
        .execute();

      // 3. Mark allocation as cancelled
      await queryRunner.manager
        .createQueryBuilder()
        .update(MealAllocation)
        .set({ status: MealAllocationStatus.CANCELLED })
        .where('id = :id', { id: allocationId })
        .execute();

      await queryRunner.commitTransaction();
      this.logger.log(`Expired and cancelled reservation ${allocationId}`);
    } catch (error: any) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`Failed to expire reservation ${allocationId}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
