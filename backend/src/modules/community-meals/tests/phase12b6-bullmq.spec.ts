import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { LedgerLockProcessor } from '../processors/ledger-lock.processor.js';
import { CommunityMealMenuLedgerService } from '../services/community-meal-menu-ledger.service.js';
import { LedgerLockSchedulerService } from '../services/ledger-lock-scheduler.service.js';
import { LockResult } from '../enums/lock-result.enum.js';
import { UnrecoverableError } from 'bullmq';

describe('BullMQ Ledger Lock', () => {
  let processor: LedgerLockProcessor;
  let ledgerService: any;
  let schedulerService: any;

  beforeEach(async () => {
    ledgerService = {
      autoLock: vi.fn(),
      getLedgerInternal: vi.fn(),
    } as any;

    schedulerService = {
      scheduleLock: vi.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerLockProcessor,
        { provide: CommunityMealMenuLedgerService, useValue: ledgerService },
        { provide: LedgerLockSchedulerService, useValue: schedulerService },
      ],
    }).compile();

    processor = module.get<LedgerLockProcessor>(LedgerLockProcessor);
  });

  const makeJob = (data: any) => ({ data } as any);

  it('job before menuLockAt -> TOO_EARLY -> reschedule safely', async () => {
    ledgerService.autoLock.mockResolvedValue(LockResult.TOO_EARLY);
    ledgerService.getLedgerInternal.mockResolvedValue({ menuLockAt: new Date(Date.now() + 10000) } as any);

    await processor.process(makeJob({ ledgerId: '1', expectedVersion: 1 }));
    expect(schedulerService.scheduleLock).toHaveBeenCalled();
  });

  it('job exactly at/after menuLockAt -> LOCK_SUCCESS', async () => {
    ledgerService.autoLock.mockResolvedValue(LockResult.LOCK_SUCCESS);
    await processor.process(makeJob({ ledgerId: '1', expectedVersion: 1 }));
    expect(ledgerService.autoLock).toHaveBeenCalledWith('1', 1);
  });

  it('stale version -> STALE_JOB', async () => {
    ledgerService.autoLock.mockResolvedValue(LockResult.STALE_JOB);
    await processor.process(makeJob({ ledgerId: '1', expectedVersion: 1 }));
  });

  it('already locked -> ALREADY_LOCKED', async () => {
    ledgerService.autoLock.mockResolvedValue(LockResult.ALREADY_LOCKED);
    await processor.process(makeJob({ ledgerId: '1', expectedVersion: 1 }));
  });

  it('early confirmed -> ALREADY_FINALIZED', async () => {
    ledgerService.autoLock.mockResolvedValue(LockResult.ALREADY_FINALIZED);
    await processor.process(makeJob({ ledgerId: '1', expectedVersion: 1 }));
  });

  it('not found -> terminal non-retryable failure', async () => {
    ledgerService.autoLock.mockResolvedValue(LockResult.NOT_FOUND);
    await expect(processor.process(makeJob({ ledgerId: '1', expectedVersion: 1 })))
      .rejects.toThrow(UnrecoverableError);
  });

  it('retryable failure -> throws to trigger BullMQ retry', async () => {
    ledgerService.autoLock.mockResolvedValue(LockResult.RETRYABLE_FAILURE);
    await expect(processor.process(makeJob({ ledgerId: '1', expectedVersion: 1 })))
      .rejects.toThrow('Transient failure');
  });
});
