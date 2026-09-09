import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SettlementInstructionService } from '../services/settlement-instruction.service.js';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { Order } from '../../orders/entities/order.entity.js';
import { OrderStatus } from '../../orders/enums/order-status.enum.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { KitchenCompliance } from '../../community-meals/entities/kitchen-compliance.entity.js';
import { MealAllocation } from '../../community-meals/entities/meal-allocation.entity.js';
import { MealAllocationStatus } from '../../community-meals/enums/meal-allocation-status.enum.js';
import { MealMenuLedger } from '../../community-meals/entities/meal-menu-ledger.entity.js';
import { MealMenuLedgerStatus } from '../../community-meals/enums/meal-menu-ledger-status.enum.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';

describe('SettlementInstructionService', () => {
  let service: SettlementInstructionService;
  let dataSource: any;
  let manager: any;

  beforeEach(async () => {
    manager = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
    };

    dataSource = {
      transaction: vi.fn().mockImplementation((cb: any) => cb(manager)),
      getRepository: vi.fn().mockReturnValue({
         findOne: vi.fn().mockResolvedValue({ id: 'existing-id', idempotencyKey: 'settlement-order-order-1' }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementInstructionService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<SettlementInstructionService>(SettlementInstructionService);
  });

  function setupMocks({
    orderStatus = OrderStatus.DELIVERED,
    allocationStatus = MealAllocationStatus.CONFIRMED,
    ledgerStatus = MealMenuLedgerStatus.LOCKED,
    settlementAccountStatus = 'ACTIVE',
    commissionRate = 5.00,
    subtotal = '100.00',
    totalAmount = '100.00',
    hasAllocation = true,
  } = {}) {
    manager.findOne.mockImplementation(async (entity: any, options: any) => {
      if (entity === Order) {
        return { id: 'order-1', shopId: 'shop-1', status: orderStatus, subtotal, totalAmount };
      }
      if (entity === MealAllocation) {
        if (!hasAllocation) return null;
        return { id: 'alloc-1', offerId: 'offer-1', status: allocationStatus };
      }
      if (entity === MealMenuLedger) {
        return { id: 'ledger-1', status: ledgerStatus };
      }
      if (entity === KitchenCompliance) {
        return { shopId: 'shop-1', settlementAccountStatus };
      }
      if (entity === Shop) {
        return { id: 'shop-1', commissionRate };
      }
      return null;
    });

    manager.create.mockImplementation((entity: any, obj: any) => ({ ...obj, id: 'new-id' }));
    manager.save.mockImplementation(async (entity: any, obj: any) => obj);
  }

  describe('Money & Commission', () => {
    it('calculates 5% commission exactly without double counting', async () => {
      setupMocks({ commissionRate: 5.00, subtotal: '100.00', totalAmount: '100.00' });
      const instruction = await service.createInstruction('order-1');
      expect(instruction.providerGrossAmount).toBe(100.00);
      expect(instruction.customerGrossAmount).toBe(100.00);
      expect(instruction.platformCommission).toBe(5.00);
      expect(instruction.providerNetSettlement).toBe(95.00);
      expect(instruction.discounts).toBe(0);
      expect(instruction.refunds).toBe(0);
    });

    it('calculates 15% commission correctly with decimal math precision', async () => {
      setupMocks({ commissionRate: 15.00, subtotal: '10.50', totalAmount: '10.50' });
      // Minor units: 1050 cents. 1050 * 15 / 100 = 157.5 cents. Math.round(157.5) = 158 cents = 1.58. Net = 1050 - 158 = 892 = 8.92
      const instruction = await service.createInstruction('order-1');
      expect(instruction.platformCommission).toBe(1.58);
      expect(instruction.providerNetSettlement).toBe(8.92);
    });

    it('calculates 0% commission', async () => {
      setupMocks({ commissionRate: 0.00, subtotal: '50.00', totalAmount: '50.00' });
      const instruction = await service.createInstruction('order-1');
      expect(instruction.platformCommission).toBe(0.00);
      expect(instruction.providerNetSettlement).toBe(50.00);
    });
  });

  describe('Eligibility', () => {
    it('rejects non-delivered order', async () => {
      setupMocks({ orderStatus: OrderStatus.PLACED });
      await expect(service.createInstruction('order-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects normal retail order without MealAllocation', async () => {
      setupMocks({ hasAllocation: false });
      await expect(service.createInstruction('order-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid allocation state', async () => {
      setupMocks({ allocationStatus: MealAllocationStatus.PENDING });
      await expect(service.createInstruction('order-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Compliance', () => {
    it('creates PENDING instruction for ACTIVE account', async () => {
      setupMocks({ settlementAccountStatus: 'ACTIVE' });
      const instruction = await service.createInstruction('order-1');
      expect(instruction.status).toBe(SettlementInstructionStatus.PENDING);
    });

    it('creates PENDING instruction for non-ACTIVE account', async () => {
      setupMocks({ settlementAccountStatus: 'PENDING' });
      const instruction = await service.createInstruction('order-1');
      expect(instruction.status).toBe(SettlementInstructionStatus.PENDING);
    });
  });

  describe('Idempotency & Immutability', () => {
    it('returns existing instruction on unique constraint violation without duplicate audit', async () => {
      setupMocks();
      manager.save.mockRejectedValueOnce({ code: '23505', constraint: 'idempotencyKey' });
      manager.findOne.mockImplementation(async (entity: any, options: any) => {
        if (entity === SettlementInstruction && options?.where?.idempotencyKey) {
          return { id: 'existing-id', status: SettlementInstructionStatus.PENDING };
        }
        if (entity === Order) return { id: 'order-1', shopId: 'shop-1', status: OrderStatus.DELIVERED, subtotal: 100, totalAmount: 100 };
        if (entity === MealAllocation) return { id: 'alloc-1', offerId: 'offer-1', status: MealAllocationStatus.CONFIRMED };
        if (entity === MealMenuLedger) return { id: 'ledger-1', status: MealMenuLedgerStatus.LOCKED };
        if (entity === KitchenCompliance) return { shopId: 'shop-1', settlementAccountStatus: 'ACTIVE' };
        if (entity === Shop) return { id: 'shop-1', commissionRate: 5 };
        return null;
      });

      const instruction = await service.createInstruction('order-1');
      expect(instruction.id).toBe('existing-id');
      // Verify audit creation was not called for the existing duplicate
      expect(manager.create).toHaveBeenCalledWith(SettlementInstruction, expect.anything());
      // Audit creation should only be called if save succeeds
      expect(manager.create).not.toHaveBeenCalledWith(AuditLog, expect.anything());
    });
  });
});
