import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SettlementInstructionService } from '../services/settlement-instruction.service.js';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { Commission } from '../entities/commission.entity.js';
import { Order } from '../../orders/entities/order.entity.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { KitchenCompliance } from '../../community-meals/entities/kitchen-compliance.entity.js';
import { MealAllocation } from '../../community-meals/entities/meal-allocation.entity.js';
import { MealMenuLedger } from '../../community-meals/entities/meal-menu-ledger.entity.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { ALL_ENTITIES } from '../../../core/database/entities.js';
import { OrderStatus } from '../../orders/enums/order-status.enum.js';
import { MealAllocationStatus } from '../../community-meals/enums/meal-allocation-status.enum.js';
import { MealMenuLedgerStatus } from '../../community-meals/enums/meal-menu-ledger-status.enum.js';
import { CommunityMealRequest } from '../../community-meals/entities/community-meal-request.entity.js';
import { CommunityMealOffer } from '../../community-meals/entities/community-meal-offer.entity.js';
import { CommunityMealCluster } from '../../community-meals/entities/community-meal-cluster.entity.js';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

describe('SettlementInstructionService (DB Integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: SettlementInstructionService;

  beforeAll(async () => {
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
        TypeOrmModule.forFeature([
          SettlementInstruction,
          Commission,
          Order,
          Shop,
          KitchenCompliance,
          MealAllocation,
          MealMenuLedger,
          AuditLog,
        ]),
      ],
      providers: [SettlementInstructionService],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(SettlementInstructionService);
  }, 60000);

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('handles idempotency and exact Postgres transaction rollback correctly', async () => {
    const userRepo = dataSource.getRepository(User);
    const shopRepo = dataSource.getRepository(Shop);
    const orderRepo = dataSource.getRepository(Order);
    const allocRepo = dataSource.getRepository(MealAllocation);
    const ledgerRepo = dataSource.getRepository(MealMenuLedger);
    const complianceRepo = dataSource.getRepository(KitchenCompliance);
    const auditRepo = dataSource.getRepository(AuditLog);

    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
    const shop = await shopRepo.save(shopRepo.create({ ownerId: user.id, name: 'Test Shop', commissionRate: 5.00, location: { type: 'Point', coordinates: [77, 12] } }));
    
    await complianceRepo.save(complianceRepo.create({ shopId: shop.id, settlementAccountStatus: 'ACTIVE', kycStatus: 'VERIFIED', fssaiLicense: '123', operationalStatus: 'ELIGIBLE' as any }));

    const order = await orderRepo.save(orderRepo.create({
      customerId: user.id,
      shopId: shop.id,
      status: OrderStatus.DELIVERED,
      subtotal: 100.00,
      totalAmount: 100.00,
      deliveryFee: 0,
      deliveryAddressLabel: 'Home',
      deliveryAddressLine: '123 Main St',
      deliveryLocation: { type: 'Point', coordinates: [77, 12] },
    }));

    const requestRepo = dataSource.getRepository(CommunityMealRequest);
    const offerRepo = dataSource.getRepository(CommunityMealOffer);
    const clusterRepo = dataSource.getRepository(import('../../community-meals/entities/community-meal-cluster.entity.js').then(m => m.CommunityMealCluster));
    
    // Note: To avoid dynamic import issues in sync code, we import CommunityMealCluster at top or just use its name
    const request = await requestRepo.save(requestRepo.create({
      userId: user.id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      mealType: 'Dinner',
      cuisine: 'Indian',
      servings: 2,
      budgetMin: 100,
      budgetMax: 500,
      timeWindowStart: new Date(),
      timeWindowEnd: new Date(Date.now() + 3600000),
      expiresAt: new Date(Date.now() + 1800000),
      status: 'SEARCHING' as any,
    }));

    // The offer might require a cluster, but let's see if we can save without it if nullable, or just create one.
    // Actually, we can use the repository by string name 'CommunityMealCluster'
    const clusterRepository = dataSource.getRepository(CommunityMealCluster);
    const cluster = await clusterRepository.save(clusterRepository.create({
      centroid: { type: 'Point', coordinates: [77.5946, 12.9716] },
      cuisine: 'Indian',
      mealType: 'Dinner',
      timeWindowStart: new Date(),
      timeWindowEnd: new Date(Date.now() + 3600000),
    }));

    const offer = await offerRepo.save(offerRepo.create({
      clusterId: cluster.id,
      shopId: shop.id,
      pricePerServing: 200,
      minQuantity: 1,
      maxQuantity: 10,
      availableQty: 10,
      menuDescription: 'Test Menu',
      expiresAt: new Date(Date.now() + 1800000),
      menuLockAt: new Date(Date.now() + 1800000),
    }));

    const alloc = await allocRepo.save(allocRepo.create({
      requestId: request.id,
      offerId: offer.id,
      userId: user.id,
      orderId: order.id,
      status: MealAllocationStatus.DELIVERED,
    }));

    await ledgerRepo.save(ledgerRepo.create({
      allocationId: alloc.id,
      basePrice: 100,
      status: MealMenuLedgerStatus.LOCKED,
    }));

    // First trigger
    const instruction1 = await service.createInstruction(order.id);
    expect(instruction1).toBeDefined();
    expect(Number(instruction1.platformCommission)).toBe(5.00);

    // Verify AuditLog was created
    const audits1 = await auditRepo.find({ where: { entityId: instruction1.id, entityType: 'SettlementInstruction' } });
    expect(audits1.length).toBe(1);

    // Duplicate trigger
    const instruction2 = await service.createInstruction(order.id);
    expect(instruction2).toBeDefined();
    expect(instruction2.id).toBe(instruction1.id);

    // Verify no second AuditLog was created
    const audits2 = await auditRepo.find({ where: { entityId: instruction1.id, entityType: 'SettlementInstruction' } });
    expect(audits2.length).toBe(1);
  });
});
