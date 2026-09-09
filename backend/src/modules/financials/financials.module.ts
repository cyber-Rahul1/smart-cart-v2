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
  ],
  providers: [SettlementInstructionService],
  exports: [SettlementInstructionService],
})
export class FinancialsModule {}
