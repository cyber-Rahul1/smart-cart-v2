import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommunityMealOffersService } from '../services/community-meal-offers.service.js';
import { KitchenEligibilityService } from '../services/kitchen-eligibility.service.js';
import { CommunityMealClusteringService } from '../services/community-meal-clustering.service.js';
import { CommunityMealOffer } from '../entities/community-meal-offer.entity.js';
import { CommunityMealCluster } from '../entities/community-meal-cluster.entity.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { ShopStatus } from '../../shops/enums/shop-status.enum.js';
import { KitchenCompliance } from '../entities/kitchen-compliance.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { CommunityMealOfferStatus } from '../enums/community-meal-offer-status.enum.js';
import { CommunityMealClusterStatus } from '../enums/community-meal-cluster-status.enum.js';
import { ALL_ENTITIES } from '../../../core/database/entities.js';
import { BullModule } from '@nestjs/bullmq';
import { vi } from 'vitest';

describe('Community Meal Offers Service (Integration)', () => {
  let moduleRef: TestingModule;
  let offersService: CommunityMealOffersService;
  let eligibilityService: KitchenEligibilityService;
  let offerRepo: Repository<CommunityMealOffer>;
  let clusterRepo: Repository<CommunityMealCluster>;
  let shopRepo: Repository<Shop>;
  let userRepo: Repository<User>;

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
          name: 'community-meals-clustering',
        }),
        BullModule.registerQueue({
          name: 'community-meals-expiration',
        }),
      ],
      providers: [
        CommunityMealOffersService,
        KitchenEligibilityService,
        CommunityMealClusteringService,
      ],
    }).compile();

    offersService = moduleRef.get(CommunityMealOffersService);
    eligibilityService = moduleRef.get(KitchenEligibilityService);
    offerRepo = moduleRef.get(getRepositoryToken(CommunityMealOffer));
    clusterRepo = moduleRef.get(getRepositoryToken(CommunityMealCluster));
    shopRepo = moduleRef.get(getRepositoryToken(Shop));
    userRepo = moduleRef.get(getRepositoryToken(User));
  }, 60000);

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  afterEach(async () => {
    await offerRepo.query('TRUNCATE TABLE community_meal_offers CASCADE');
    await clusterRepo.query('TRUNCATE TABLE community_meal_clusters CASCADE');
    await shopRepo.query('TRUNCATE TABLE shops CASCADE');
  });

  it('should create an offer successfully for an eligible kitchen', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Offer Kitchen',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));

    // Mock eligibility
    vi.spyOn(eligibilityService, 'requireEligibility').mockResolvedValue(undefined);

    const cluster = await clusterRepo.save(clusterRepo.create({
      cuisine: 'Indian',
      mealType: 'LUNCH',
      dietaryRestrictions: '',
      spiceLevel: 'MEDIUM',
      centroid: { type: 'Point', coordinates: [0, 0] },
      status: CommunityMealClusterStatus.OFFERING,
      timeWindowStart: new Date(Date.now() + 3600000),
      timeWindowEnd: new Date(Date.now() + 7200000),
      minimumThreshold: 5,
    }));

    const dto = {
      clusterId: cluster.id,
      pricePerServing: 15.5,
      minQuantity: 2,
      maxQuantity: 10,
      menuDescription: 'Delicious meal',
    };

    const offer = await offersService.createOffer(user.id, shop.id, dto);

    expect(offer).toBeDefined();
    expect(offer.status).toBe(CommunityMealOfferStatus.ACTIVE);
    expect(offer.availableQty).toBe(10);
    expect(offer.reservedQty).toBe(0);
    expect(offer.committedQty).toBe(0);
    expect(Number(offer.pricePerServing)).toBe(15.5);
  });

  it('should prevent creating an offer if cluster is not in OFFERING state', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Offer Kitchen 2',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));
    vi.spyOn(eligibilityService, 'requireEligibility').mockResolvedValue(undefined);

    const cluster = await clusterRepo.save(clusterRepo.create({
      cuisine: 'Indian',
      mealType: 'LUNCH',
      dietaryRestrictions: '',
      spiceLevel: 'MEDIUM',
      centroid: { type: 'Point', coordinates: [0, 0] },
      status: CommunityMealClusterStatus.GATHERING_DEMAND, // Wrong state
      timeWindowStart: new Date(Date.now() + 3600000),
      timeWindowEnd: new Date(Date.now() + 7200000),
      minimumThreshold: 2,
    }));

    const dto = {
      clusterId: cluster.id,
      pricePerServing: 15.5,
      minQuantity: 2,
      maxQuantity: 10,
      menuDescription: 'Delicious meal',
    };

    await expect(offersService.createOffer(user.id, shop.id, dto)).rejects.toThrow('Cluster is not accepting offers');
  });

  it('should prevent creating a duplicate offer for the same cluster', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Offer Kitchen 3',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));
    vi.spyOn(eligibilityService, 'requireEligibility').mockResolvedValue(undefined);

    const cluster = await clusterRepo.save(clusterRepo.create({
      cuisine: 'Indian',
      mealType: 'LUNCH',
      dietaryRestrictions: '',
      spiceLevel: 'MEDIUM',
      centroid: { type: 'Point', coordinates: [0, 0] },
      status: CommunityMealClusterStatus.OFFERING,
      timeWindowStart: new Date(Date.now() + 3600000),
      timeWindowEnd: new Date(Date.now() + 7200000),
      minimumThreshold: 5,
    }));

    const dto = {
      clusterId: cluster.id,
      pricePerServing: 15.5,
      minQuantity: 2,
      maxQuantity: 10,
      menuDescription: 'Delicious meal',
    };

    await offersService.createOffer(user.id, shop.id, dto);

    await expect(offersService.createOffer(user.id, shop.id, dto)).rejects.toThrow('active offer already exists');
  });
  
  it('should enforce availableQty + reservedQty + committedQty <= maxQuantity constraints', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Offer Kitchen 4',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));
    vi.spyOn(eligibilityService, 'requireEligibility').mockResolvedValue(undefined);

    const cluster = await clusterRepo.save(clusterRepo.create({
      cuisine: 'Indian',
      mealType: 'LUNCH',
      dietaryRestrictions: '',
      spiceLevel: 'MEDIUM',
      centroid: { type: 'Point', coordinates: [0, 0] },
      status: CommunityMealClusterStatus.OFFERING,
      timeWindowStart: new Date(Date.now() + 3600000),
      timeWindowEnd: new Date(Date.now() + 7200000),
    }));

    const dto = {
      clusterId: cluster.id,
      pricePerServing: 15.5,
      minQuantity: 2,
      maxQuantity: 10,
      menuDescription: 'Delicious meal',
    };

    const offer = await offersService.createOffer(user.id, shop.id, dto);
    
    offer.availableQty = 5;
    offer.reservedQty = 6; // 5 + 6 = 11 > 10 (maxQuantity)
    
    await expect(offerRepo.save(offer)).rejects.toThrow();
  });
});
