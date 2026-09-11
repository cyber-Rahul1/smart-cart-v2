import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PayoutDispatchService, buildPayoutIdempotencyKey } from '../services/payout-dispatch.service.js';
import { PAYOUT_PROVIDER } from '../constants/payout.constants.js';
import { IPayoutProvider, PayoutDispatchResult } from '../interfaces/payout-provider.interface.js';
import { PayoutDispatchStatus } from '../enums/payout-dispatch-status.enum.js';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { KitchenCompliance } from '../../community-meals/entities/kitchen-compliance.entity.js';
import { vi } from 'vitest';

describe('PayoutDispatchService', () => {
  let service: PayoutDispatchService;
  let mockDataSource: any;
  let mockPayoutProvider: any;
  let mockEntityManager: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    mockEntityManager = {
      createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
      findOne: vi.fn(),
      update: vi.fn(),
      findOneOrFail: vi.fn(),
    };

    mockDataSource = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockEntityManager)),
      getRepository: vi.fn(),
    };

    mockPayoutProvider = {
      dispatchPayout: vi.fn(),
      getPayoutStatus: vi.fn(),
      verifyWebhook: vi.fn(),
      parseWebhookEvent: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutDispatchService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: PAYOUT_PROVIDER, useValue: mockPayoutProvider },
      ],
    }).compile();

    service = module.get<PayoutDispatchService>(PayoutDispatchService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Eligibility Check', () => {
    it('should block dispatch if instruction is not found', async () => {
      mockDataSource.getRepository.mockReturnValue({
        findOne: vi.fn().mockResolvedValue(null),
      });

      const result = await service.dispatch('inst-1');
      expect(result).toBeNull();
      expect(mockPayoutProvider.dispatchPayout).not.toHaveBeenCalled();
    });

    it('should block dispatch if instruction is in COMPLETED state', async () => {
      const instruction = new SettlementInstruction();
      instruction.status = SettlementInstructionStatus.COMPLETED;

      mockDataSource.getRepository.mockReturnValue({
        findOne: vi.fn().mockResolvedValue(instruction),
      });

      const result = await service.dispatch('inst-1');
      expect(result).toEqual(instruction);
      expect(mockPayoutProvider.dispatchPayout).not.toHaveBeenCalled();
    });

    it('should block dispatch if compliance account is inactive', async () => {
      const instruction = new SettlementInstruction();
      instruction.status = SettlementInstructionStatus.PENDING;
      instruction.providerAccountId = 'shop-1';

      const compliance = new KitchenCompliance();
      compliance.settlementAccountStatus = 'INACTIVE';

      mockDataSource.getRepository.mockImplementation((entity: any) => {
        if (entity === SettlementInstruction) {
          return { findOne: vi.fn().mockResolvedValue(instruction) };
        }
        if (entity === KitchenCompliance) {
          return { findOne: vi.fn().mockResolvedValue(compliance) };
        }
      });

      const result = await service.dispatch('inst-1');
      expect(result).toEqual(instruction);
      expect(mockPayoutProvider.dispatchPayout).not.toHaveBeenCalled();
    });
  });

  describe('Dispatch Processing', () => {
    let validInstruction: SettlementInstruction;
    let validCompliance: KitchenCompliance;

    beforeEach(() => {
      validInstruction = new SettlementInstruction();
      validInstruction.id = 'inst-1';
      validInstruction.orderId = 'order-1';
      validInstruction.providerAccountId = 'shop-1';
      validInstruction.providerNetSettlement = 10.50; // $10.50
      validInstruction.status = SettlementInstructionStatus.PENDING;

      validCompliance = new KitchenCompliance();
      validCompliance.settlementAccountStatus = 'ACTIVE';

      mockDataSource.getRepository.mockImplementation((entity: any) => {
        if (entity === SettlementInstruction) {
          return { findOne: vi.fn().mockResolvedValue(validInstruction) };
        }
        if (entity === KitchenCompliance) {
          return { findOne: vi.fn().mockResolvedValue(validCompliance) };
        }
      });

      mockEntityManager.findOne.mockResolvedValue(validInstruction);
      mockEntityManager.findOneOrFail.mockResolvedValue(validInstruction);
    });

    it('should exit if CAS claim fails (concurrent worker won)', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 }); // CAS failed

      const result = await service.dispatch('inst-1');

      expect(result).toBeNull();
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(SettlementInstruction);
      expect(mockPayoutProvider.dispatchPayout).not.toHaveBeenCalled();
    });

    it('should call provider with correct idempotency key and normalized amount', async () => {
      mockPayoutProvider.dispatchPayout.mockResolvedValue({
        status: PayoutDispatchStatus.ACCEPTED,
        providerTransferId: 'tx-123',
        errorCode: null,
        errorDetails: null,
      });

      await service.dispatch('inst-1');

      expect(mockPayoutProvider.dispatchPayout).toHaveBeenCalledWith({
        providerIdempotencyKey: 'payout-inst-1',
        amountInMinorUnits: 1050, // 10.50 * 100
        currency: 'INR',
        beneficiaryRef: 'shop-1',
        narration: 'settlement-order-order-1',
      });
    });

    it('should map ACCEPTED to PROCESSING without failing', async () => {
      mockPayoutProvider.dispatchPayout.mockResolvedValue({
        status: PayoutDispatchStatus.ACCEPTED,
        providerTransferId: 'tx-1',
        errorCode: null,
        errorDetails: null,
      });

      await service.dispatch('inst-1');

      expect(mockEntityManager.update).toHaveBeenCalledWith(
        SettlementInstruction,
        'inst-1',
        expect.objectContaining({
          status: SettlementInstructionStatus.PROCESSING,
          providerTransferId: 'tx-1',
        })
      );
    });

    it('should map COMPLETED to COMPLETED and set completedAt', async () => {
      mockPayoutProvider.dispatchPayout.mockResolvedValue({
        status: PayoutDispatchStatus.COMPLETED,
        providerTransferId: 'tx-2',
        errorCode: null,
        errorDetails: null,
      });

      await service.dispatch('inst-1');

      expect(mockEntityManager.update).toHaveBeenCalledWith(
        SettlementInstruction,
        'inst-1',
        expect.objectContaining({
          status: SettlementInstructionStatus.COMPLETED,
          completedAt: expect.any(Date),
        })
      );
    });

    it('should map FAILED to FAILED and set failedAt, errorCode, errorDetails', async () => {
      const errorDetails = { reason: 'insufficient_funds' };
      mockPayoutProvider.dispatchPayout.mockResolvedValue({
        status: PayoutDispatchStatus.FAILED,
        providerTransferId: null,
        errorCode: 'PROVIDER_REJECTED',
        errorDetails,
      });

      await service.dispatch('inst-1');

      expect(mockEntityManager.update).toHaveBeenCalledWith(
        SettlementInstruction,
        'inst-1',
        expect.objectContaining({
          status: SettlementInstructionStatus.FAILED,
          failedAt: expect.any(Date),
          errorCode: 'PROVIDER_REJECTED',
          errorDetails,
        })
      );
    });

    it('should map UNKNOWN to PROCESSING and persist errorDetails', async () => {
      mockPayoutProvider.dispatchPayout.mockRejectedValue(new Error('Connection timeout'));

      await service.dispatch('inst-1');

      expect(mockEntityManager.update).toHaveBeenCalledWith(
        SettlementInstruction,
        'inst-1',
        expect.objectContaining({
          status: SettlementInstructionStatus.PROCESSING, // Stays in PROCESSING for reconciliation
          errorCode: 'PROVIDER_NETWORK_FAILURE',
          errorDetails: { message: 'Connection timeout' },
        })
      );
    });
  });
});
