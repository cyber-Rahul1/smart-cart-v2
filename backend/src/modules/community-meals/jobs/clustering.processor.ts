import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CommunityMealClusteringService } from '../services/community-meal-clustering.service.js';
import { Logger } from '@nestjs/common';

@Processor('community-meals-clustering')
export class ClusteringProcessor extends WorkerHost {
  private readonly logger = new Logger(ClusteringProcessor.name);

  constructor(private readonly clusteringService: CommunityMealClusteringService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<void> {
    try {
      if (job.name === 'cluster-request') {
        const { requestId } = job.data;
        this.logger.debug(`Processing cluster-request for ${requestId}`);
        await this.clusteringService.clusterRequest(requestId);
      } else if (job.name === 'reevaluate-cluster') {
        const { clusterId } = job.data;
        this.logger.debug(`Processing reevaluate-cluster for ${clusterId}`);
        await this.clusteringService.reevaluateCluster(clusterId);
      }
    } catch (error) {
      this.logger.error(`Error processing job ${job.id}`, error);
      throw error;
    }
  }
}
