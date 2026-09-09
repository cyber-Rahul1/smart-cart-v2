import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Address } from '../users/entities/address.entity.js';
import { PaymentsModule } from '../payments/payments.module.js';
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
import { MealMessage } from './entities/meal-message.entity.js';
import { KitchenCompliance } from './entities/kitchen-compliance.entity.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { KitchenCommunityMealsController } from './controllers/kitchen-community-meals.controller.js';
import { CustomerCommunityMealOffersController } from './controllers/customer-community-meal-offers.controller.js';
import { KitchenEligibilityService } from './services/kitchen-eligibility.service.js';
import { CommunityMealOffersService } from './services/community-meal-offers.service.js';
import { MealAllocationsService } from './services/meal-allocations.service.js';
import { CommunityMealConversationService } from './services/community-meal-conversation.service.js';
import { CommunityMealMessagesService } from './services/community-meal-messages.service.js';
import { CommunityMealMenuLedgerService } from './services/community-meal-menu-ledger.service.js';
import { CustomerMealAllocationsController, CustomerAllocationPaymentsController } from './controllers/customer-meal-allocations.controller.js';
import { ReservationExpiryProcessor } from './processors/reservation-expiry.processor.js';
import { CommunityMealConversationController } from './controllers/community-meal-conversation.controller.js';
import { CommunityMealMessageController } from './controllers/community-meal-message.controller.js';
import { CommunityMealLedgerController } from './controllers/community-meal-ledger.controller.js';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityMealRequest,
      CommunityMealCluster,
      CommunityMealOffer,
      MealAllocation,
      MealConversation,
      MealMenuLedger,
      MealMessage,
      KitchenCompliance,
      Shop,
      Address,
      AuditLog,
    ]),
    BullModule.registerQueue({
      name: 'community-meals-clustering',
    }),
    BullModule.registerQueue({
      name: 'community-meals-expiration',
    }),
    BullModule.registerQueue({
      name: 'community-meals-allocations',
    }),
    PaymentsModule,
  ],
  controllers: [
    CommunityMealRequestsController, 
    CommunityMealClustersController,
    KitchenCommunityMealsController,
    CustomerCommunityMealOffersController,
    CustomerMealAllocationsController,
    CustomerAllocationPaymentsController,
    CommunityMealConversationController,
    CommunityMealMessageController,
    CommunityMealLedgerController,
  ],
  providers: [
    CommunityMealRequestsService,
    CommunityMealClusteringService,
    KitchenEligibilityService,
    CommunityMealOffersService,
    ClusteringProcessor,
    ExpirationProcessor,
    MealAllocationsService,
    ReservationExpiryProcessor,
    CommunityMealConversationService,
    CommunityMealMessagesService,
    CommunityMealMenuLedgerService,
  ],
  exports: [CommunityMealRequestsService, CommunityMealClusteringService, KitchenEligibilityService, CommunityMealOffersService, MealAllocationsService],
})
export class CommunityMealsModule {}
