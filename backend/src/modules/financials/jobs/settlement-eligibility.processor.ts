import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { FINANCIAL_SETTLEMENTS_QUEUE, JOB_EVALUATE_SETTLEMENT } from '../constants/financials.constants.js';
import { Order } from '../../orders/entities/order.entity.js';
import { OrderStatus } from '../../orders/enums/order-status.enum.js';
import { MealAllocation } from '../../community-meals/entities/meal-allocation.entity.js';
import { SettlementInstructionService } from '../services/settlement-instruction.service.js';

@Processor(FINANCIAL_SETTLEMENTS_QUEUE)
export class SettlementEligibilityProcessor extends WorkerHost {
  private readonly logger = new Logger(SettlementEligibilityProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly settlementInstructionService: SettlementInstructionService,
  ) {
    super();
  }

  async process(job: Job<{ orderId: string }>): Promise<void> {
    if (job.name !== JOB_EVALUATE_SETTLEMENT) {
      this.logger.warn(`Unknown settlement job name: ${job.name}`);
      return;
    }

    const { orderId } = job.data;
    if (!orderId) {
      this.logger.error('Settlement job missing orderId in payload');
      throw new Error('Missing orderId in job payload');
    }

    // 1. Load authoritative Order state
    const order = await this.dataSource.getRepository(Order).findOne({ where: { id: orderId } });
    if (!order) {
      this.logger.warn(`Order ${orderId} not found. Safe no-op.`);
      return;
    }

    // 2. Verify Order.status === DELIVERED
    if (order.status !== OrderStatus.DELIVERED) {
      this.logger.warn(`Order ${orderId} is not DELIVERED (status: ${order.status}). Safe no-op.`);
      return;
    }

    // 3. Determine whether MealAllocation exists (Community Meal vs Retail)
    const mealAllocation = await this.dataSource.getRepository(MealAllocation).findOne({ where: { orderId } });
    if (!mealAllocation) {
      this.logger.debug(`Order ${orderId} is a retail order (no MealAllocation). Safe no-op.`);
      return;
    }

    // 4. Call SettlementInstructionService.createInstruction(orderId)
    this.logger.log(`Evaluating settlement eligibility for Community Meal order ${orderId}`);
    try {
      await this.settlementInstructionService.createInstruction(orderId);
      this.logger.log(`Successfully created settlement instruction for order ${orderId}`);
    } catch (error: any) {
      // 23505 is PostgreSQL unique constraint violation (duplicate key)
      // SettlementInstructionService explicitly handles idempotency inside createInstruction
      // but in case any unhandled business constraint or DB error escapes:
      if (error?.status >= 400 && error?.status < 500) {
        // Business logic error from service (e.g., BadRequestException, ConflictException)
        this.logger.error(`Settlement eligibility failed for order ${orderId} due to business rule: ${error.message}`);
        throw error; // This might be considered terminal, but we let BullMQ handle retry limits
      }
      this.logger.error(`Error processing settlement for order ${orderId}: ${error.message}`);
      throw error; // Retryable infrastructure error or unexpected exception
    }
  }
}
