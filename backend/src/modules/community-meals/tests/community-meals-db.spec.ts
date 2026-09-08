import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommunityMealCluster } from '../entities/community-meal-cluster.entity.js';
import { CommunityMealRequest } from '../entities/community-meal-request.entity.js';
import { CommunityMealOffer } from '../entities/community-meal-offer.entity.js';
import { MealAllocation } from '../entities/meal-allocation.entity.js';
import { KitchenCompliance } from '../entities/kitchen-compliance.entity.js';
import { SettlementInstruction } from '../../financials/entities/settlement-instruction.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { ALL_ENTITIES } from '../../../core/database/entities.js';
import { CommunityMealRequestStatus } from '../enums/community-meal-request-status.enum.js';
import { MealAllocationStatus } from '../enums/meal-allocation-status.enum.js';
import { FssaiStatus } from '../enums/fssai-status.enum.js';
import { KitchenOperationalStatus } from '../enums/kitchen-operational-status.enum.js';

describe('Community Meals Database Foundation (Integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let requestRepo: Repository<CommunityMealRequest>;
  let offerRepo: Repository<CommunityMealOffer>;
  let allocationRepo: Repository<MealAllocation>;
  let complianceRepo: Repository<KitchenCompliance>;
  let settlementRepo: Repository<SettlementInstruction>;
  let userRepo: Repository<User>;
  let shopRepo: Repository<Shop>;

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
          dropSchema: false, // Dont drop since we share the DB, but sync will add missing tables
          logging: false,
        }),
        TypeOrmModule.forFeature([
          CommunityMealCluster,
          CommunityMealRequest,
          CommunityMealOffer,
          MealAllocation,
          KitchenCompliance,
          SettlementInstruction,
          User,
          Shop,
        ]),
      ],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    requestRepo = moduleRef.get(getRepositoryToken(CommunityMealRequest));
    offerRepo = moduleRef.get(getRepositoryToken(CommunityMealOffer));
    allocationRepo = moduleRef.get(getRepositoryToken(MealAllocation));
    complianceRepo = moduleRef.get(getRepositoryToken(KitchenCompliance));
    settlementRepo = moduleRef.get(getRepositoryToken(SettlementInstruction));
    userRepo = moduleRef.get(getRepositoryToken(User));
    shopRepo = moduleRef.get(getRepositoryToken(Shop));
  }, 60000);

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('CommunityMealRequest: validates spatial location', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
    
    const request = requestRepo.create({
      userId: user.id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] }, // Bangalore
      mealType: 'Dinner',
      cuisine: 'Indian',
      servings: 2,
      budgetMin: 100,
      budgetMax: 500,
      timeWindowStart: new Date(),
      timeWindowEnd: new Date(Date.now() + 3600000),
      expiresAt: new Date(Date.now() + 1800000),
      status: CommunityMealRequestStatus.SEARCHING,
    });

    const saved = await requestRepo.save(request);
    expect(saved.id).toBeDefined();
    expect(saved.location.type).toEqual('Point');
  });

  it('MealAllocation: partial unique active-allocation constraint prevents duplicates', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
    const shop = await shopRepo.save(shopRepo.create({ ownerId: user.id, name: 'Test Shop', location: { type: 'Point', coordinates: [77, 12] } }));
    
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
    }));

    const clusterRepo = moduleRef.get(getRepositoryToken(CommunityMealCluster));
    const cluster = await clusterRepo.save(clusterRepo.create({
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

    // First allocation should succeed
    await allocationRepo.save(allocationRepo.create({
      requestId: request.id,
      offerId: offer.id,
      userId: user.id,
      status: MealAllocationStatus.RESERVED,
    }));

    // Second active allocation should fail
    let error;
    try {
      await allocationRepo.save(allocationRepo.create({
        requestId: request.id,
        offerId: offer.id,
        userId: user.id,
        status: MealAllocationStatus.CONFIRMED,
      }));
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();

    // But cancelled allocations are allowed
    await allocationRepo.save(allocationRepo.create({
      requestId: request.id,
      offerId: offer.id,
      userId: user.id,
      status: MealAllocationStatus.CANCELLED,
    }));
  });

  it('KitchenCompliance: ELIGIBLE logic check', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
    const shop = await shopRepo.save(shopRepo.create({ ownerId: user.id, name: 'Test Compliance Shop', location: { type: 'Point', coordinates: [77, 12] } }));

    const compliance = await complianceRepo.save(complianceRepo.create({
      shopId: shop.id,
      kycStatus: 'VERIFIED',
      fssaiLicense: '12345678901234',
      fssaiStatus: FssaiStatus.VALID,
      settlementAccountStatus: 'ACTIVE',
      operationalStatus: KitchenOperationalStatus.ELIGIBLE,
    }));

    expect(compliance.fssaiStatus).toBe(FssaiStatus.VALID);
  });
});
