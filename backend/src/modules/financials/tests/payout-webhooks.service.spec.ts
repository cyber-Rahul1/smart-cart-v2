import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { PayoutWebhooksService } from '../services/payout-webhooks.service.js';
import { WebhookEvent, WebhookEventStatus } from '../../payments/entities/webhook-event.entity.js';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { PAYOUT_PROVIDER } from '../constants/payout.constants.js';
import { PayoutProviderStatus } from '../enums/payout-provider-status.enum.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { vi } from 'vitest';

describe('PayoutWebhooksService', () => {
  let service: PayoutWebhooksService;
  let mockDataSource: any;
  let mockWebhookEventRepo: any;
  let mockPayoutProvider: any;
  let mockEntityManager: any;

  beforeEach(async () => {
    mockEntityManager = {
      findOne: vi.fn(),
      save: vi.fn(),
    };

    mockDataSource = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockEntityManager)),
    };

    mockWebhookEventRepo = {
      create: vi.fn().mockImplementation((dto) => dto),
      save: vi.fn().mockResolvedValue(null),
      findOne: vi.fn(),
    };

    mockPayoutProvider = {
      verifyWebhook: vi.fn().mockReturnValue(true),
      parseWebhookEvent: vi.fn().mockReturnValue({
        providerEventId: 'evt_123',
        providerTransferId: 'tx_123',
        status: PayoutProviderStatus.COMPLETED,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutWebhooksService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: PAYOUT_PROVIDER, useValue: mockPayoutProvider },
        { provide: getRepositoryToken(WebhookEvent), useValue: mockWebhookEventRepo },
      ],
    }).compile();

    service = module.get<PayoutWebhooksService>(PayoutWebhooksService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Signature and Payload Validation', () => {
    it('throws BadRequestException for invalid signature without writing to DB', async () => {
      mockPayoutProvider.verifyWebhook.mockReturnValue(false);
      
      await expect(service.processWebhook({}, Buffer.from(''), {}))
        .rejects.toThrow(BadRequestException);
      
      expect(mockWebhookEventRepo.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid payload format without writing to DB', async () => {
      mockPayoutProvider.parseWebhookEvent.mockImplementation(() => { throw new Error('Bad Format'); });
      
      await expect(service.processWebhook({}, Buffer.from(''), {}))
        .rejects.toThrow(BadRequestException);
      
      expect(mockWebhookEventRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('Deduplication and Concurrency', () => {
    it('ignores webhook if WebhookEvent already exists and is PROCESSED', async () => {
      const error = new QueryFailedError('query', [], new Error('unique constraint violation'));
      mockWebhookEventRepo.save.mockRejectedValueOnce(error);
      mockWebhookEventRepo.findOne.mockResolvedValueOnce({
        status: WebhookEventStatus.PROCESSED,
      });

      await service.processWebhook({}, Buffer.from(''), {});

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('retries safely if WebhookEvent exists and is VERIFIED', async () => {
      const error = new QueryFailedError('query', [], new Error('unique constraint violation'));
      mockWebhookEventRepo.save.mockRejectedValueOnce(error);
      const existingEvent = { status: WebhookEventStatus.VERIFIED };
      mockWebhookEventRepo.findOne.mockResolvedValueOnce(existingEvent);

      const instruction = new SettlementInstruction();
      instruction.status = SettlementInstructionStatus.PROCESSING;
      mockEntityManager.findOne.mockResolvedValue(instruction);

      await service.processWebhook({}, Buffer.from(''), {});

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockEntityManager.save).toHaveBeenCalledWith(WebhookEvent, expect.objectContaining({
        status: WebhookEventStatus.PROCESSED,
      }));
    });
  });

  describe('State Transitions and Timestamps', () => {
    let instruction: SettlementInstruction;

    beforeEach(() => {
      instruction = new SettlementInstruction();
      instruction.id = 'inst-1';
      instruction.status = SettlementInstructionStatus.PROCESSING;
      instruction.lastAttemptAt = new Date('2026-01-01T00:00:00Z');
      
      mockEntityManager.findOne.mockResolvedValue(instruction);
    });

    it('PROCESSING webhook leaves lastAttemptAt unchanged', async () => {
      mockPayoutProvider.parseWebhookEvent.mockReturnValue({
        providerEventId: 'evt_123',
        providerTransferId: 'tx_123',
        status: PayoutProviderStatus.PROCESSING,
      });

      await service.processWebhook({}, Buffer.from(''), {});

      // Instruction save should not have been called because status didn't change (still PROCESSING)
      // Actually, if it is PROCESSING -> PROCESSING, the helper allows it (noop), but we only save if status changed!
      expect(mockEntityManager.save).not.toHaveBeenCalledWith(SettlementInstruction, expect.any(Object));
      expect(instruction.lastAttemptAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it('COMPLETED webhook updates completedAt', async () => {
      mockPayoutProvider.parseWebhookEvent.mockReturnValue({
        providerEventId: 'evt_123',
        providerTransferId: 'tx_123',
        status: PayoutProviderStatus.COMPLETED,
      });

      await service.processWebhook({}, Buffer.from(''), {});

      expect(mockEntityManager.save).toHaveBeenCalledWith(SettlementInstruction, expect.objectContaining({
        status: SettlementInstructionStatus.COMPLETED,
        completedAt: expect.any(Date),
      }));
    });

    it('FAILED webhook maps blindly and updates failedAt', async () => {
      mockPayoutProvider.parseWebhookEvent.mockReturnValue({
        providerEventId: 'evt_123',
        providerTransferId: 'tx_123',
        status: PayoutProviderStatus.FAILED,
      });

      await service.processWebhook({}, Buffer.from(''), {});

      expect(mockEntityManager.save).toHaveBeenCalledWith(SettlementInstruction, expect.objectContaining({
        status: SettlementInstructionStatus.FAILED,
        failedAt: expect.any(Date),
      }));
    });

    it('Duplicate terminal webhook does NOT rewrite completedAt', async () => {
      instruction.status = SettlementInstructionStatus.COMPLETED;
      instruction.completedAt = new Date('2026-01-01T00:00:00Z');

      mockPayoutProvider.parseWebhookEvent.mockReturnValue({
        providerEventId: 'evt_123',
        providerTransferId: 'tx_123',
        status: PayoutProviderStatus.COMPLETED,
      });

      await service.processWebhook({}, Buffer.from(''), {});

      expect(mockEntityManager.save).not.toHaveBeenCalledWith(SettlementInstruction, expect.any(Object));
      expect(instruction.completedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it('Terminal states cannot be reopened', async () => {
      instruction.status = SettlementInstructionStatus.COMPLETED;
      
      mockPayoutProvider.parseWebhookEvent.mockReturnValue({
        providerEventId: 'evt_123',
        providerTransferId: 'tx_123',
        status: PayoutProviderStatus.FAILED,
      });

      await service.processWebhook({}, Buffer.from(''), {});

      // No state change
      expect(mockEntityManager.save).not.toHaveBeenCalledWith(SettlementInstruction, expect.any(Object));
      // But WebhookEvent IS marked PROCESSED
      expect(mockEntityManager.save).toHaveBeenCalledWith(WebhookEvent, expect.objectContaining({
        status: WebhookEventStatus.PROCESSED,
      }));
    });

    it('Ignores UNKNOWN_TRANSFER and safely marks event FAILED', async () => {
      mockEntityManager.findOne.mockResolvedValue(null);

      await service.processWebhook({}, Buffer.from(''), {});

      expect(mockEntityManager.save).toHaveBeenCalledWith(WebhookEvent, expect.objectContaining({
        status: WebhookEventStatus.FAILED,
      }));
    });

    it('Transaction failure does not mark WebhookEvent as PROCESSED', async () => {
      mockEntityManager.save.mockRejectedValueOnce(new Error('DB connection closed'));

      await expect(service.processWebhook({}, Buffer.from(''), {})).rejects.toThrow('DB connection closed');
      
      // WebhookEvent should not have been updated to PROCESSED
      expect(mockEntityManager.save).toHaveBeenCalledTimes(1); // The failing instruction save (or webhook event save if instruction was skipped)
    });
  });
});
