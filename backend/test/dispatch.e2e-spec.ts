import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Delivery } from '../src/modules/logistics/entities/delivery.entity.js';
import { DeliveryOffer } from '../src/modules/logistics/entities/delivery-offer.entity.js';
import { Order } from '../src/modules/orders/entities/order.entity.js';
import { RiderProfile } from '../src/modules/users/entities/rider-profile.entity.js';
import { Shop } from '../src/modules/shops/entities/shop.entity.js';
import { ShopStatus } from '../src/modules/shops/enums/shop-status.enum.js';
import { DataSource } from 'typeorm';
import { UserRole } from '../src/modules/users/enums/user-role.enum.js';
import { RiderKycStatus } from '../src/modules/users/enums/rider-kyc-status.enum.js';
import { RiderAvailabilityStatus } from '../src/modules/users/enums/rider-availability-status.enum.js';
import { DeliveryStatus } from '../src/modules/logistics/enums/delivery-status.enum.js';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum.js';
import { OfferStatus } from '../src/modules/logistics/enums/offer-status.enum.js';
import * as jwt from 'jsonwebtoken';

describe('Dispatch & Concurrency (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let mockCustomerId: string;
  let mockShopId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    
    dataSource = moduleFixture.get(DataSource);

    // Setup a real customer via raw SQL (User entity only has phoneNumber, roles, status)
    const phone = `+1999${Date.now().toString().slice(-7)}`;
    const customerResult = await dataSource.query(
      `INSERT INTO users ("phoneNumber", roles, status)
       VALUES ($1, '{"CUSTOMER"}', 'ACTIVE')
       RETURNING id`,
      [phone],
    );
    mockCustomerId = customerResult[0].id;

    // Setup a real shop for FK constraints
    const shopRepo = dataSource.getRepository(Shop);
    const mockShop = await shopRepo.save(
      shopRepo.create({
        ownerId: mockCustomerId,
        name: 'Mock Dispatch Shop',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        status: ShopStatus.ACTIVE,
        minimumOrder: 100,
        deliveryRadius: 5000,
      }),
    );
    mockShopId = mockShop.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const generateToken = (userId: string, role: UserRole) => {
    return jwt.sign(
      { sub: userId, roles: [role], email: 'test@test.com' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' },
    );
  };

  const setupRider = async (prefix: string) => {
    const phone = `+1555${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 100)}`;
    const userResult = await dataSource.query(
      `INSERT INTO users ("phoneNumber", roles, status)
       VALUES ($1, '{"RIDER"}', 'ACTIVE')
       RETURNING id`,
      [phone],
    );
    const userId = userResult[0].id;

    const profileRepo = dataSource.getRepository(RiderProfile);
    const profile = await profileRepo.save(
      profileRepo.create({
        userId,
        kycStatus: RiderKycStatus.APPROVED,
        availabilityStatus: RiderAvailabilityStatus.ONLINE,
        vehicleType: 'BIKE',
        licenseNumber: `LIC-${prefix}-${Date.now()}`,
      }),
    );

    return { userId, profile, token: generateToken(userId, UserRole.RIDER) };
  };

  const setupDeliveryAndOffer = async (riderId: string) => {
    const orderRepo = dataSource.getRepository(Order);
    const deliveryRepo = dataSource.getRepository(Delivery);
    const offerRepo = dataSource.getRepository(DeliveryOffer);

    const order = await orderRepo.save(
      orderRepo.create({
        customerId: mockCustomerId,
        shopId: mockShopId,
        status: OrderStatus.READY_FOR_PICKUP,
        totalAmount: 100,
        subtotal: 100,
        deliveryFee: 0,
        deliveryAddressLabel: 'Home',
        deliveryAddressLine: '123 Mock St',
        deliveryLocation: { type: 'Point', coordinates: [0, 0] },
      }),
    );

    const delivery = await deliveryRepo.save(
      deliveryRepo.create({
        orderId: order.id,
        status: DeliveryStatus.OFFERING,
        pickupLocation: { type: 'Point', coordinates: [0, 0] },
        dropoffLocation: { type: 'Point', coordinates: [0, 0] },
      }),
    );

    const offer = await offerRepo.save(
      offerRepo.create({
        deliveryId: delivery.id,
        riderId: riderId,
        status: OfferStatus.PENDING,
        expiresAt: new Date(Date.now() + 100000),
      }),
    );

    return { order, delivery, offer };
  };

  it('Rider accepts two deliveries concurrently (Only one should succeed)', async () => {
    const rider = await setupRider('r1');
    const d1 = await setupDeliveryAndOffer(rider.profile.id);
    const d2 = await setupDeliveryAndOffer(rider.profile.id);

    // Concurrently accept both
    const results = await Promise.allSettled([
      request(app.getHttpServer())
        .post(`/riders/offers/${d1.offer.id}/accept`)
        .set('Authorization', `Bearer ${rider.token}`)
        .expect((res: any) => res.status === 201 || res.status === 409),
      request(app.getHttpServer())
        .post(`/riders/offers/${d2.offer.id}/accept`)
        .set('Authorization', `Bearer ${rider.token}`)
        .expect((res: any) => res.status === 201 || res.status === 409),
    ]);

    const successes = results.filter((r: any) => r.value && r.value.status === 201);
    const conflicts = results.filter((r: any) => r.value && r.value.status === 409);

    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(1);

    // Verify DB state
    const profile = await dataSource.getRepository(RiderProfile).findOne({ where: { id: rider.profile.id } });
    expect(profile!.availabilityStatus).toBe(RiderAvailabilityStatus.BUSY);
  });

  it('Two Riders accept the same delivery concurrently (Only one should succeed)', async () => {
    const rA = await setupRider('ra');
    const rB = await setupRider('rb');

    const orderRepo = dataSource.getRepository(Order);
    const deliveryRepo = dataSource.getRepository(Delivery);
    const offerRepo = dataSource.getRepository(DeliveryOffer);

    const order = await orderRepo.save(
      orderRepo.create({
        customerId: mockCustomerId,
        shopId: mockShopId,
        status: OrderStatus.READY_FOR_PICKUP,
        totalAmount: 100,
        subtotal: 100,
        deliveryFee: 0,
        deliveryAddressLabel: 'Home',
        deliveryAddressLine: '123 Mock St',
        deliveryLocation: { type: 'Point', coordinates: [0, 0] },
      }),
    );

    const delivery = await deliveryRepo.save(
      deliveryRepo.create({
        orderId: order.id,
        status: DeliveryStatus.OFFERING,
        pickupLocation: { type: 'Point', coordinates: [0, 0] },
        dropoffLocation: { type: 'Point', coordinates: [0, 0] },
      }),
    );

    const offerA = await offerRepo.save(
      offerRepo.create({
        deliveryId: delivery.id,
        riderId: rA.profile.id,
        status: OfferStatus.PENDING,
        expiresAt: new Date(Date.now() + 100000),
      }),
    );

    const offerB = await offerRepo.save(
      offerRepo.create({
        deliveryId: delivery.id,
        riderId: rB.profile.id,
        status: OfferStatus.PENDING,
        expiresAt: new Date(Date.now() + 100000),
      }),
    );

    const results = await Promise.allSettled([
      request(app.getHttpServer())
        .post(`/riders/offers/${offerA.id}/accept`)
        .set('Authorization', `Bearer ${rA.token}`)
        .expect((res: any) => res.status === 201 || res.status === 409 || res.status === 404),
      request(app.getHttpServer())
        .post(`/riders/offers/${offerB.id}/accept`)
        .set('Authorization', `Bearer ${rB.token}`)
        .expect((res: any) => res.status === 201 || res.status === 409 || res.status === 404),
    ]);

    const successes = results.filter((r: any) => r.value && r.value.status === 201);
    expect(successes.length).toBe(1);

    const updatedDelivery = await deliveryRepo.findOne({ where: { id: delivery.id } });
    expect(updatedDelivery!.status).toBe(DeliveryStatus.ASSIGNED);

    const updatedOrder = await orderRepo.findOne({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe(OrderStatus.RIDER_ASSIGNED);
  });
});
