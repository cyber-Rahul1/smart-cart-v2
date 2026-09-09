import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class LedgerLockSchedulerService {
  private readonly logger = new Logger(LedgerLockSchedulerService.name);

  constructor(
    @InjectQueue('ledgerLockQueue') private readonly ledgerLockQueue: Queue,
  ) {}

  async scheduleLock(ledgerId: string, version: number, lockAt: Date): Promise<void> {
    const delay = Math.max(0, lockAt.getTime() - Date.now());
    const payload = { ledgerId, expectedVersion: version };

    await this.ledgerLockQueue.add('lock', payload, {
      delay,
      jobId: `ledger-lock-${ledgerId}-${version}`, // Optional: Ensure unique job id per version
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    this.logger.log(`Scheduled lock for ledger ${ledgerId} (version ${version}) with delay ${delay}ms`);
  }
}
