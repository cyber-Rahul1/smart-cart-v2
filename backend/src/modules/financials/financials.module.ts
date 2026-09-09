import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementInstruction } from './entities/settlement-instruction.entity.js';
import { Commission } from './entities/commission.entity.js';
import { SettlementInstructionService } from './services/settlement-instruction.service.js';
import { Order } from '../orders/entities/order.entity.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { KitchenCompliance } from '../community-meals/entities/kitchen-compliance.entity.js';
import { MealAllocation } from '../community-meals/entities/meal-allocation.entity.js';
import { MealMenuLedger } from '../community-meals/entities/meal-menu-ledger.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';

import { BullModule } from '@nestjs/bullmq';
import { FINANCIAL_SETTLEMENTS_QUEUE } from './constants/financials.constants.js';
import { SettlementEligibilityProcessor } from './jobs/settlement-eligibility.processor.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SettlementInstruction,
      Commission,
      Order,
      Shop,
      KitchenCompliance,
      MealAllocation,
      MealMenuLedger,
      AuditLog,
    ]),
    BullModule.registerQueue({ name: FINANCIAL_SETTLEMENTS_QUEUE }),
  ],
  providers: [SettlementInstructionService, SettlementEligibilityProcessor],
  exports: [SettlementInstructionService],
})
export class FinancialsModule {}
