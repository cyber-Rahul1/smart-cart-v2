import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FinancialsModule } from '../financials.module.js';
import { LogisticsModule } from '../../logistics/logistics.module.js';
import { OutboxModule } from '../../outbox/outbox.module.js';
import { CommunityMealsModule } from '../../community-meals/community-meals.module.js';
import { Order } from '../../orders/entities/order.entity.js';
import { OrderStatus } from '../../orders/enums/order-status.enum.js';
import { OutboxEvent } from '../../outbox/entities/outbox-event.entity.js';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { CustomerProfile } from '../../users/entities/customer-profile.entity.js';
import { MealAllocation } from '../../community-meals/entities/meal-allocation.entity.js';
import { MealAllocationStatus } from '../../community-meals/enums/meal-allocation-status.enum.js';
import { KitchenCompliance } from '../../community-meals/entities/kitchen-compliance.entity.js';
import { CommunityMealRequest } from '../../community-meals/entities/community-meal-request.entity.js';
import { CommunityMealOffer } from '../../community-meals/entities/community-meal-offer.entity.js';
import { CommunityMealCluster } from '../../community-meals/entities/community-meal-cluster.entity.js';
import { OutboxProcessor } from '../../outbox/outbox.processor.js';
import { MealMenuLedger } from '../../community-meals/entities/meal-menu-ledger.entity.js';
import { MealMenuLedgerStatus } from '../../community-meals/enums/meal-menu-ledger-status.enum.js';
import { SettlementEligibilityProcessor } from '../jobs/settlement-eligibility.processor.js';
import { FINANCIAL_SETTLEMENTS_QUEUE } from '../constants/financials.constants.js';
import { JOB_PROCESS_OUTBOX_EVENT } from '../../logistics/constants/logistics.constants.js';
import { User } from '../../users/entities/user.entity.js';

import { TrackingService } from '../../tracking/tracking.service.js';

import { NotificationService } from '../../audit/services/notification.service.js';
import { PushDispatchService } from '../../notifications/services/push-dispatch.service.js';
import { Module, Global } from '@nestjs/common';

@Global()
@Module({
  providers: [{ provide: 'REDIS_CLIENT', useValue: {} }],
  exports: ['REDIS_CLIENT'],
})
class RedisMockModule {}

import { ALL_ENTITIES } from '../../../core/database/entities.js';

describe('Settlement Eligibility & Outbox Integration (DB)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let orderRepo: Repository<Order>;
  let outboxRepo: Repository<OutboxEvent>;
  let instructionRepo: Repository<SettlementInstruction>;
  let auditRepo: Repository<AuditLog>;
  let shopRepo: Repository<Shop>;
  let customerRepo: Repository<CustomerProfile>;
  let userRepo: Repository<User>;
  let mealAllocationRepo: Repository<MealAllocation>;
  let outboxProcessor: OutboxProcessor;
  let eligibilityProcessor: SettlementEligibilityProcessor;
  
  beforeAll(async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC12345678901234567890123456789012';
    process.env.TWILIO_AUTH_TOKEN = 'test_token';
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VA12345678901234567890123456789012';

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
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
        BullModule.forRoot({
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
          },
        }),
        FinancialsModule,
        OutboxModule,
        CommunityMealsModule,
        RedisMockModule,
        import('@nestjs/throttler').then(m => m.ThrottlerModule.forRoot([{ ttl: 60, limit: 10 }])),
      ],
      providers: [
        {
          provide: TrackingService,
          useValue: {
            updateLocation: vi.fn(),
            getLocation: vi.fn(),
            clearLocation: vi.fn(),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            sendInAppPush: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: PushDispatchService,
          useValue: {
            dispatchToUser: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    })
    .overrideProvider(`BullQueue_${FINANCIAL_SETTLEMENTS_QUEUE}`)
    .useValue({ add: vi.fn().mockResolvedValue({ id: 'job-id' }) })
    .compile();

    dataSource = module.get<DataSource>(DataSource);
    orderRepo = dataSource.getRepository(Order);
    outboxRepo = dataSource.getRepository(OutboxEvent);
    instructionRepo = dataSource.getRepository(SettlementInstruction);
    auditRepo = dataSource.getRepository(AuditLog);
    shopRepo = dataSource.getRepository(Shop);
    customerRepo = dataSource.getRepository(CustomerProfile);
    userRepo = dataSource.getRepository(User);
    mealAllocationRepo = dataSource.getRepository(MealAllocation);

    outboxProcessor = module.get<OutboxProcessor>(OutboxProcessor);
    eligibilityProcessor = module.get<SettlementEligibilityProcessor>(SettlementEligibilityProcessor);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await module.close();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  let shop: Shop;
  let customer: CustomerProfile;
  let user: User;

  beforeEach(async () => {
    // Scaffold base data
    user = (await userRepo.save(userRepo.create({
      phoneNumber: '+1555' + Math.floor(Math.random() * 100000000),
      firstName: 'Test',
      lastName: 'User',
      passwordHashed: 'dummy',
    } as any))) as any as User;

    customer = await customerRepo.save(customerRepo.create({
      userId: user.id,
    }));

    shop = await shopRepo.save(shopRepo.create({
      name: 'Integration Test Shop ' + Math.random(),
      ownerId: user.id,
      location: { type: 'Point', coordinates: [77, 12] },
      commissionRate: 5.00,
    }));

    // Add Kitchen Compliance
    await dataSource.getRepository(KitchenCompliance).save({
      shopId: shop.id,
      foodSafetyCertificateNumber: 'CERT' + Math.floor(Math.random() * 100000),
      isVerified: true,
      validUntil: new Date(Date.now() + 100000000),
      inspectionScore: 100,
    });
  });

  it('End-to-End: Community Meal Delivery triggers Outbox -> BullMQ -> SettlementInstruction', async () => {
    const order = await orderRepo.save(orderRepo.create({
      customerId: user.id,
      shopId: shop.id,
      status: OrderStatus.DELIVERED,
      subtotal: 1000,
      totalAmount: 1100,
      deliveryFee: 100,
      items: [],
      deliveryAddressLabel: 'Home',
      deliveryAddressLine: '123 Main St',
      deliveryLocation: { type: 'Point', coordinates: [77, 12] },
    }));

    // Dummy Request/Offer/Cluster
    const cluster = (await dataSource.getRepository(CommunityMealCluster).save({
      cuisine: 'Mexican',
      mealType: 'Dinner',
      centroid: { type: 'Point', coordinates: [77, 12] },
      status: 'OFFERING',
      timeWindowStart: new Date(),
      timeWindowEnd: new Date(Date.now() + 3600000),
    } as any)) as CommunityMealCluster;

    const request = (await dataSource.getRepository(CommunityMealRequest).save({
      userId: user.id,
      cuisine: 'Mexican',
      mealType: 'Dinner',
      location: { type: 'Point', coordinates: [77, 12] },
      status: 'CONFIRMED' as any,
      clusterId: cluster.id,
      budgetMin: 100,
      budgetMax: 500,
      servings: 1,
      timeWindowStart: new Date(),
      timeWindowEnd: new Date(Date.now() + 3600000),
      expiresAt: new Date(Date.now() + 1800000),
    } as any)) as CommunityMealRequest;

    const offer = (await dataSource.getRepository(CommunityMealOffer).save({
      shopId: shop.id,
      clusterId: cluster.id,
      pricePerServing: 1000,
      minQuantity: 1,
      maxQuantity: 10,
      availableQty: 9,
      reservedQty: 0,
      committedQty: 1,
      menuDescription: 'Yummy',
      expiresAt: new Date(Date.now() + 1800000),
      menuLockAt: new Date(Date.now() + 1800000),
    } as any)) as CommunityMealOffer;

    const allocation = await mealAllocationRepo.save({
      userId: user.id,
      requestId: request.id,
      offerId: offer.id,
      orderId: order.id,
      status: MealAllocationStatus.CONFIRMED,
    });

    // Create a LOCKED MealMenuLedger for the allocation (required by SettlementInstructionService)
    await dataSource.getRepository(MealMenuLedger).save({
      allocationId: allocation.id,
      basePrice: 1000,
      status: MealMenuLedgerStatus.LOCKED,
    });

    // 1. Create OutboxEvent simulating delivery transaction completion
    const event = await outboxRepo.save(outboxRepo.create({
      type: 'order.status.changed',
      payload: { orderId: order.id, status: OrderStatus.DELIVERED },
      idempotencyKey: `order-status-${order.id}-1`,
    }));

    // Spy on Queue
    const settlementQueue = module.get<Queue>(`BullQueue_${FINANCIAL_SETTLEMENTS_QUEUE}`);
    const queueAddSpy = vi.spyOn(settlementQueue, 'add');

    // 2. OutboxProcessor processes event
    const outboxJob = { name: JOB_PROCESS_OUTBOX_EVENT, data: { outboxEventId: event.id } } as any;
    await outboxProcessor.process(outboxJob);

    // Verify it was enqueued
    expect(queueAddSpy).toHaveBeenCalledWith(
      'evaluate_settlement',
      { orderId: order.id },
      expect.objectContaining({ jobId: `settle-${order.id}` })
    );

    // 3. SettlementEligibilityProcessor picks it up
    const evalJob = { name: 'evaluate_settlement', data: { orderId: order.id } } as any;
    await eligibilityProcessor.process(evalJob);

    // 4. Verify exactly one SettlementInstruction PENDING and one AuditLog
    const instructions = await instructionRepo.find({ where: { orderId: order.id } });
    expect(instructions).toHaveLength(1);
    expect(instructions[0].status).toBe(SettlementInstructionStatus.PENDING);
    expect(instructions[0].idempotencyKey).toBe(`settlement-order-${order.id}`);
    expect(Number(instructions[0].platformCommission)).toBe(50); // 5% of 1000

    const audits = await auditRepo.find({ where: { entityId: instructions[0].id, action: 'CREATED' } });
    expect(audits).toHaveLength(1);

    // 5. Duplicate processing Test (BullMQ processes twice)
    await eligibilityProcessor.process(evalJob);
    const instructionsAfter = await instructionRepo.find({ where: { orderId: order.id } });
    expect(instructionsAfter).toHaveLength(1); // Idempotent!
  });

  it('Retail Delivery: Outbox event triggers Safe No-Op without creating SettlementInstruction', async () => {
    // Normal retail order (No meal allocation)
    const order = await orderRepo.save(orderRepo.create({
      customerId: user.id,
      shopId: shop.id,
      status: OrderStatus.DELIVERED,
      subtotal: 500,
      totalAmount: 500,
      deliveryFee: 0,
      items: [],
      deliveryAddressLabel: 'Home',
      deliveryAddressLine: '123 Main St',
      deliveryLocation: { type: 'Point', coordinates: [77, 12] },
    }));

    const event = await outboxRepo.save(outboxRepo.create({
      type: 'order.status.changed',
      payload: { orderId: order.id, status: OrderStatus.DELIVERED },
      idempotencyKey: `order-status-${order.id}-1`,
    }));

    const settlementQueue = module.get<Queue>(`BullQueue_${FINANCIAL_SETTLEMENTS_QUEUE}`);
    const queueAddSpy = vi.spyOn(settlementQueue, 'add');

    const outboxJob = { name: JOB_PROCESS_OUTBOX_EVENT, data: { outboxEventId: event.id } } as any;
    await outboxProcessor.process(outboxJob);

    expect(queueAddSpy).toHaveBeenCalledWith(
      'evaluate_settlement',
      { orderId: order.id },
      expect.any(Object)
    );

    const evalJob = { name: 'evaluate_settlement', data: { orderId: order.id } } as any;
    await eligibilityProcessor.process(evalJob);

    const instructions = await instructionRepo.find({ where: { orderId: order.id } });
    expect(instructions).toHaveLength(0); // Safe no-op!
  });
});
