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
import { KitchenCompliance } from './entities/kitchen-compliance.entity.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { KitchenCommunityMealsController } from './controllers/kitchen-community-meals.controller.js';
import { CustomerCommunityMealOffersController } from './controllers/customer-community-meal-offers.controller.js';
import { KitchenEligibilityService } from './services/kitchen-eligibility.service.js';
import { CommunityMealOffersService } from './services/community-meal-offers.service.js';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityMealRequest,
      CommunityMealCluster,
      CommunityMealOffer,
      MealAllocation,
      MealConversation,
      MealMenuLedger,
      KitchenCompliance,
      Shop,
    ]),
    BullModule.registerQueue({
      name: 'community-meals-clustering',
    }),
    BullModule.registerQueue({
      name: 'community-meals-expiration',
    }),
  ],
  controllers: [
    CommunityMealRequestsController, 
    CommunityMealClustersController,
    KitchenCommunityMealsController,
    CustomerCommunityMealOffersController,
  ],
  providers: [
    CommunityMealRequestsService,
    CommunityMealClusteringService,
    KitchenEligibilityService,
    CommunityMealOffersService,
    ClusteringProcessor,
    ExpirationProcessor,
  ],
  exports: [CommunityMealRequestsService, CommunityMealClusteringService, KitchenEligibilityService, CommunityMealOffersService],
})
export class CommunityMealsModule {}
