import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PayoutReconciliationService } from '../services/payout-reconciliation.service.js';
import { PAYOUT_PROVIDER } from '../constants/payout.constants.js';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { PayoutProviderStatus } from '../enums/payout-provider-status.enum.js';
import type { IPayoutProvider } from '../interfaces/payout-provider.interface.js';
import { ALL_ENTITIES } from '../../../core/database/entities.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { randomUUID } from 'crypto';
import { vi, describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';

describe('PayoutReconciliationService Integration', () => {
  let moduleRef: TestingModule;
  let service: PayoutReconciliationService;
  let dataSource: DataSource;
  let instructionRepo: Repository<SettlementInstruction>;
  let mockProvider: import('vitest').Mocked<IPayoutProvider>;
  let testShopId: string;

  beforeAll(async () => {
    mockProvider = {
      dispatchPayout: vi.fn(),
      getPayoutStatus: vi.fn(),
      verifyWebhook: vi.fn(),
      parseWebhookEvent: vi.fn(),
    } as any;

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
            username: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || 'postgres',
            database: process.env.POSTGRES_DB || 'smart_cart',
            entities: ALL_ENTITIES,
            synchronize: true,
            dropSchema: false,
            logging: false,
        }),
        TypeOrmModule.forFeature([SettlementInstruction]),
      ],
      providers: [
        PayoutReconciliationService,
        {
          provide: PAYOUT_PROVIDER,
          useValue: mockProvider,
        },
      ],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    instructionRepo = dataSource.getRepository(SettlementInstruction);
    service = moduleRef.get(PayoutReconciliationService);

    await dataSource.synchronize(true);

    const userRepo = dataSource.getRepository(User);
    const owner = await userRepo.save(userRepo.create({
        phoneNumber: '+1' + Math.floor(Math.random() * 1000000000)
    }));

    const shopRepo = dataSource.getRepository(Shop);
    const shop = await shopRepo.save(shopRepo.create({
        ownerId: owner.id,
        name: 'Test Shop for Reconciliation',
        location: { type: 'Point', coordinates: [77, 12] },
    }));
    testShopId = shop.id;
  });

  afterAll(async () => {
    await dataSource.dropDatabase();
    await dataSource.destroy();
    await moduleRef.close();
  });

  beforeEach(async () => {
    await instructionRepo.clear();
    vi.clearAllMocks();
    // @ts-ignore
    service.isReconciling = false; // reset internal guard state
  });

  const createInstruction = async (
    status: SettlementInstructionStatus,
    stale: boolean,
    overrides?: Partial<SettlementInstruction>
  ) => {
    const lastAttemptAt = new Date();
    if (stale) {
      lastAttemptAt.setMinutes(lastAttemptAt.getMinutes() - 20); // older than 15 mins
    } else {
      lastAttemptAt.setMinutes(lastAttemptAt.getMinutes() - 5); // fresh
    }

    const instruction = instructionRepo.create({
      providerAccountId: testShopId,
      providerTransferId: 'tr_123',
      providerNetSettlement: 100.00,
      providerGrossAmount: 110.00,
      customerGrossAmount: 110.00,
      platformCommission: 5.00,
      paymentGatewayFees: 5.00,
      idempotencyKey: randomUUID(),
      status,
      lastAttemptAt,
      retryCount: 1,
      ...overrides,
    });
    return instructionRepo.save(instruction);
  };

  describe('Candidate Selection', () => {
    it('should select stale PROCESSING records only', async () => {
      const staleProcessing = await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'stale_proc' });
      const freshProcessing = await createInstruction(SettlementInstructionStatus.PROCESSING, false, { providerTransferId: 'fresh_proc' });
      const stalePending = await createInstruction(SettlementInstructionStatus.PENDING, true, { providerTransferId: 'stale_pending' });
      const staleCompleted = await createInstruction(SettlementInstructionStatus.COMPLETED, true, { providerTransferId: 'stale_comp', completedAt: new Date() });
      const staleFailed = await createInstruction(SettlementInstructionStatus.FAILED, true, { providerTransferId: 'stale_fail', failedAt: new Date() });
      const nullProviderId = await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: null as any });

      mockProvider.getPayoutStatus.mockResolvedValue({
        providerTransferId: 'tr',
        status: PayoutProviderStatus.PROCESSING,
        providerResponse: {},
      });

      await service.reconcilePendingPayouts();

      expect(mockProvider.getPayoutStatus).toHaveBeenCalledTimes(1);
      expect(mockProvider.getPayoutStatus).toHaveBeenCalledWith('stale_proc');
    });

    it('should respect bounded concurrency (sequential calls)', async () => {
      await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_1' });
      await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_2' });
      
      let running = 0;
      let maxRunning = 0;
      mockProvider.getPayoutStatus.mockImplementation(async () => {
        running++;
        if (running > maxRunning) maxRunning = running;
        await new Promise(r => setTimeout(r, 10)); // pretend network delay
        running--;
        return { providerTransferId: 'tr', status: PayoutProviderStatus.PROCESSING, providerResponse: {} };
      });

      await service.reconcilePendingPayouts();

      expect(maxRunning).toBe(1); // Never exceeded 1 concurrent call
      expect(mockProvider.getPayoutStatus).toHaveBeenCalledTimes(2);
    });

    it('should NEVER call dispatchPayout', async () => {
      await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_1' });
      mockProvider.getPayoutStatus.mockResolvedValue({ providerTransferId: 'tr_1', status: PayoutProviderStatus.PROCESSING, providerResponse: {} });
      await service.reconcilePendingPayouts();
      expect(mockProvider.dispatchPayout).not.toHaveBeenCalled();
    });
  });

  describe('Cron Overlap Guard', () => {
    it('should immediately exit if another invocation is running', async () => {
      await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_1' });

      // Hold the first call
      let release: () => void;
      const promise = new Promise<void>(r => { release = r; });
      mockProvider.getPayoutStatus.mockImplementation(async () => {
        await promise;
        return { providerTransferId: 'tr_1', status: PayoutProviderStatus.PROCESSING, providerResponse: {} };
      });

      const firstCall = service.reconcilePendingPayouts();
      
      // Wait a tick to ensure first call has set isReconciling
      await new Promise(r => setTimeout(r, 10));

      // Second call should exit immediately
      await service.reconcilePendingPayouts();
      expect(mockProvider.getPayoutStatus).toHaveBeenCalledTimes(1);

      release!();
      await firstCall;

      // Third call should work because guard was released
      mockProvider.getPayoutStatus.mockResolvedValue({ providerTransferId: 'tr_1', status: PayoutProviderStatus.PROCESSING, providerResponse: {} });
      await service.reconcilePendingPayouts();
      expect(mockProvider.getPayoutStatus).toHaveBeenCalledTimes(2);
    });

    it('should release the guard in finally block if provider call throws', async () => {
      await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_1' });
      mockProvider.getPayoutStatus.mockRejectedValue(new Error('Network Error'));

      await service.reconcilePendingPayouts();
      // @ts-ignore
      expect(service.isReconciling).toBe(false);
    });
    
    it('should release the guard in finally block if T0 query throws', async () => {
      // Mock the repo to throw
      const originalCreateQueryBuilder = instructionRepo.createQueryBuilder.bind(instructionRepo);
      vi.spyOn(instructionRepo, 'createQueryBuilder').mockImplementationOnce(() => {
        throw new Error('DB Error');
      });

      await service.reconcilePendingPayouts();
      // @ts-ignore
      expect(service.isReconciling).toBe(false);
      
      instructionRepo.createQueryBuilder = originalCreateQueryBuilder; // restore
    });
  });

  describe('State Transitions & Persistence', () => {
    it('should map COMPLETED to terminal state and update completedAt but NOT lastAttemptAt or retryCount', async () => {
      const inst = await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_1' });
      const lastAttempt = inst.lastAttemptAt;

      mockProvider.getPayoutStatus.mockResolvedValue({
        providerTransferId: 'tr_1',
        status: PayoutProviderStatus.COMPLETED,
        providerResponse: { id: 'ext_1' },
      });

      await service.reconcilePendingPayouts();

      const updated = await instructionRepo.findOneBy({ id: inst.id });
      expect(updated!.status).toBe(SettlementInstructionStatus.COMPLETED);
      expect(updated!.completedAt).toBeDefined();
      expect(updated!.failedAt).toBeNull();
      expect(updated!.lastAttemptAt?.getTime()).toBe(lastAttempt?.getTime());
      expect(updated!.retryCount).toBe(1);
      expect(updated!.providerResponse).toEqual({ id: 'ext_1' });
    });

    it('should map FAILED to terminal state and update failedAt', async () => {
      const inst = await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_1' });

      mockProvider.getPayoutStatus.mockResolvedValue({
        providerTransferId: 'tr_1',
        status: PayoutProviderStatus.FAILED,
        providerResponse: { reason: 'insufficient_funds' },
      });

      await service.reconcilePendingPayouts();

      const updated = await instructionRepo.findOneBy({ id: inst.id });
      expect(updated!.status).toBe(SettlementInstructionStatus.FAILED);
      expect(updated!.failedAt).toBeDefined();
      expect(updated!.completedAt).toBeNull();
      expect(updated!.providerResponse).toEqual({ reason: 'insufficient_funds' });
    });

    it('should keep UNKNOWN and NOT_FOUND as PROCESSING and persist providerResponse', async () => {
      const inst1 = await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_unknown' });
      const inst2 = await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_not_found' });

      mockProvider.getPayoutStatus.mockImplementation(async (id) => {
        if (id === 'tr_unknown') return { providerTransferId: id, status: PayoutProviderStatus.UNKNOWN, providerResponse: { a: 1 } };
        return { providerTransferId: id, status: PayoutProviderStatus.NOT_FOUND, providerResponse: { a: 2 } };
      });

      await service.reconcilePendingPayouts();

      const updated1 = await instructionRepo.findOneBy({ id: inst1.id });
      expect(updated1!.status).toBe(SettlementInstructionStatus.PROCESSING);
      expect(updated1!.providerResponse).toEqual({ a: 1 });

      const updated2 = await instructionRepo.findOneBy({ id: inst2.id });
      expect(updated2!.status).toBe(SettlementInstructionStatus.PROCESSING);
      expect(updated2!.providerResponse).toEqual({ a: 2 });
    });

    it('should handle provider timeout/5xx by keeping PROCESSING and NOT mutating DB fields', async () => {
      const inst = await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_1', providerResponse: { old: true } as any });

      mockProvider.getPayoutStatus.mockRejectedValue(new Error('Gateway Timeout'));

      await service.reconcilePendingPayouts();

      const updated = await instructionRepo.findOneBy({ id: inst.id });
      expect(updated!.status).toBe(SettlementInstructionStatus.PROCESSING);
      expect(updated!.providerResponse).toEqual({ old: true }); // untouched
    });
  });

  describe('Race Conditions & Persistence Safety', () => {
    it('should perform safe no-op if webhook completes before T2 acquires lock', async () => {
      const inst = await createInstruction(SettlementInstructionStatus.PROCESSING, true, { providerTransferId: 'tr_1' });

      mockProvider.getPayoutStatus.mockImplementation(async () => {
        // Here we simulate the race condition: 
        // The provider status is read as PROCESSING
        // But BEFORE the T2 lock is acquired, another process updates the DB
        await instructionRepo.update(inst.id, {
          status: SettlementInstructionStatus.COMPLETED,
          completedAt: new Date(),
          providerResponse: { byWebhook: true } as any,
        });

        return {
          providerTransferId: 'tr_1',
          status: PayoutProviderStatus.PROCESSING,
          providerResponse: { byCron: true },
        };
      });

      await service.reconcilePendingPayouts();

      // Ensure the cron did NOT downgrade it back to PROCESSING or overwrite providerResponse
      const updated = await instructionRepo.findOneBy({ id: inst.id });
      expect(updated!.status).toBe(SettlementInstructionStatus.COMPLETED);
      expect(updated!.providerResponse).toEqual({ byWebhook: true });
    });
  });
});
