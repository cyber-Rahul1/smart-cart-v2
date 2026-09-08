import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KitchenEligibilityService } from '../services/kitchen-eligibility.service.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { KitchenCompliance } from '../entities/kitchen-compliance.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { ShopStatus } from '../../shops/enums/shop-status.enum.js';
import { FssaiStatus } from '../enums/fssai-status.enum.js';
import { KitchenOperationalStatus } from '../enums/kitchen-operational-status.enum.js';
import { ALL_ENTITIES } from '../../../core/database/entities.js';

describe('Kitchen Eligibility Service (Integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let eligibilityService: KitchenEligibilityService;
  let shopRepo: Repository<Shop>;
  let complianceRepo: Repository<KitchenCompliance>;
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
        TypeOrmModule.forFeature([
          Shop,
          KitchenCompliance,
          User,
        ]),
      ],
      providers: [KitchenEligibilityService],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    eligibilityService = moduleRef.get(KitchenEligibilityService);
    shopRepo = moduleRef.get(getRepositoryToken(Shop));
    complianceRepo = moduleRef.get(getRepositoryToken(KitchenCompliance));
    userRepo = moduleRef.get(getRepositoryToken(User));
  }, 60000);

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  afterEach(async () => {
    await complianceRepo.query('TRUNCATE TABLE kitchen_compliance CASCADE');
    await shopRepo.query('TRUNCATE TABLE shops CASCADE');
  });

  it('should return eligible for a fully compliant kitchen', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Test Kitchen',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));

    await complianceRepo.save(complianceRepo.create({
      shopId: shop.id,
      kycStatus: 'VERIFIED',
      fssaiStatus: FssaiStatus.VALID,
      fssaiValidFrom: new Date(Date.now() - 10000),
      fssaiValidUntil: new Date(Date.now() + 10000000),
      settlementAccountStatus: 'ACTIVE',
      operationalStatus: KitchenOperationalStatus.ELIGIBLE,
    }));

    const result = await eligibilityService.checkEligibility(user.id, shop.id);
    expect(result.eligible).toBe(true);
  });

  it('should fail if shop is inactive', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Test Kitchen',
      status: ShopStatus.INACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));

    await complianceRepo.save(complianceRepo.create({
      shopId: shop.id,
      kycStatus: 'VERIFIED',
      fssaiStatus: FssaiStatus.VALID,
      settlementAccountStatus: 'ACTIVE',
      operationalStatus: KitchenOperationalStatus.ELIGIBLE,
    }));

    const result = await eligibilityService.checkEligibility(user.id, shop.id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('active');
  });

  it('should fail if KYC is not verified', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Test Kitchen',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));

    await complianceRepo.save(complianceRepo.create({
      shopId: shop.id,
      kycStatus: 'PENDING',
      fssaiStatus: FssaiStatus.VALID,
      settlementAccountStatus: 'ACTIVE',
      operationalStatus: KitchenOperationalStatus.ELIGIBLE,
    }));

    const result = await eligibilityService.checkEligibility(user.id, shop.id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('KYC');
  });

  it('should fail if FSSAI is expired by date', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Test Kitchen',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));

    await complianceRepo.save(complianceRepo.create({
      shopId: shop.id,
      kycStatus: 'VERIFIED',
      fssaiStatus: FssaiStatus.VALID,
      fssaiValidFrom: new Date(Date.now() - 10000000),
      fssaiValidUntil: new Date(Date.now() - 10000), // Past
      settlementAccountStatus: 'ACTIVE',
      operationalStatus: KitchenOperationalStatus.ELIGIBLE,
    }));

    const result = await eligibilityService.checkEligibility(user.id, shop.id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('expired');
  });
  
  it('should fail if not owner', async () => {
    const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const otherUser = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.random().toString().slice(2, 12) }));
    const shop = await shopRepo.save(shopRepo.create({
      ownerId: user.id,
      name: 'Test Kitchen',
      status: ShopStatus.ACTIVE,
      location: { type: 'Point', coordinates: [0, 0] },
    }));

    await complianceRepo.save(complianceRepo.create({
      shopId: shop.id,
      kycStatus: 'VERIFIED',
      fssaiStatus: FssaiStatus.VALID,
      settlementAccountStatus: 'ACTIVE',
      operationalStatus: KitchenOperationalStatus.ELIGIBLE,
    }));

    const result = await eligibilityService.checkEligibility(otherUser.id, shop.id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('own');
  });
});
