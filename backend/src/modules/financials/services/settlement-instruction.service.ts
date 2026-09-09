import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { Order } from '../../orders/entities/order.entity.js';
import { OrderStatus } from '../../orders/enums/order-status.enum.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { KitchenCompliance } from '../../community-meals/entities/kitchen-compliance.entity.js';
import { MealAllocation } from '../../community-meals/entities/meal-allocation.entity.js';
import { MealAllocationStatus } from '../../community-meals/enums/meal-allocation-status.enum.js';
import { MealMenuLedger } from '../../community-meals/entities/meal-menu-ledger.entity.js';
import { MealMenuLedgerStatus } from '../../community-meals/enums/meal-menu-ledger-status.enum.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { MoneyUtil } from '../../../core/utils/money.util.js';

@Injectable()
export class SettlementInstructionService {
  private readonly logger = new Logger(SettlementInstructionService.name);

  constructor(private readonly dataSource: DataSource) {}

  async createInstruction(orderId: string): Promise<SettlementInstruction> {
    const idempotencyKey = `settlement-order-${orderId}`;

    try {
      return await this.dataSource.transaction(async (manager) => {
        // 1. Eligibility Check: Order
        const order = await manager.findOne(Order, { where: { id: orderId } });
        if (!order) {
          throw new NotFoundException(`Order ${orderId} not found`);
        }
        if (order.status !== OrderStatus.DELIVERED) {
          throw new BadRequestException(`Order ${orderId} is not delivered (status: ${order.status})`);
        }

        // 2. Eligibility Check: Allocation (Ensure it's a Community Meal)
        const allocation = await manager.findOne(MealAllocation, { where: { orderId: orderId } });
        if (!allocation) {
          throw new BadRequestException(`Order ${orderId} is not a Community Meal order (no allocation found)`);
        }
        if (allocation.status !== MealAllocationStatus.DELIVERED && allocation.status !== MealAllocationStatus.CONFIRMED) {
           if (![MealAllocationStatus.CONFIRMED, MealAllocationStatus.DELIVERED].includes(allocation.status)) {
              throw new BadRequestException(`Allocation ${allocation.id} is in invalid state ${allocation.status}`);
           }
        }

        // 3. Eligibility Check: Ledger
        const ledger = await manager.findOne(MealMenuLedger, { where: { allocationId: allocation.id } });
        if (!ledger) {
          throw new BadRequestException(`Ledger not found for allocation ${allocation.id}`);
        }
        if (ledger.status !== MealMenuLedgerStatus.LOCKED) {
          throw new BadRequestException(`Ledger ${ledger.id} is not LOCKED`);
        }

        // 4. Resolve Compliance & Shop
        const compliance = await manager.findOne(KitchenCompliance, { where: { shopId: order.shopId } });
        if (!compliance) {
          throw new NotFoundException(`Compliance record not found for shop ${order.shopId}`);
        }
        
        const shop = await manager.findOne(Shop, { where: { id: order.shopId } });
        if (!shop) {
          throw new NotFoundException(`Shop ${order.shopId} not found`);
        }

        // 5. Monetary Calculations
        const providerGrossCents = MoneyUtil.toMinorUnit(order.subtotal);
        const commissionRate = Number(shop.commissionRate || 0);

        // We explicitly Math.round to ensure an exact integer minor unit is persisted (preventing fractional pennies) and using standard half-up monetary rounding
        const platformCommissionCents = Math.round((providerGrossCents * commissionRate) / 100);
        const providerNetCents = providerGrossCents - platformCommissionCents;

        const customerGrossAmount = Number(order.totalAmount);
        const providerGrossAmount = Number(order.subtotal);
        const platformCommission = MoneyUtil.toDecimal(platformCommissionCents);
        const paymentGatewayFees = 0.00;
        const discounts = 0.00;
        const refunds = 0.00;
        const adjustments = 0.00;
        const providerNetSettlement = MoneyUtil.toDecimal(providerNetCents);

        // 6. Create Instruction (Always PENDING in Phase 12B-7)
        const isAccountActive = compliance.settlementAccountStatus === 'ACTIVE';
        if (!isAccountActive) {
           this.logger.warn(`Creating PENDING settlement for inactive account (shop: ${shop.id})`);
        }

        const newInstruction = manager.create(SettlementInstruction, {
          orderId: order.id,
          providerAccountId: shop.id,
          customerGrossAmount,
          providerGrossAmount,
          platformCommission,
          paymentGatewayFees,
          discounts,
          refunds,
          adjustments,
          providerNetSettlement,
          status: SettlementInstructionStatus.PENDING,
          idempotencyKey,
        });

        const savedInstruction = await manager.save(SettlementInstruction, newInstruction);

        // 7. Audit Log
        const auditLog = manager.create(AuditLog, {
          entityType: 'SettlementInstruction',
          entityId: savedInstruction.id,
          action: 'CREATED',
          newState: { status: savedInstruction.status, isAccountActive },
          performedBy: 'SYSTEM',
        });
        await manager.save(AuditLog, auditLog);

        return savedInstruction;
      });
    } catch (error: any) {
      // Catch Idempotency duplicate outside the transaction
      if (error.code === '23505') {
         // PostgreSQL unique violation. Verify it's the idempotency key index.
         const constraintMatches = error.constraint && error.constraint.includes('idempotencyKey');
         const detailMatches = error.detail && error.detail.includes('idempotencyKey');
         
         this.logger.log(`Idempotency duplicate detected for key ${idempotencyKey}`);
         const existing = await this.dataSource.getRepository(SettlementInstruction).findOne({ where: { idempotencyKey } });
         if (!existing) {
           throw new ConflictException('Idempotency error, but could not retrieve existing record');
         }
         return existing;
      }
      throw error;
    }
  }
}
