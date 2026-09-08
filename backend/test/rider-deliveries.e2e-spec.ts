import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Delivery } from '../src/modules/logistics/entities/delivery.entity.js';
import { Order } from '../src/modules/orders/entities/order.entity.js';
import { RiderProfile } from '../src/modules/users/entities/rider-profile.entity.js';
import { Shop } from '../src/modules/shops/entities/shop.entity.js';
import { Payment } from '../src/modules/payments/entities/payment.entity.js';
import { PaymentMethod } from '../src/modules/payments/enums/payment-method.enum.js';
import { PaymentStatus } from '../src/modules/payments/enums/payment-status.enum.js';
import { ShopStatus } from '../src/modules/shops/enums/shop-status.enum.js';
import { DataSource } from 'typeorm';
import { UserRole } from '../src/modules/users/enums/user-role.enum.js';
import { RiderKycStatus } from '../src/modules/users/enums/rider-kyc-status.enum.js';
import { RiderAvailabilityStatus } from '../src/modules/users/enums/rider-availability-status.enum.js';
import { DeliveryStatus } from '../src/modules/logistics/enums/delivery-status.enum.js';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum.js';
import { DeliveryFailureReason } from '../src/modules/logistics/enums/delivery-failure-reason.enum.js';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

describe('Rider Deliveries (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let mockCustomerId: string;
  let mockShopId: string;
  let jwtSecret: string;
  
  // Rider A
  let riderAId: string;
  let riderAProfileId: string;
  let riderAToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    
    dataSource = moduleFixture.get(DataSource);
    jwtSecret = process.env.JWT_SECRET || 'secret';

    // 1. Setup Customer
    const phone = `+1999${Date.now().toString().slice(-7)}`;
    const customerResult = await dataSource.query(
      `INSERT INTO users ("phoneNumber", roles, status) VALUES ($1, '{"CUSTOMER"}', 'ACTIVE') RETURNING id`,
      [phone],
    );
    mockCustomerId = customerResult[0].id;

    // 2. Setup Shop
    const shopRepo = dataSource.getRepository(Shop);
    const mockShop = await shopRepo.save(
      shopRepo.create({
        ownerId: mockCustomerId,
        name: 'Mock Shop for Deliveries',
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        status: ShopStatus.ACTIVE,
        minimumOrder: 100,
        deliveryRadius: 5000,
      }),
    );
    mockShopId = mockShop.id;

    // 3. Setup Rider A
    const riderPhone = `+1888${Date.now().toString().slice(-7)}`;
    const riderResult = await dataSource.query(
      `INSERT INTO users ("phoneNumber", roles, status) VALUES ($1, '{"RIDER"}', 'ACTIVE') RETURNING id`,
      [riderPhone],
    );
    riderAId = riderResult[0].id;

    const riderProfileRepo = dataSource.getRepository(RiderProfile);
    const mockRiderProfile = await riderProfileRepo.save(
      riderProfileRepo.create({
        userId: riderAId,
        kycStatus: RiderKycStatus.APPROVED,
        availabilityStatus: RiderAvailabilityStatus.BUSY, // they will be busy with delivery
        currentLocation: { type: 'Point', coordinates: [77.5945, 12.9715] },
        lastLocationUpdate: new Date(),
      }),
    );
    riderAProfileId = mockRiderProfile.id;

    riderAToken = jwt.sign(
      { sub: riderAId, roles: [UserRole.RIDER], deviceId: 'test-device' },
      jwtSecret,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Clean up deliveries and orders to avoid unique constraint issues
    await dataSource.query(`DELETE FROM deliveries`);
    await dataSource.query(`DELETE FROM payments`);
    await dataSource.query(`DELETE FROM orders`);
  });

  async function createMockDelivery(
    status: DeliveryStatus = DeliveryStatus.ASSIGNED,
    pickupOtp: string = '123456',
    deliveryOtp: string | null = null,
    paymentMethod: PaymentMethod = PaymentMethod.ONLINE
  ) {
    const orderRepo = dataSource.getRepository(Order);
    const deliveryRepo = dataSource.getRepository(Delivery);
    const paymentRepo = dataSource.getRepository(Payment);

    const order = await orderRepo.save(
      orderRepo.create({
        customerId: mockCustomerId,
        shopId: mockShopId,
        status: OrderStatus.RIDER_ASSIGNED,
        subtotal: 100,
        totalAmount: 120,
        deliveryFee: 20,
        deliveryAddressLabel: 'Home',
        deliveryAddressLine: '123 Test St',
        deliveryLocation: { type: 'Point', coordinates: [77.594, 12.971] },
      }),
    );

    const payment = await paymentRepo.save(
      paymentRepo.create({
        orderId: order.id,
        paymentMethod: paymentMethod,
        provider: 'MOCK',
        status: paymentMethod === PaymentMethod.COD ? PaymentStatus.PENDING : PaymentStatus.CAPTURED,
        amount: 125,
      }),
    );

    const hashedPickupOtp = await bcrypt.hash(pickupOtp, 10);
    let hashedDeliveryOtp = null;
    if (deliveryOtp) hashedDeliveryOtp = await bcrypt.hash(deliveryOtp, 10);

    const delivery = await deliveryRepo.save(
      deliveryRepo.create({
        orderId: order.id,
        riderId: riderAProfileId,
        status: status,
        pickupLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
        dropoffLocation: { type: 'Point', coordinates: [77.594, 12.971] },
        pickupOtpHashed: hashedPickupOtp,
        pickupOtpExpiresAt: new Date(Date.now() + 1000000),
        deliveryOtpHashed: hashedDeliveryOtp,
        deliveryOtpExpiresAt: deliveryOtp ? new Date(Date.now() + 1000000) : null,
      }),
    );

    return { order, delivery, payment };
  }

  it('GET /riders/deliveries/active - should return active delivery', async () => {
    const { delivery } = await createMockDelivery(DeliveryStatus.ASSIGNED);
    const res = await request(app.getHttpServer())
      .get('/riders/deliveries/active')
      .set('Authorization', `Bearer ${riderAToken}`)
      .expect(200);

    expect(res.body.delivery.id).toBe(delivery.id);
  });

  describe('Pickup Flow', () => {
    it('should fail with incorrect OTP and increment counter', async () => {
      const { delivery } = await createMockDelivery(DeliveryStatus.ASSIGNED, '123456');
      
      const res = await request(app.getHttpServer())
        .post(`/riders/deliveries/${delivery.id}/pickup`)
        .set('Authorization', `Bearer ${riderAToken}`)
        .send({ otp: '000000' })
        .expect(400);

      const updatedDelivery = await dataSource.getRepository(Delivery).findOne({ where: { id: delivery.id } });
      expect(updatedDelivery!.pickupOtpAttempts).toBe(1);
    });

    it('should lock out after 5 failed attempts', async () => {
      const { delivery } = await createMockDelivery(DeliveryStatus.ASSIGNED, '123456');
      
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post(`/riders/deliveries/${delivery.id}/pickup`)
          .set('Authorization', `Bearer ${riderAToken}`)
          .send({ otp: '000000' })
          .expect(400);
      }

      const updatedDelivery = await dataSource.getRepository(Delivery).findOne({ where: { id: delivery.id } });
      expect(updatedDelivery!.pickupOtpAttempts).toBe(5);
      expect(updatedDelivery!.pickupVerificationLockedUntil).not.toBeNull();

      // Next attempt should return 409 Conflict immediately (locked out)
      await request(app.getHttpServer())
        .post(`/riders/deliveries/${delivery.id}/pickup`)
        .set('Authorization', `Bearer ${riderAToken}`)
        .send({ otp: '123456' })
        .expect(409);
    });

    it('should succeed with correct OTP and update status', async () => {
      const { delivery } = await createMockDelivery(DeliveryStatus.ASSIGNED, '123456');
      
      const res = await request(app.getHttpServer())
        .post(`/riders/deliveries/${delivery.id}/pickup`)
        .set('Authorization', `Bearer ${riderAToken}`)
        .send({ otp: '123456' });
      if (res.status !== 201) throw new Error(`Test failed with status ${res.status}: ${JSON.stringify(res.body)}`);
      expect(res.status).toBe(201);

      const updatedDelivery = await dataSource.getRepository(Delivery).findOne({ where: { id: delivery.id } });
      const updatedOrder = await dataSource.getRepository(Order).findOne({ where: { id: delivery.orderId } });

      expect(updatedDelivery!.status).toBe(DeliveryStatus.PICKED_UP);
      expect(updatedOrder!.status).toBe(OrderStatus.PICKED_UP);
      expect(updatedDelivery!.pickupOtpHashed).toBeNull();
      expect(updatedDelivery!.deliveryOtpHashed).not.toBeNull(); // It should have generated the delivery OTP
    });
  });

  describe('Delivery Progression', () => {
    it('should transition to OUT_FOR_DELIVERY', async () => {
      const { delivery } = await createMockDelivery(DeliveryStatus.PICKED_UP);
      await request(app.getHttpServer())
        .post(`/riders/deliveries/${delivery.id}/start`)
        .set('Authorization', `Bearer ${riderAToken}`)
        .expect(201);

      const updatedDelivery = await dataSource.getRepository(Delivery).findOne({ where: { id: delivery.id } });
      expect(updatedDelivery!.status).toBe(DeliveryStatus.OUT_FOR_DELIVERY);
    });

    it('should transition to ARRIVING', async () => {
      const { delivery } = await createMockDelivery(DeliveryStatus.OUT_FOR_DELIVERY);
      await request(app.getHttpServer())
        .post(`/riders/deliveries/${delivery.id}/arriving`)
        .set('Authorization', `Bearer ${riderAToken}`)
        .expect(201);

      const updatedDelivery = await dataSource.getRepository(Delivery).findOne({ where: { id: delivery.id } });
      expect(updatedDelivery!.status).toBe(DeliveryStatus.ARRIVING);
    });
  });

  describe('Delivery Completion Flow', () => {
    it('should complete delivery and capture COD payment if applicable', async () => {
      const { delivery, payment } = await createMockDelivery(
        DeliveryStatus.ARRIVING, 
        '111111', 
        '654321', // delivery OTP
        PaymentMethod.COD
      );

      await request(app.getHttpServer())
        .post(`/riders/deliveries/${delivery.id}/complete`)
        .set('Authorization', `Bearer ${riderAToken}`)
        .send({ otp: '654321' })
        .expect(201);

      const updatedDelivery = await dataSource.getRepository(Delivery).findOne({ where: { id: delivery.id } });
      const updatedOrder = await dataSource.getRepository(Order).findOne({ where: { id: delivery.orderId } });
      const updatedPayment = await dataSource.getRepository(Payment).findOne({ where: { id: payment.id } });
      const riderProfile = await dataSource.getRepository(RiderProfile).findOne({ where: { id: riderAProfileId } });

      expect(updatedDelivery!.status).toBe(DeliveryStatus.DELIVERED);
      expect(updatedOrder!.status).toBe(OrderStatus.DELIVERED);
      expect(updatedPayment!.status).toBe(PaymentStatus.CAPTURED);
      expect(updatedDelivery!.deliveryOtpHashed).toBeNull();
      expect(riderProfile!.availabilityStatus).toBe(RiderAvailabilityStatus.ONLINE); // Freed up
    });
  });

  describe('Delivery Failure Flow', () => {
    it('should fail delivery, set reason, and free up rider', async () => {
      const { delivery } = await createMockDelivery(DeliveryStatus.OUT_FOR_DELIVERY);

      await request(app.getHttpServer())
        .post(`/riders/deliveries/${delivery.id}/fail`)
        .set('Authorization', `Bearer ${riderAToken}`)
        .send({ reason: DeliveryFailureReason.CUSTOMER_UNAVAILABLE, notes: 'Waited 10 mins' })
        .expect(201);

      const updatedDelivery = await dataSource.getRepository(Delivery).findOne({ where: { id: delivery.id } });
      const updatedOrder = await dataSource.getRepository(Order).findOne({ where: { id: delivery.orderId } });
      const riderProfile = await dataSource.getRepository(RiderProfile).findOne({ where: { id: riderAProfileId } });

      expect(updatedDelivery!.status).toBe(DeliveryStatus.FAILED);
      expect(updatedDelivery!.failureReason).toBe(DeliveryFailureReason.CUSTOMER_UNAVAILABLE);
      expect(updatedOrder!.status).toBe(OrderStatus.DELIVERY_FAILED);
      expect(riderProfile!.availabilityStatus).toBe(RiderAvailabilityStatus.ONLINE); // Freed up
    });
  });
});
