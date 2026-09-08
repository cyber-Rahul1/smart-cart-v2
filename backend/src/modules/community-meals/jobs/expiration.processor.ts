import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Logger } from '@nestjs/common';
import { CommunityMealRequest } from '../entities/community-meal-request.entity.js';
import { CommunityMealRequestStatus } from '../enums/community-meal-request-status.enum.js';
import { CommunityMealClusteringService } from '../services/community-meal-clustering.service.js';

@Processor('community-meals-expiration')
export class ExpirationProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpirationProcessor.name);

  constructor(
    @InjectRepository(CommunityMealRequest)
    private readonly requestRepo: Repository<CommunityMealRequest>,
    private readonly clusteringService: CommunityMealClusteringService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<void> {
    try {
      if (job.name === 'expire-request') {
        const { requestId } = job.data;
        this.logger.debug(`Processing expire-request for ${requestId}`);
        
        let clusterIdToReevaluate: string | null = null;

        await this.dataSource.transaction(async (manager) => {
          const request = await manager.findOne(CommunityMealRequest, { where: { id: requestId } });
          if (!request) return;

          // Request can expire if it's SEARCHING or OFFERING.
          // If it's CONFIRMED or CANCELLED, it's terminal.
          if (
            request.status !== CommunityMealRequestStatus.SEARCHING && 
            request.status !== CommunityMealRequestStatus.OFFERING
          ) {
            return;
          }

          if (request.expiresAt.getTime() > Date.now()) {
            return; // Not yet expired
          }

          request.status = CommunityMealRequestStatus.EXPIRED;
          await manager.save(request);

          if (request.clusterId) {
            clusterIdToReevaluate = request.clusterId;
          }
        });

        // Outside the request transaction, evaluate the cluster to avoid deadlocks.
        if (clusterIdToReevaluate) {
          await this.clusteringService.reevaluateCluster(clusterIdToReevaluate);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing expiration job ${job.id}`, error);
      throw error;
    }
  }
}
