import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { WebhookEvent, WebhookEventStatus } from '../../payments/entities/webhook-event.entity.js';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { PAYOUT_PROVIDER } from '../constants/payout.constants.js';
import type { IPayoutProvider } from '../interfaces/payout-provider.interface.js';
import { PayoutProviderStatus } from '../enums/payout-provider-status.enum.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { canTransition } from '../utils/settlement-status.transition.js';

@Injectable()
export class PayoutWebhooksService {
  private readonly logger = new Logger(PayoutWebhooksService.name);

  // Derive the provider identity for WebhookEvent from the configured injection token
  private readonly providerName = 'PAYOUT_PROVIDER';

  constructor(
    @Inject(PAYOUT_PROVIDER) private readonly payoutProvider: IPayoutProvider,
    @InjectRepository(WebhookEvent) private readonly webhookEventRepo: Repository<WebhookEvent>,
    private readonly dataSource: DataSource,
  ) {}

  async processWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer, payload: unknown): Promise<void> {
    // 1. Verify Signature (outside DB transaction)
    const isValid = this.payoutProvider.verifyWebhook(headers, rawBody);
    if (!isValid) {
      this.logger.warn('Invalid payout webhook signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    // 2. Parse Event
    let parsedEvent;
    try {
      parsedEvent = this.payoutProvider.parseWebhookEvent(payload);
    } catch (err) {
      this.logger.warn('Failed to parse payout webhook payload');
      throw new BadRequestException('Invalid payload format');
    }

    const { providerEventId, providerTransferId, status } = parsedEvent;

    // 3. Deduplication & VERIFIED State creation (Outside settlement transaction)
    let webhookEvent: WebhookEvent | null = null;
    try {
      webhookEvent = this.webhookEventRepo.create({
        provider: this.providerName,
        eventId: providerEventId,
        status: WebhookEventStatus.VERIFIED,
      });
      await this.webhookEventRepo.save(webhookEvent);
    } catch (err) {
      if (err instanceof QueryFailedError && err.message.includes('unique constraint')) {
        // Concurrent duplicate race or retry: read existing
        webhookEvent = await this.webhookEventRepo.findOne({
          where: { provider: this.providerName, eventId: providerEventId },
        });
      } else {
        throw err;
      }
    }

    if (!webhookEvent) {
      throw new Error(`Failed to resolve WebhookEvent for ${providerEventId}`);
    }

    if (webhookEvent.status === WebhookEventStatus.PROCESSED) {
      this.logger.log(`Payout webhook ${providerEventId} already processed. Ignored.`);
      return; // Idempotent success
    }

    // 4. State Transition (Inside DB Transaction)
    try {
      await this.dataSource.transaction(async (manager) => {
        // Lock the instruction
        const instruction = await manager.findOne(SettlementInstruction, {
          where: { providerTransferId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!instruction) {
          this.logger.warn(`Settlement instruction not found for providerTransferId: ${providerTransferId}`);
          // Mark event as failed. This is retryable if it arrived early.
          webhookEvent!.status = WebhookEventStatus.FAILED;
          await manager.save(WebhookEvent, webhookEvent);
          return;
        }

        // Apply state transition rules
        let targetStatus: SettlementInstructionStatus | null = null;

        if (status === PayoutProviderStatus.COMPLETED) {
          targetStatus = SettlementInstructionStatus.COMPLETED;
        } else if (status === PayoutProviderStatus.FAILED) {
          // Strictly trust the adapter: it guarantees no money moved
          targetStatus = SettlementInstructionStatus.FAILED;
        } else if (status === PayoutProviderStatus.PROCESSING || status === PayoutProviderStatus.UNKNOWN || status === PayoutProviderStatus.NOT_FOUND) {
          targetStatus = SettlementInstructionStatus.PROCESSING;
        }

        if (targetStatus && targetStatus !== instruction.status) {
          const isAllowed = canTransition(instruction.status, targetStatus);
          
          if (isAllowed) {
            instruction.status = targetStatus;
            
            if (targetStatus === SettlementInstructionStatus.COMPLETED) {
              instruction.completedAt = new Date();
            } else if (targetStatus === SettlementInstructionStatus.FAILED) {
              instruction.failedAt = new Date();
              // In a real provider, we'd extract normalized error codes from parsedEvent if it had them.
              // For now, we just rely on IPayoutProvider's strict status mapping.
            }
            await manager.save(SettlementInstruction, instruction);
          } else {
            this.logger.warn(`Ignored invalid terminal transition for instruction ${instruction.id} from ${instruction.status} to ${targetStatus}`);
          }
        }

        // Mark webhook event processed atomically
        webhookEvent!.status = WebhookEventStatus.PROCESSED;
        webhookEvent!.processedAt = new Date();
        await manager.save(WebhookEvent, webhookEvent);
      });
    } catch (err) {
      this.logger.error(`Failed to process payout webhook ${providerEventId}`, (err as Error).stack);
      // We don't mark as FAILED inside catch unless we want to commit it outside transaction,
      // but leaving it VERIFIED is fine - it will be retried.
      throw err;
    }
  }
}
