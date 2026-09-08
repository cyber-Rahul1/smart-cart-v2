import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CommunityMealRequestsController } from './controllers/community-meal-requests.controller.js';
import { CommunityMealClustersController } from './controllers/community-meal-clusters.controller.js';
import { CommunityMealRequestsService } from './services/community-meal-requests.service.js';
import { CommunityMealClusteringService } from './services/community-meal-clustering.service.js';
import { ClusteringProcessor } from './jobs/clustering.processor.js';
import { ExpirationProcessor } from './jobs/expiration.processor.js';
import { CommunityMealRequest } from './entities/community-meal-request.entity.js';
import { CommunityMealCluster } from './entities/community-meal-cluster.entity.js';
import { CommunityMealOffer } from './entities/community-meal-offer.entity.js';
import { MealAllocation } from './entities/meal-allocation.entity.js';
import { MealConversation } from './entities/meal-conversation.entity.js';
import { MealMenuLedger } from './entities/meal-menu-ledger.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityMealRequest,
      CommunityMealCluster,
      CommunityMealOffer,
      MealAllocation,
      MealConversation,
      MealMenuLedger,
    ]),
    BullModule.registerQueue({
      name: 'community-meals-clustering',
    }),
    BullModule.registerQueue({
      name: 'community-meals-expiration',
    }),
  ],
  controllers: [CommunityMealRequestsController, CommunityMealClustersController],
  providers: [
    CommunityMealRequestsService,
    CommunityMealClusteringService,
    ClusteringProcessor,
    ExpirationProcessor,
  ],
  exports: [CommunityMealRequestsService, CommunityMealClusteringService],
})
export class CommunityMealsModule {}
