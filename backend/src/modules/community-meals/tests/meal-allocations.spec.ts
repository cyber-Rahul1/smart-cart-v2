import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MealAllocationsService } from '../services/meal-allocations.service.js';
import { ReservationExpiryProcessor } from '../processors/reservation-expiry.processor.js';
import { CommunityMealRequest } from '../entities/community-meal-request.entity.js';
import { CommunityMealOffer } from '../entities/community-meal-offer.entity.js';
import { MealAllocation } from '../entities/meal-allocation.entity.js';
import { CommunityMealCluster } from '../entities/community-meal-cluster.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { ALL_ENTITIES } from '../../../core/database/entities.js';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { PaymentsService } from '../../payments/payments.service.js';
import { CommunityMealRequestStatus } from '../enums/community-meal-request-status.enum.js';
import { CommunityMealClusterStatus } from '../enums/community-meal-cluster-status.enum.js';
import { CommunityMealOfferStatus } from '../enums/community-meal-offer-status.enum.js';
import { MealAllocationStatus } from '../enums/meal-allocation-status.enum.js';
import { ShopStatus } from '../../shops/enums/shop-status.enum.js';
import { ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { vi } from 'vitest';
import { Job } from 'bullmq';

describe('Meal Allocations (Integration)', () => {
  let moduleRef: TestingModule;
  let allocationsService: MealAllocationsService;
  let expiryProcessor: ReservationExpiryProcessor;
  let requestRepo: Repository<CommunityMealRequest>;
  let offerRepo: Repository<CommunityMealOffer>;
  let allocationRepo: Repository<MealAllocation>;
  let clusterRepo: Repository<CommunityMealCluster>;
  let userRepo: Repository<User>;
  let shopRepo: Repository<Shop>;
  let dataSource: DataSource;
  let allocationsQueue: any;

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
        TypeOrmModule.forFeature(ALL_ENTITIES),
        BullModule.registerQueue({
          name: 'community-meals-allocations',
        }),
        BullModule.registerQueue({
          name: 'community-meals-clustering',
        }),
        BullModule.registerQueue({
          name: 'community-meals-expiration',
        }),
      ],
      providers: [
        MealAllocationsService,
        ReservationExpiryProcessor,
        {
          provide: PaymentsService,
          useValue: { initiateAllocationPayment: vi.fn() },
        }
      ],
    }).compile();

    allocationsService = moduleRef.get(MealAllocationsService);
    expiryProcessor = moduleRef.get(ReservationExpiryProcessor);
    requestRepo = moduleRef.get(getRepositoryToken(CommunityMealRequest));
    offerRepo = moduleRef.get(getRepositoryToken(CommunityMealOffer));
    allocationRepo = moduleRef.get(getRepositoryToken(MealAllocation));
    clusterRepo = moduleRef.get(getRepositoryToken(CommunityMealCluster));
    userRepo = moduleRef.get(getRepositoryToken(User));
    shopRepo = moduleRef.get(getRepositoryToken(Shop));
    dataSource = moduleRef.get(DataSource);
    allocationsQueue = moduleRef.get(getQueueToken('community-meals-allocations'));
  }, 60000);

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  afterEach(async () => {
    await allocationRepo.query('TRUNCATE TABLE meal_allocations CASCADE');
    await requestRepo.query('TRUNCATE TABLE community_meal_requests CASCADE');
    await offerRepo.query('TRUNCATE TABLE community_meal_offers CASCADE');
    await clusterRepo.query('TRUNCATE TABLE community_meal_clusters CASCADE');
    await shopRepo.query('TRUNCATE TABLE shops CASCADE');
    vi.clearAllMocks();
  });

  async function createSetupData(availableQty = 10, maxQuantity = 10, clusterStatus = CommunityMealClusterStatus.SELECTION_OPEN) {
    const kitchenUser = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: kitchenUser.id,
      name: 'Test Kitchen',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));

    const cluster = await clusterRepo.save(clusterRepo.create({
      cuisine: 'Indian',
      mealType: 'LUNCH',
      dietaryRestrictions: '',
      spiceLevel: 'MEDIUM',
      centroid: { type: 'Point', coordinates: [0, 0] },
      status: clusterStatus,
      timeWindowStart: new Date(Date.now() + 3600000),
      timeWindowEnd: new Date(Date.now() + 7200000),
      minimumThreshold: 5,
    }));

    const offer = await offerRepo.save(offerRepo.create({
      clusterId: cluster.id,
      shopId: shop.id,
      pricePerServing: 15.5,
      minQuantity: 1,
      maxQuantity,
      availableQty,
      reservedQty: 0,
      committedQty: 0,
      menuDescription: 'Delicious meal',
      status: CommunityMealOfferStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 3600000),
      menuLockAt: new Date(Date.now() + 3600000),
    }));

    return { cluster, offer, shop };
  }

  async function createRequest(userId: string, clusterId: string, servings = 1, status = CommunityMealRequestStatus.SEARCHING) {
    return requestRepo.save(requestRepo.create({
      userId,
      clusterId,
      location: { type: 'Point', coordinates: [0, 0] },
      mealType: 'LUNCH',
      cuisine: 'Indian',
      servings,
      budgetMin: 10,
      budgetMax: 20,
      timeWindowStart: new Date(Date.now() + 3600000),
      timeWindowEnd: new Date(Date.now() + 7200000),
      status,
      expiresAt: new Date(Date.now() + 3600000),
    }));
  }

  describe('Basic Allocation & Authorization', () => {
    it('should create an allocation and update capacity correctly', async () => {
      const { cluster, offer } = await createSetupData(5);
      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 2);

      const allocation = await allocationsService.createAllocation(user.id, request.id, offer.id);
      expect(allocation).toBeDefined();
      expect(allocation.status).toBe(MealAllocationStatus.RESERVED);

      const updatedOffer = await offerRepo.findOneBy({ id: offer.id });
      expect(updatedOffer.availableQty).toBe(3);
      expect(updatedOffer.reservedQty).toBe(2);
    });

    it('should fail if user does not own request', async () => {
      const { cluster, offer } = await createSetupData(5);
      const user1 = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const user2 = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user1.id, cluster.id, 2);

      await expect(allocationsService.createAllocation(user2.id, request.id, offer.id)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Capacity & Idempotency', () => {
    it('should reject if insufficient capacity', async () => {
      const { cluster, offer } = await createSetupData(1);
      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 2);

      await expect(allocationsService.createAllocation(user.id, request.id, offer.id)).rejects.toThrow(ConflictException);
    });

    it('should return existing allocation if same offer requested again', async () => {
      const { cluster, offer } = await createSetupData(5);
      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 2);

      const allocation1 = await allocationsService.createAllocation(user.id, request.id, offer.id);
      const allocation2 = await allocationsService.createAllocation(user.id, request.id, offer.id);

      expect(allocation1.id).toBe(allocation2.id);

      const updatedOffer = await offerRepo.findOneBy({ id: offer.id });
      expect(updatedOffer.availableQty).toBe(3);
      expect(updatedOffer.reservedQty).toBe(2);
    });

    it('should reject with 409 if active allocation exists for a different offer', async () => {
      const { cluster, offer: offer1 } = await createSetupData(5);
      const offer2 = await offerRepo.save(offerRepo.create({
        clusterId: cluster.id,
        shopId: offer1.shopId,
        pricePerServing: 15.5,
        minQuantity: 1,
        maxQuantity: 10,
        availableQty: 5,
        reservedQty: 0,
        committedQty: 0,
        menuDescription: 'Delicious meal 2',
        status: CommunityMealOfferStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 3600000),
        menuLockAt: new Date(Date.now() + 3600000),
      }));

      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 1);

      await allocationsService.createAllocation(user.id, request.id, offer1.id);
      await expect(allocationsService.createAllocation(user.id, request.id, offer2.id)).rejects.toThrow('An active allocation already exists for a different offer');
    });
  });

  describe('Lifecycle', () => {
    it('should reject if offer is expired', async () => {
      const { cluster, offer } = await createSetupData(5);
      offer.expiresAt = new Date(Date.now() - 1000); // Past
      await offerRepo.save(offer);

      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 1);

      await expect(allocationsService.createAllocation(user.id, request.id, offer.id)).rejects.toThrow('Offer has expired');
    });

    it('should correctly restore capacity upon reservation expiry', async () => {
      const { cluster, offer } = await createSetupData(5);
      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 2);

      const allocation = await allocationsService.createAllocation(user.id, request.id, offer.id);
      
      const job = { data: { allocationId: allocation.id } } as Job;
      await expiryProcessor.process(job);

      const updatedOffer = await offerRepo.findOneBy({ id: offer.id });
      expect(updatedOffer.availableQty).toBe(5);
      expect(updatedOffer.reservedQty).toBe(0);

      const updatedAlloc = await allocationRepo.findOneBy({ id: allocation.id });
      expect(updatedAlloc.status).toBe(MealAllocationStatus.CANCELLED);
    });

    it('should do nothing if allocation is already confirmed', async () => {
      const { cluster, offer } = await createSetupData(5);
      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 2);

      const allocation = await allocationsService.createAllocation(user.id, request.id, offer.id);
      
      // Manually set to CONFIRMED
      allocation.status = MealAllocationStatus.CONFIRMED;
      await allocationRepo.save(allocation);

      const job = { data: { allocationId: allocation.id } } as Job;
      await expiryProcessor.process(job);

      const updatedOffer = await offerRepo.findOneBy({ id: offer.id });
      expect(updatedOffer.availableQty).toBe(3); // Unchanged

      const updatedAlloc = await allocationRepo.findOneBy({ id: allocation.id });
      expect(updatedAlloc.status).toBe(MealAllocationStatus.CONFIRMED);
    });
  });

  describe('Concurrency Races', () => {
    it('20 customers competing for 5 capacity (servings = 1)', async () => {
      const { cluster, offer } = await createSetupData(5, 10, CommunityMealClusterStatus.SELECTION_OPEN);
      
      const users = await Promise.all(
        Array.from({ length: 20 }).map(() => userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) })))
      );
      const requests = await Promise.all(
        users.map(u => createRequest(u.id, cluster.id, 1))
      );

      const promises = users.map((u, i) => allocationsService.createAllocation(u.id, requests[i].id, offer.id).catch(e => e));
      const results = await Promise.all(promises);

      const successes = results.filter(r => !(r instanceof Error));
      const failures = results.filter(r => r instanceof Error);

      expect(successes.length).toBe(5);
      expect(failures.length).toBe(15);

      const finalOffer = await offerRepo.findOneBy({ id: offer.id });
      expect(finalOffer.availableQty).toBe(0);
      expect(finalOffer.reservedQty).toBe(5);
      expect(finalOffer.committedQty).toBe(0);
    });

    it('same customer concurrently selecting different offers for same request', async () => {
      const { cluster, offer: offer1, shop } = await createSetupData(5);
      const offer2 = await offerRepo.save(offerRepo.create({
        clusterId: cluster.id,
        shopId: shop.id,
        pricePerServing: 15.5,
        minQuantity: 1,
        maxQuantity: 10,
        availableQty: 5,
        reservedQty: 0,
        committedQty: 0,
        menuDescription: 'Delicious meal 2',
        status: CommunityMealOfferStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 3600000),
        menuLockAt: new Date(Date.now() + 3600000),
      }));

      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 1);

      const promises = [
        allocationsService.createAllocation(user.id, request.id, offer1.id).catch(e => e),
        allocationsService.createAllocation(user.id, request.id, offer2.id).catch(e => e),
      ];

      const results = await Promise.all(promises);

      const successes = results.filter(r => !(r instanceof Error));
      const failures = results.filter(r => r instanceof Error);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(failures[0].message).toMatch(/active allocation already exists/i);

      // Verify no leaked capacity
      const finalOffer1 = await offerRepo.findOneBy({ id: offer1.id });
      const finalOffer2 = await offerRepo.findOneBy({ id: offer2.id });
      
      const totalReserved = finalOffer1.reservedQty + finalOffer2.reservedQty;
      expect(totalReserved).toBe(1);
      
      const totalAvailable = finalOffer1.availableQty + finalOffer2.availableQty;
      expect(totalAvailable).toBe(9); // (5 - x) + (5 - y) = 10 - 1 = 9
    });

    it('same customer exact retry concurrently', async () => {
      const { cluster, offer } = await createSetupData(5);
      const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
      const request = await createRequest(user.id, cluster.id, 1);

      const promises = Array.from({ length: 5 }).map(() =>
        allocationsService.createAllocation(user.id, request.id, offer.id).catch(e => e)
      );

      const results = await Promise.all(promises);

      const successes = results.filter(r => !(r instanceof Error));
      const failures = results.filter(r => r instanceof Error);

      expect(successes.length).toBe(5); // Due to idempotency, all should return the same allocation
      expect(failures.length).toBe(0);

      const uniqueAllocations = new Set(successes.map(s => s.id));
      expect(uniqueAllocations.size).toBe(1);

      const finalOffer = await offerRepo.findOneBy({ id: offer.id });
      expect(finalOffer.availableQty).toBe(4);
      expect(finalOffer.reservedQty).toBe(1);
    });
  });
});
