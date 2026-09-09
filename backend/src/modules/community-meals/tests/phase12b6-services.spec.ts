import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { CommunityMealConversationService } from '../services/community-meal-conversation.service.js';
import { CommunityMealMessagesService } from '../services/community-meal-messages.service.js';
import { CommunityMealMenuLedgerService } from '../services/community-meal-menu-ledger.service.js';
import { LedgerEventPublisher } from '../events/ledger-event.publisher.js';
import { LedgerLockSchedulerService } from '../services/ledger-lock-scheduler.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MealConversation } from '../entities/meal-conversation.entity.js';
import { MealMessage } from '../entities/meal-message.entity.js';
import { MealMenuLedger } from '../entities/meal-menu-ledger.entity.js';
import { MealAllocation } from '../entities/meal-allocation.entity.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { DataSource, QueryFailedError } from 'typeorm';

describe('Phase 12B-6 Services Tests', () => {
  let conversationService: CommunityMealConversationService;
  let messagesService: CommunityMealMessagesService;
  let ledgerService: CommunityMealMenuLedgerService;
  let eventPublisher: any;

  let mockConversationRepo: any;
  let mockMessageRepo: any;
  let mockLedgerRepo: any;
  let mockAllocationRepo: any;
  let mockAuditLogRepo: any;
  let mockDataSource: any;

  beforeEach(async () => {
    mockConversationRepo = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    mockMessageRepo = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    mockLedgerRepo = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    mockAllocationRepo = {
      findOne: vi.fn(),
    };
    mockAuditLogRepo = {
      create: vi.fn(),
      save: vi.fn(),
    };

    mockDataSource = {
      transaction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityMealConversationService,
        CommunityMealMessagesService,
        CommunityMealMenuLedgerService,
        { provide: LedgerEventPublisher, useValue: { publishEvent: vi.fn() } },
        { provide: LedgerLockSchedulerService, useValue: { scheduleLock: vi.fn() } },
        CommunityMealMenuLedgerService,
        { provide: getRepositoryToken(MealConversation), useValue: mockConversationRepo },
        { provide: getRepositoryToken(MealMessage), useValue: mockMessageRepo },
        { provide: getRepositoryToken(MealMenuLedger), useValue: mockLedgerRepo },
        { provide: getRepositoryToken(MealAllocation), useValue: mockAllocationRepo },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditLogRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    conversationService = module.get<CommunityMealConversationService>(CommunityMealConversationService);
    messagesService = module.get<CommunityMealMessagesService>(CommunityMealMessagesService);
    ledgerService = module.get<CommunityMealMenuLedgerService>(CommunityMealMenuLedgerService);
    eventPublisher = module.get<LedgerEventPublisher>(LedgerEventPublisher);
  });

  const mockAllocation = { id: 'alloc-1', userId: 'user-1', offer: { shop: { ownerId: 'shop-1' } } };

  describe('CommunityMealConversationService', () => {
    it('should throw ForbiddenException if unrelated user accesses conversation', async () => {
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      await expect(conversationService.getOrCreateConversation('alloc-1', 'other-user')).rejects.toThrow('Unauthorized to access this conversation');
    });

    it('should allow customer access', async () => {
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      mockConversationRepo.findOne.mockResolvedValue({ id: 'conv-1', allocationId: 'alloc-1' });
      const conv = await conversationService.getOrCreateConversation('alloc-1', 'user-1');
      expect(conv.id).toBe('conv-1');
    });

    it('should allow shopkeeper access', async () => {
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      mockConversationRepo.findOne.mockResolvedValue({ id: 'conv-1', allocationId: 'alloc-1' });
      const conv = await conversationService.getOrCreateConversation('alloc-1', 'shop-1');
      expect(conv.id).toBe('conv-1');
    });

    it('should recover from concurrent creation unique constraint violation', async () => {
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      mockConversationRepo.findOne
        .mockResolvedValueOnce(null) // first check
        .mockResolvedValueOnce({ id: 'conv-new' }); // recovery check
      
      const error = new QueryFailedError('query', [], new Error('unique constraint'));
      (error as any).code = '23505'; // mock postgres unique constraint violation
      mockConversationRepo.save.mockRejectedValue(error);

      const conv = await conversationService.getOrCreateConversation('alloc-1', 'user-1');
      expect(conv.id).toBe('conv-new');
    });
  });

  describe('CommunityMealMessagesService', () => {
    it('should reject message over 2000 characters', async () => {
      await expect(messagesService.sendMessage('user-1', 'conv-1', 'a'.repeat(2001))).rejects.toThrow('Message content cannot exceed 2000 characters');
    });

    it('should reject empty message', async () => {
      await expect(messagesService.sendMessage('user-1', 'conv-1', '   ')).rejects.toThrow('Message content cannot be empty');
    });

    it('should reject if conversation is READ_ONLY', async () => {
      mockConversationRepo.findOne.mockResolvedValue({ id: 'conv-1', allocationId: 'alloc-1', status: 'READ_ONLY' });
      await expect(messagesService.sendMessage('user-1', 'conv-1', 'hello')).rejects.toThrow('Conversation is READ_ONLY');
    });

    it('should handle idempotency correctly by returning existing message', async () => {
      mockConversationRepo.findOne.mockResolvedValue({ id: 'conv-1', allocationId: 'alloc-1', status: 'ACTIVE' });
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      const error = new QueryFailedError('query', [], new Error('unique constraint'));
      (error as any).code = '23505';
      mockMessageRepo.save.mockRejectedValue(error);
      mockMessageRepo.findOne.mockResolvedValue({ id: 'msg-exist' });

      const msg = await messagesService.sendMessage('user-1', 'conv-1', 'hello', 'idem-1');
      expect(msg.id).toBe('msg-exist');
    });

    it('should complete DB transaction successfully even if Redis publish fails', async () => {
      mockConversationRepo.findOne.mockResolvedValue({ id: 'conv-1', allocationId: 'alloc-1', status: 'ACTIVE' });
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      mockMessageRepo.save.mockResolvedValue({ id: 'msg-1', content: 'hello' });
      
      const mockRedis = {
        publish: vi.fn().mockRejectedValueOnce(new Error('Redis connection lost'))
      };
      const realPublisher = new LedgerEventPublisher(mockRedis as any);
      (messagesService as any).eventPublisher = realPublisher;

      const msg = await messagesService.sendMessage('user-1', 'conv-1', 'hello');
      expect(msg.id).toBe('msg-1');
      expect(mockMessageRepo.save).toHaveBeenCalled();
      expect(mockRedis.publish).toHaveBeenCalled();
    });
  });

  describe('CommunityMealMenuLedgerService', () => {
    it('should reject kitchen update from non-owner', async () => {
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      await expect(ledgerService.kitchenUpdate('alloc-1', 'user-1', {}, 1)).rejects.toThrow('Only the shopkeeper can update the ledger');
    });

    it('should reject if ledger is already locked', async () => {
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      mockLedgerRepo.findOne.mockResolvedValue({ id: 'led-1', status: 'LOCKED' });
      await expect(ledgerService.kitchenUpdate('alloc-1', 'shop-1', {}, 1)).rejects.toThrow('Ledger is already locked');
    });

    it('should allow customer early confirmation', async () => {
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      mockLedgerRepo.findOne.mockResolvedValue({ id: 'led-1', status: 'DRAFT', version: 1 });
      const mockManager = {
        createQueryBuilder: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValue({ affected: 1 }),
        }),
        findOne: vi.fn().mockResolvedValue({ id: 'led-1', status: 'LOCKED' }),
        create: vi.fn().mockReturnValue({}),
        save: vi.fn().mockResolvedValue({}),
      };
      mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
      
      await expect(ledgerService.confirmLedger('alloc-1', 'user-1', 1)).resolves.not.toThrow();
    });

    it('should fail customer confirmation if version mismatch', async () => {
      mockAllocationRepo.findOne.mockResolvedValue(mockAllocation);
      mockLedgerRepo.findOne.mockResolvedValue({ id: 'led-1', status: 'DRAFT', version: 1 });
      const mockManager = {
        createQueryBuilder: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValue({ affected: 0 }),
        }),
      };
      mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
      
      await expect(ledgerService.confirmLedger('alloc-1', 'user-1', 1)).rejects.toThrow('Confirmation failed');
    });

    it('should time lock expired ledger safely', async () => {
      const mockManager = {
        findOne: vi.fn().mockResolvedValue({ id: 'led-1', status: 'DRAFT', allocationId: 'alloc-1' }),
        createQueryBuilder: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValue({ affected: 1 }),
        }),
        create: vi.fn().mockReturnValue({}),
        save: vi.fn().mockResolvedValue({}),
      };
      mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
      
      await expect(ledgerService.autoLock('led-1', 1)).resolves.not.toThrow();
    });
  });
});
