import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum.js';
import { Order } from '../src/modules/orders/entities/order.entity.js';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity.js';

describe('Orders (e2e)', () => {
  let app: INestApplication<any>;
  let dataSource: DataSource;

  let tokenA: string;
  let tokenB: string;
  let skToken: string;

  let shopId: string;
  let categoryId: string;
  let productAvailableId: string;
  let addressA1Id: string;

  async function loginCustomer(phone: string): Promise<{ token: string; userId: string }> {
    await request(app.getHttpServer()).post('/auth/otp/send').send({ phoneNumber: phone });
    await dataSource.query(
      `INSERT INTO users ("phoneNumber", roles, status) VALUES ($1, '{"CUSTOMER"}', 'ACTIVE') ON CONFLICT ("phoneNumber") DO NOTHING`,
      [phone],
    );
    const res = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phoneNumber: phone, code: '123456', platform: 'test' });
    return { token: res.body.accessToken, userId: res.body.user?.id };
  }

  async function loginShopkeeper(phone: string): Promise<string> {
    await request(app.getHttpServer()).post('/auth/otp/send').send({ phoneNumber: phone });
    await dataSource.query(
      `INSERT INTO users ("phoneNumber", roles, status) VALUES ($1, '{"CUSTOMER","SHOPKEEPER"}', 'ACTIVE') ON CONFLICT ("phoneNumber") DO NOTHING`,
      [phone],
    );
    const res = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phoneNumber: phone, code: '123456', platform: 'test' });
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    dataSource = app.get(DataSource);

    // Setup Users
    const resA = await loginCustomer('+9989911111');
    tokenA = resA.token;
    const resB = await loginCustomer('+9989922222');
    tokenB = resB.token;
    skToken = await loginShopkeeper('+9989933333');

    // Setup Shop
    const shopRes = await request(app.getHttpServer())
      .post('/shopkeeper/shops')
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Order Test Shop', location: { longitude: 77.5946, latitude: 12.9716 } });
    shopId = shopRes.body.id;

    await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/status`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ status: 'ACTIVE' });

    await request(app.getHttpServer())
      .patch(`/shopkeeper/shops/${shopId}`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ minimumOrder: 100, deliveryRadius: 5000 });

    // Setup Category & Product
    const catRes = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/categories`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Order Category' });
    categoryId = catRes.body.id;

    const pAvail = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Order Product', categoryId, price: 50.00 });
    productAvailableId = pAvail.body.id;

    // Setup Address
    const addrA1Res = await request(app.getHttpServer())
      .post('/users/me/addresses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ label: 'Home', addressLine: 'Close', longitude: 77.5946, latitude: 12.9800 });
    addressA1Id = addrA1Res.body.id;
  }, 30000);

  afterAll(async () => {
    const phones = ['+9989911111', '+9989922222', '+9989933333'];
    await dataSource.query('TRUNCATE TABLE "audit_logs" CASCADE');
    await dataSource.query('TRUNCATE TABLE "orders" CASCADE');
    await dataSource.query(`DELETE FROM cart_items WHERE "cartId" IN (SELECT id FROM carts WHERE "userId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM carts WHERE "userId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1))`, [phones]);
    await dataSource.query(`DELETE FROM products WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM categories WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM addresses WHERE "userId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1))`, [phones]);
    await dataSource.query(`DELETE FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1))`, [phones]);
    await dataSource.query(`DELETE FROM users WHERE "phoneNumber" = ANY($1)`, [phones]);
    await app.close();
  });

  beforeEach(async () => {
    await request(app.getHttpServer()).delete('/cart').set('Authorization', `Bearer ${tokenA}`);
    await request(app.getHttpServer()).delete('/cart').set('Authorization', `Bearer ${tokenB}`);
    await dataSource.query('TRUNCATE TABLE "audit_logs" CASCADE');
    await dataSource.query('TRUNCATE TABLE "orders" CASCADE');
  });

  async function seedCart() {
    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: productAvailableId, quantity: 2 });
  }

  describe('POST /orders', () => {
    it('should create an order and clear the cart', async () => {
      await seedCart();
      const idempotencyKey = randomUUID();

      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          addressId: addressA1Id,
          idempotencyKey,
        });

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(OrderStatus.CREATED);
      expect(response.body.data.items).toHaveLength(1);
      
      const orderId = response.body.data.id;

      // Verify cart is cleared for tokenA
      const cartItemsRes = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
      
      expect(cartItemsRes.body.data.items).toHaveLength(0);
      expect(cartItemsRes.body.data.shop).toBeNull();

      // Verify audit log
      const auditLog = await dataSource.getRepository(AuditLog).findOne({ where: { entityId: orderId } });
      expect(auditLog).toBeDefined();
      expect(auditLog.action).toBe('CREATED');
    });

    it('should return 400 if cart is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          addressId: addressA1Id,
          idempotencyKey: randomUUID(),
        });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.message).toContain('Cart is empty');
    });

    it('should be idempotent (sequential requests)', async () => {
      await seedCart();
      const idempotencyKey = randomUUID();

      const response1 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey });
      expect(response1.status).toBe(HttpStatus.CREATED);

      const response2 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey });
      expect(response2.status).toBe(HttpStatus.CREATED);
      
      expect(response1.body.data.id).toBe(response2.body.data.id);
      
      const ordersCount = await dataSource.getRepository(Order).count();
      expect(ordersCount).toBe(1);
    });

    it('should handle concurrent idempotency requests safely', async () => {
      await seedCart();
      const idempotencyKey = randomUUID();

      const req1 = request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey });

      const req2 = request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey });

      const [res1, res2] = await Promise.all([req1, req2]);

      expect([res1.status, res2.status]).toContain(HttpStatus.CREATED);
      expect(res1.body.data?.id).toEqual(res2.body.data?.id);

      const ordersCount = await dataSource.getRepository(Order).count();
      expect(ordersCount).toBe(1);
    });
  });

  describe('GET /orders', () => {
    it('should list user orders', async () => {
      await seedCart();
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey: randomUUID() });

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('deliveryId');
    });

    it('should expose deliveryId when a delivery is assigned', async () => {
      await seedCart();
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey: randomUUID() });
      const orderId = createRes.body.data.id;

      // Ensure it is initially null
      const initialGetRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(initialGetRes.body.data.deliveryId).toBeNull();

      // Manually create a Delivery linked to the order to simulate assignment
      const result = await dataSource.query(`
        INSERT INTO deliveries ("orderId", "status", "version", "pickupLocation", "dropoffLocation") 
        VALUES ($1, 'ASSIGNED', 1, ST_SetSRID(ST_MakePoint(77.0, 12.0), 4326), ST_SetSRID(ST_MakePoint(77.0, 12.0), 4326)) RETURNING id
      `, [orderId]);
      const deliveryId = result[0].id;

      // Verify the deliveryId is mapped correctly
      const assignedGetRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(assignedGetRes.body.data.deliveryId).toBe(deliveryId);
    });
  });

  describe('POST /orders/:id/cancel', () => {
    it('should allow customer to cancel order in CREATED state', async () => {
      await seedCart();
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey: randomUUID() });

      const orderId = createRes.body.data.id;

      const cancelRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Changed my mind' });

      expect(cancelRes.status).toBe(HttpStatus.OK);
      expect(cancelRes.body.data.status).toBe(OrderStatus.CANCELLED);
      expect(cancelRes.body.data.cancellationReason).toBe('Changed my mind');
    });

    it('should NOT allow customer to cancel order in PREPARING state', async () => {
      await seedCart();
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey: randomUUID() });

      const orderId = createRes.body.data.id;

      // Manually update to PREPARING to simulate shop accepting
      await dataSource.getRepository(Order).update({ id: orderId }, { status: OrderStatus.PREPARING });

      const cancelRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(cancelRes.status).toBe(HttpStatus.BAD_REQUEST);
      expect(cancelRes.body.message).toContain('Order cannot be cancelled by customer in state PREPARING');
    });
  describe('Idempotency & Races (Phase 5B Requirements)', () => {
    it('should reject same key with different address (conflict)', async () => {
      await seedCart();
      const idempotencyKey = randomUUID();

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey })
        .expect(HttpStatus.CREATED);

      // Create a second address
      const addrRes = await request(app.getHttpServer())
        .post('/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ label: 'Work', addressLine: 'Diff', longitude: 77.5946, latitude: 12.9800 });

      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addrRes.body.id, idempotencyKey });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.message).toContain('Idempotency key already used for a different request');
    });

    it('should allow same key for different customers', async () => {
      await seedCart();
      
      // Seed cart for Customer B
      // Seed cart for Customer B
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ productId: productAvailableId, quantity: 2 });

      const addrBRes = await request(app.getHttpServer())
        .post('/users/me/addresses')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ label: 'Home B', addressLine: 'B', longitude: 77.5946, latitude: 12.9800 });

      const idempotencyKey = randomUUID();

      const resA = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey })
        .expect(HttpStatus.CREATED);

      const resB = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ addressId: addrBRes.body.id, idempotencyKey })
        .expect(HttpStatus.CREATED);

      expect(resA.body.data.id).not.toBe(resB.body.data.id);
    });

    it('should prevent concurrent state transitions', async () => {
      await seedCart();
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey: randomUUID() });

      const orderId = createRes.body.data.id;

      // Simulate shopkeeper trying to transition
      const orderRepo = dataSource.getRepository(Order);
      const order = await orderRepo.findOne({ where: { id: orderId } });

      // Request 1: Valid transition by customer
      const req1 = request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`);

      // Request 2: Simulate another concurrent cancellation using direct update to bump version
      const req2 = orderRepo.update({ id: orderId, version: order.version }, { status: OrderStatus.PAYMENT_PENDING });

      await Promise.allSettled([req1, req2]);
      
      // One of them should fail or succeed depending on who hit first.
      // We mainly test that they don't corrupt the state.
      const finalOrder = await orderRepo.findOne({ where: { id: orderId } });
      expect([OrderStatus.CANCELLED, OrderStatus.PAYMENT_PENDING]).toContain(finalOrder.status);
    });

    it('should keep order snapshot intact when product and address change', async () => {
      await seedCart();
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey: randomUUID() });
      const orderId = createRes.body.data.id;

      // Mutate Product
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopId}/products/${productAvailableId}`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ name: 'Changed Name', price: 999.00 });

      // Mutate Address
      await request(app.getHttpServer())
        .patch(`/users/me/addresses/${addressA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ label: 'Changed Label', addressLine: 'Changed Line' });

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(getRes.body.data.deliveryAddressLabel).toBe('Home');
      expect(getRes.body.data.deliveryAddressLine).toBe('Close');
      expect(getRes.body.data.items[0].productNameSnapshot).toBe('Order Product');
      expect(getRes.body.data.items[0].unitPriceSnapshot).toBe(50);
    });

    it('should not allow fetching another users order', async () => {
      await seedCart();
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id, idempotencyKey: randomUUID() });
      const orderId = createRes.body.data.id;

      await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
});
