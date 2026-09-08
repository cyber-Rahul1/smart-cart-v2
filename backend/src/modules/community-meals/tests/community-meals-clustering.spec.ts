import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommunityMealCluster } from '../entities/community-meal-cluster.entity.js';
import { CommunityMealRequest } from '../entities/community-meal-request.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { ALL_ENTITIES } from '../../../core/database/entities.js';
import { CommunityMealRequestStatus } from '../enums/community-meal-request-status.enum.js';
import { CommunityMealClusteringService } from '../services/community-meal-clustering.service.js';
import { CommunityMealClusterStatus } from '../enums/community-meal-cluster-status.enum.js';

describe('Community Meals Clustering (Integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let requestRepo: Repository<CommunityMealRequest>;
  let clusterRepo: Repository<CommunityMealCluster>;
  let userRepo: Repository<User>;
  let clusteringService: CommunityMealClusteringService;

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
          CommunityMealCluster,
          CommunityMealRequest,
          User,
        ]),
      ],
      providers: [CommunityMealClusteringService],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    requestRepo = moduleRef.get(getRepositoryToken(CommunityMealRequest));
    clusterRepo = moduleRef.get(getRepositoryToken(CommunityMealCluster));
    userRepo = moduleRef.get(getRepositoryToken(User));
    clusteringService = moduleRef.get(CommunityMealClusteringService);
  }, 60000);

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  afterEach(async () => {
    await requestRepo.query('TRUNCATE TABLE community_meal_requests CASCADE');
    await clusterRepo.query('TRUNCATE TABLE community_meal_clusters CASCADE');
  });

  it('should cluster compatible requests and trigger OFFERING at threshold', async () => {
    const user1 = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
    const user2 = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
    const user3 = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));

    const baseTime = new Date(Date.now() + 3600000);

    const r1 = await requestRepo.save(requestRepo.create({
      userId: user1.id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      mealType: 'Dinner',
      cuisine: 'Mexican',
      dietaryRestrictions: 'Vegetarian',
      budgetMin: 100,
      budgetMax: 500,
      timeWindowStart: baseTime,
      timeWindowEnd: new Date(baseTime.getTime() + 3600000),
      expiresAt: baseTime,
      status: CommunityMealRequestStatus.SEARCHING,
    }));

    await clusteringService.clusterRequest(r1.id);
    
    let c1 = await clusterRepo.findOne({ where: { cuisine: 'Mexican' }, relations: { requests: true } });
    expect(c1).toBeDefined();
    expect(c1!.status).toBe(CommunityMealClusterStatus.GATHERING_DEMAND);

    // Request 2 - same everything
    const r2 = await requestRepo.save(requestRepo.create({
      userId: user2.id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] }, // same spot
      mealType: 'Dinner',
      cuisine: 'Mexican',
      dietaryRestrictions: 'Vegetarian',
      budgetMin: 100,
      budgetMax: 500,
      timeWindowStart: baseTime,
      timeWindowEnd: new Date(baseTime.getTime() + 3600000),
      expiresAt: baseTime,
      status: CommunityMealRequestStatus.SEARCHING,
    }));

    await clusteringService.clusterRequest(r2.id);

    // Request 3 - same everything
    const r3 = await requestRepo.save(requestRepo.create({
      userId: user3.id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      mealType: 'Dinner',
      cuisine: 'Mexican',
      dietaryRestrictions: 'Vegetarian',
      budgetMin: 100,
      budgetMax: 500,
      timeWindowStart: baseTime,
      timeWindowEnd: new Date(baseTime.getTime() + 3600000),
      expiresAt: baseTime,
      status: CommunityMealRequestStatus.SEARCHING,
    }));

    await clusteringService.clusterRequest(r3.id);

    const allClusters = await clusterRepo.find({ where: { cuisine: 'Mexican' } });
    console.log(`Clusters found: ${allClusters.length}`);
    console.log(JSON.stringify(allClusters, null, 2));
    c1 = allClusters[0];
    expect(c1!.status).toBe(CommunityMealClusterStatus.OFFERING);

    const requests = await requestRepo.find({ where: { cuisine: 'Mexican' } });
    requests.forEach(r => {
      expect(r.clusterId).toBe(c1!.id);
      expect(r.status).toBe(CommunityMealRequestStatus.OFFERING);
    });
  });

  it('should not cluster if distance is > 2km', async () => {
    const user1 = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
    const user2 = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
    const baseTime = new Date(Date.now() + 3600000);

    const r1 = await requestRepo.save(requestRepo.create({
      userId: user1.id,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      mealType: 'Dinner',
      cuisine: 'Italian',
      budgetMin: 100,
      budgetMax: 500,
      timeWindowStart: baseTime,
      timeWindowEnd: new Date(baseTime.getTime() + 3600000),
      expiresAt: baseTime,
      status: CommunityMealRequestStatus.SEARCHING,
    }));

    await clusteringService.clusterRequest(r1.id);

    const r2 = await requestRepo.save(requestRepo.create({
      userId: user2.id,
      // 3km away approx
      location: { type: 'Point', coordinates: [77.5946, 12.9986] },
      mealType: 'Dinner',
      cuisine: 'Italian',
      budgetMin: 100,
      budgetMax: 500,
      timeWindowStart: baseTime,
      timeWindowEnd: new Date(baseTime.getTime() + 3600000),
      expiresAt: baseTime,
      status: CommunityMealRequestStatus.SEARCHING,
    }));

    await clusteringService.clusterRequest(r2.id);

    const clusters = await clusterRepo.find({ where: { cuisine: 'Italian' } });
    expect(clusters.length).toBe(2); // Separated because > 2000m
  });
});
