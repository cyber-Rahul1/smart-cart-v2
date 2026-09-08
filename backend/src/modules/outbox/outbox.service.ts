import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OutboxEvent, OutboxEventStatus } from './entities/outbox-event.entity.js';
import { OUTBOX_QUEUE, JOB_PROCESS_OUTBOX_EVENT } from '../logistics/constants/logistics.constants.js';

/**
 * OutboxService -- DB-to-BullMQ relay.
 *
 * Responsibility: Poll the DB for PENDING outbox events and enqueue each as a
 * BullMQ job using jobId = event.id for deduplication. Actual processing is
 * done by OutboxProcessor (BullMQ worker).
 *
 * Durability guarantees:
 * - OutboxEvent is created inside the same DB transaction as the Order state
 *   transition, so it survives any application restart.
 * - BullMQ jobs are keyed by jobId = event.id. If the relay restarts before
 *   the worker runs, the next polling cycle re-enqueues the same jobId and
 *   BullMQ deduplicates -- no duplicate job is created.
 * - BullMQ Redis persistence ensures jobs survive an app crash between relay
 *   enqueue and worker processing.
 * - Once the worker marks the event PROCESSED the DB record is updated and
 *   the event no longer appears in the PENDING query.
 */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRelaying = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue(OUTBOX_QUEUE) private readonly outboxQueue: Queue,
  ) {}

  onModuleInit() {
    this.startRelay();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private startRelay() {
    this.timer = setInterval(() => this.relayPendingEvents(), 5000);
    void this.relayPendingEvents();
  }

  /**
   * Scan for PENDING outbox events and enqueue them as BullMQ jobs.
   * Public so tests can trigger immediate relay without waiting for the timer.
   */
  async relayPendingEvents(): Promise<void> {
    if (this.isRelaying) return;
    this.isRelaying = true;
    try {
      const pendingEvents = await this.dataSource.getRepository(OutboxEvent).find({
        where: { status: OutboxEventStatus.PENDING },
        order: { createdAt: 'ASC' },
        take: 100,
      });
      for (const event of pendingEvents) {
        try {
          await this.outboxQueue.add(
            JOB_PROCESS_OUTBOX_EVENT,
            { outboxEventId: event.id },
            {
              jobId: event.id,
              attempts: 5,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: 100,
              removeOnFail: 50,
            },
          );
          this.logger.debug(`Relayed outbox event ${event.id} (${event.type}) to BullMQ`);
        } catch (err) {
          this.logger.error(`Failed to relay outbox event ${event.id}`, (err as Error).message);
        }
      }
    } catch (err) {
      this.logger.error('Error during outbox relay', (err as Error).stack);
    } finally {
      this.isRelaying = false;
    }
  }
}
