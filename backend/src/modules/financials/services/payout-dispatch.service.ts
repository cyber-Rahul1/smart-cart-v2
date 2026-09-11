import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { KitchenCompliance } from '../../community-meals/entities/kitchen-compliance.entity.js';
import { PAYOUT_PROVIDER } from '../constants/payout.constants.js';
import type { IPayoutProvider } from '../interfaces/payout-provider.interface.js';
import { PayoutDispatchRequest, PayoutDispatchResult } from '../interfaces/payout-provider.interface.js';
import { PayoutDispatchStatus } from '../enums/payout-dispatch-status.enum.js';
import { MoneyUtil } from '../../../core/utils/money.util.js';

export const buildPayoutIdempotencyKey = (settlementInstructionId: string): string => `payout-${settlementInstructionId}`;

@Injectable()
export class PayoutDispatchService {
  private readonly logger = new Logger(PayoutDispatchService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(PAYOUT_PROVIDER) private readonly payoutProvider: IPayoutProvider,
  ) {}

  async dispatch(instructionId: string): Promise<SettlementInstruction | null> {
    // 1. Eligibility Check (Read-Only)
    const eligible = await this.checkEligibility(instructionId);
    if (!eligible) {
      this.logger.warn(`Dispatch aborted: Instruction ${instructionId} is not eligible. Leaving as PENDING.`);
      return this.dataSource.getRepository(SettlementInstruction).findOne({ where: { id: instructionId } });
    }

    // 2. CAS State Claim (Transaction 1)
    const claimedInstruction = await this.claimDispatch(instructionId);
    if (!claimedInstruction) {
      this.logger.log(`Dispatch aborted: Could not claim instruction ${instructionId}. Another worker may have claimed it, or status is invalid.`);
      return null; // Return null if CAS fails (loser)
    }

    // 3. Provider Call (Outside Transaction)
    // Convert decimal DB snapshot (e.g. 10.50) back to minor units (1050)
    const amountInMinorUnits = MoneyUtil.toMinorUnit(claimedInstruction.providerNetSettlement);

    const request: PayoutDispatchRequest = {
      providerIdempotencyKey: buildPayoutIdempotencyKey(claimedInstruction.id),
      amountInMinorUnits,
      currency: 'INR',
      beneficiaryRef: claimedInstruction.providerAccountId,
      narration: `settlement-order-${claimedInstruction.orderId}`,
    };

    let result: PayoutDispatchResult;
    try {
      result = await this.payoutProvider.dispatchPayout(request);
    } catch (err: any) {
      this.logger.error(`Provider network failure for instruction ${instructionId}`, err.stack);
      // Fallback to UNKNOWN status to leave it in PROCESSING for reconciliation
      result = {
        providerTransferId: null,
        status: PayoutDispatchStatus.UNKNOWN,
        errorCode: 'PROVIDER_NETWORK_FAILURE',
        errorDetails: { message: err.message },
      };
    }

    // 4. Result Persistence (Transaction 2)
    return this.persistResult(claimedInstruction, result);
  }

  private async checkEligibility(instructionId: string): Promise<boolean> {
    const instruction = await this.dataSource.getRepository(SettlementInstruction).findOne({ where: { id: instructionId } });
    if (!instruction) {
      return false;
    }
    // Only PENDING and FAILED_RETRY can be dispatched
    if (instruction.status !== SettlementInstructionStatus.PENDING && instruction.status !== SettlementInstructionStatus.FAILED_RETRY) {
      return false;
    }
    const compliance = await this.dataSource.getRepository(KitchenCompliance).findOne({ where: { shopId: instruction.providerAccountId } });
    if (!compliance || compliance.settlementAccountStatus !== 'ACTIVE') {
      return false;
    }
    return true;
  }

  private async claimDispatch(instructionId: string): Promise<SettlementInstruction | null> {
    return await this.dataSource.transaction(async (manager) => {
      const updateResult = await manager
        .createQueryBuilder()
        .update(SettlementInstruction)
        .set({
          status: SettlementInstructionStatus.PROCESSING,
          retryCount: () => '"retryCount" + 1',
          lastAttemptAt: new Date(),
        })
        .where('id = :id', { id: instructionId })
        .andWhere('status IN (:...statuses)', { statuses: [SettlementInstructionStatus.PENDING, SettlementInstructionStatus.FAILED_RETRY] })
        .execute();

      if (updateResult.affected === 0) {
        return null;
      }
      return await manager.findOne(SettlementInstruction, { where: { id: instructionId } });
    });
  }

  private async persistResult(instruction: SettlementInstruction, result: PayoutDispatchResult): Promise<SettlementInstruction> {
    // If persistence fails, the DB safely remains in PROCESSING
    return await this.dataSource.transaction(async (manager) => {
      let finalStatus: SettlementInstructionStatus;
      let completedAt: Date | null = null;
      let failedAt: Date | null = null;

      switch (result.status) {
        case PayoutDispatchStatus.ACCEPTED:
        case PayoutDispatchStatus.PROCESSING:
        case PayoutDispatchStatus.UNKNOWN:
          finalStatus = SettlementInstructionStatus.PROCESSING;
          break;
        case PayoutDispatchStatus.COMPLETED:
          finalStatus = SettlementInstructionStatus.COMPLETED;
          completedAt = new Date();
          break;
        case PayoutDispatchStatus.FAILED:
          finalStatus = SettlementInstructionStatus.FAILED;
          failedAt = new Date();
          break;
      }

      await manager.update(SettlementInstruction, instruction.id, {
        status: finalStatus,
        providerTransferId: result.providerTransferId ?? undefined,
        errorCode: result.errorCode,
        // The providerResponse field in DB will store errorDetails if it's the only context provided by IPayoutProvider
        // We ensure we only persist what the abstraction exposes, avoiding raw HTTP responses.
        errorDetails: result.errorDetails as Record<string, any> || null,
        completedAt,
        failedAt,
      });

      return await manager.findOneOrFail(SettlementInstruction, { where: { id: instruction.id } });
    });
  }
}
