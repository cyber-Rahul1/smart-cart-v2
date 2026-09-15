import { Test, TestingModule } from '@nestjs/testing';
import { AdminSettlementsController } from '../controllers/admin-settlements.controller.js';
import { PayoutDispatchService } from '../services/payout-dispatch.service.js';
import { PayoutReconciliationService } from '../services/payout-reconciliation.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../users/enums/user-role.enum.js';

describe('AdminSettlementsController', () => {
  let controller: AdminSettlementsController;
  let instructionRepo: any;
  let auditRepo: any;
  let dispatchService: any;
  let reconciliationService: any;

  beforeEach(async () => {
    instructionRepo = {
      findOneBy: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    auditRepo = {
      create: vi.fn((data) => data),
      save: vi.fn(),
    };
    dispatchService = {
      dispatch: vi.fn(),
    };
    reconciliationService = {
      reconcileSingleInstruction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSettlementsController],
      providers: [
        { provide: getRepositoryToken(SettlementInstruction), useValue: instructionRepo },
        { provide: getRepositoryToken(AuditLog), useValue: auditRepo },
        { provide: PayoutDispatchService, useValue: dispatchService },
        { provide: PayoutReconciliationService, useValue: reconciliationService },
      ],
    }).compile();

    controller = module.get<AdminSettlementsController>(AdminSettlementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listSettlements', () => {
    it('should return paginated and projected settlements', async () => {
      const qb = {
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([
          [{ id: '1', status: SettlementInstructionStatus.COMPLETED, customerGrossAmount: '100' }],
          1
        ]),
      };
      instructionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await controller.listSettlements({ limit: 10, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.items[0]).not.toHaveProperty('providerResponse');
    });
  });

  describe('getSettlement', () => {
    it('should return a projected settlement by id', async () => {
      instructionRepo.findOneBy.mockResolvedValue({ id: '1', status: SettlementInstructionStatus.COMPLETED });
      const result = await controller.getSettlement('1');
      expect(result.id).toBe('1');
      expect(result).not.toHaveProperty('providerResponse');
    });

    it('should throw NotFoundException if not found', async () => {
      instructionRepo.findOneBy.mockResolvedValue(null);
      await expect(controller.getSettlement('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('retrySettlement', () => {
    const user = { sub: 'user-1', roles: [UserRole.ADMIN] } as any;

    it('should retry a FAILED_RETRY settlement', async () => {
      instructionRepo.findOneBy.mockResolvedValue({ id: '1', status: SettlementInstructionStatus.FAILED_RETRY });
      
      const result = await controller.retrySettlement('1', user);
      
      expect(dispatchService.dispatch).toHaveBeenCalledWith('1');
      expect(auditRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'SettlementInstruction',
        entityId: '1',
        action: 'MANUAL_RETRY_REQUESTED',
        performedBy: 'user-1',
      }));
      expect(result).toEqual({ success: true });
    });

    it('should reject a PENDING settlement', async () => {
      instructionRepo.findOneBy.mockResolvedValue({ id: '1', status: SettlementInstructionStatus.PENDING });
      await expect(controller.retrySettlement('1', user)).rejects.toThrow(ConflictException);
      expect(dispatchService.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('reconcileSettlement', () => {
    const user = { sub: 'user-1', roles: [UserRole.ADMIN] } as any;

    it('should reconcile a PROCESSING settlement', async () => {
      instructionRepo.findOneBy.mockResolvedValue({ id: '1', status: SettlementInstructionStatus.PROCESSING });
      
      const result = await controller.reconcileSettlement('1', user);
      
      expect(reconciliationService.reconcileSingleInstruction).toHaveBeenCalledWith('1');
      expect(auditRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'SettlementInstruction',
        entityId: '1',
        action: 'MANUAL_RECONCILIATION_REQUESTED',
        performedBy: 'user-1',
      }));
      expect(result).toEqual({ success: true });
    });

    it('should reject non-PROCESSING terminal states', async () => {
      instructionRepo.findOneBy.mockResolvedValue({ id: '1', status: SettlementInstructionStatus.COMPLETED });
      await expect(controller.reconcileSettlement('1', user)).rejects.toThrow(ConflictException);
      expect(reconciliationService.reconcileSingleInstruction).not.toHaveBeenCalled();
    });
  });
});
