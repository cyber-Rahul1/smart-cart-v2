import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { CommunityMealMenuLedgerService } from '../services/community-meal-menu-ledger.service.js';
import { LockResult } from '../enums/lock-result.enum.js';
import { LedgerLockSchedulerService } from '../services/ledger-lock-scheduler.service.js';

@Processor('ledgerLockQueue')
@Injectable()
export class LedgerLockProcessor extends WorkerHost {
  private readonly logger = new Logger(LedgerLockProcessor.name);

  constructor(
    private readonly ledgerService: CommunityMealMenuLedgerService,
    private readonly schedulerService: LedgerLockSchedulerService,
  ) {
    super();
  }

  async process(job: Job<{ ledgerId: string; expectedVersion: number }>): Promise<void> {
    const { ledgerId, expectedVersion } = job.data;
    this.logger.debug(`Processing lock job for ledger ${ledgerId} (version ${expectedVersion})`);

    const result = await this.ledgerService.autoLock(ledgerId, expectedVersion);

    switch (result) {
      case LockResult.LOCK_SUCCESS:
        this.logger.log(`Successfully locked ledger ${ledgerId}`);
        break;
      case LockResult.ALREADY_LOCKED:
      case LockResult.ALREADY_FINALIZED:
      case LockResult.STALE_JOB:
        this.logger.debug(`Job NO-OP for ledger ${ledgerId}. Result: ${result}`);
        break;
      case LockResult.TOO_EARLY:
        this.logger.log(`Job TOO_EARLY for ledger ${ledgerId}. Rescheduling...`);
        // We need to fetch the actual menuLockAt to reschedule accurately
        // It's better if autoLock throws an exception that we catch, or we look it up.
        // I will let the service handle rescheduling or throw. Actually, we can fetch the ledger here
        // or let the service reschedule. If we want the processor to reschedule:
        const ledger = await this.ledgerService.getLedgerInternal(ledgerId);
        if (ledger && ledger.menuLockAt) {
          await this.schedulerService.scheduleLock(ledgerId, expectedVersion, ledger.menuLockAt);
        }
        break;
      case LockResult.NOT_FOUND:
        this.logger.warn(`Ledger ${ledgerId} not found. Terminating job.`);
        throw new UnrecoverableError(`Ledger ${ledgerId} not found`);
      case LockResult.RETRYABLE_FAILURE:
        this.logger.warn(`Retryable failure for ledger ${ledgerId}. Throwing to trigger BullMQ retry.`);
        throw new Error(`Transient failure for ledger ${ledgerId}`);
    }
  }
}
