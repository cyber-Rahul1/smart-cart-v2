import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { PAYOUT_PROVIDER } from '../constants/payout.constants.js';
import type { IPayoutProvider } from '../interfaces/payout-provider.interface.js';
import { PayoutProviderStatus } from '../enums/payout-provider-status.enum.js';

@Injectable()
export class PayoutReconciliationService {
  private readonly logger = new Logger(PayoutReconciliationService.name);
  private isReconciling = false;

  constructor(
    @Inject(PAYOUT_PROVIDER) private readonly payoutProvider: IPayoutProvider,
    @InjectRepository(SettlementInstruction)
    private readonly instructionRepo: Repository<SettlementInstruction>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcilePendingPayouts() {
    if (this.isReconciling) {
      this.logger.debug('Reconciliation already running, skipping this interval.');
      return;
    }

    this.isReconciling = true;
    try {
      const thresholdTime = new Date();
      thresholdTime.setMinutes(thresholdTime.getMinutes() - 15);

      // Candidate Selection (T0)
      const candidates = await this.instructionRepo
        .createQueryBuilder('instruction')
        .where('instruction.status = :status', { status: SettlementInstructionStatus.PROCESSING })
        .andWhere('instruction.providerTransferId IS NOT NULL')
        .andWhere('instruction.lastAttemptAt IS NOT NULL')
        .andWhere('instruction.lastAttemptAt < :threshold', { threshold: thresholdTime })
        .take(50)
        .getMany();

      if (candidates.length === 0) {
        return;
      }

      this.logger.log(`Found ${candidates.length} stale PROCESSING payout instructions for reconciliation.`);

      // Process candidates sequentially
      for (const candidate of candidates) {
        await this.reconcileInstruction(candidate);
      }
    } catch (error) {
      this.logger.error('Error during payout reconciliation job', error instanceof Error ? error.stack : String(error));
    } finally {
      this.isReconciling = false;
    }
  }

  private async reconcileInstruction(candidate: SettlementInstruction) {
    const providerTransferId = candidate.providerTransferId;
    if (!providerTransferId) {
      return; // Defensive check, should be caught by DB query
    }

    let statusResult;
    try {
      // 1. Provider Call (T1 - No Tx)
      statusResult = await this.payoutProvider.getPayoutStatus(providerTransferId);
    } catch (error: any) {
      this.logger.error(`Failed to fetch payout status for instruction ${candidate.id}`, error.stack);
      // We do NOT modify the DB or terminal state on timeout/5xx
      return;
    }

    // 2. State Transition (T2 - Tx + Lock)
    try {
      await this.dataSource.transaction(async (manager) => {
        const instruction = await manager.findOne(SettlementInstruction, {
          where: { id: candidate.id },
          lock: { mode: 'pessimistic_write' },
        });

        // Authoritative State Check
        if (!instruction || instruction.status !== SettlementInstructionStatus.PROCESSING) {
          // It might have been completed by a concurrent webhook or already deleted
          this.logger.debug(`Instruction ${candidate.id} is no longer in PROCESSING status. Skipping reconciliation mutation.`);
          return;
        }

        // Apply state transitions
        const { status: providerStatus, providerResponse } = statusResult;
        let targetStatus: SettlementInstructionStatus = SettlementInstructionStatus.PROCESSING;
        let completedAt: Date | null = null;
        let failedAt: Date | null = null;

        if (providerStatus === PayoutProviderStatus.COMPLETED) {
          targetStatus = SettlementInstructionStatus.COMPLETED;
          completedAt = new Date();
        } else if (providerStatus === PayoutProviderStatus.FAILED) {
          // Strictly trust the adapter that no money moved
          targetStatus = SettlementInstructionStatus.FAILED;
          failedAt = new Date();
        }

        await manager.update(SettlementInstruction, instruction.id, {
          status: targetStatus,
          providerResponse: providerResponse as Record<string, any> || null,
          ...(completedAt && { completedAt }),
          ...(failedAt && { failedAt }),
        });
      });
    } catch (error: any) {
      this.logger.error(`Failed to reconcile state for instruction ${candidate.id}`, error.stack);
    }
  }
}
