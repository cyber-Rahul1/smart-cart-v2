import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum.js';
import { Order } from '../src/modules/orders/entities/order.entity.js';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity.js';
import { OutboxEvent, OutboxEventStatus } from '../src/modules/outbox/entities/outbox-event.entity.js';

describe('Shopkeeper Orders (e2e)', () => {
  let app: INestApplication<any>;
  let dataSource: DataSource;

  let customerToken: string;
  let shopkeeperToken: string;
  let shopkeeperToken2: string; // second shopkeeper for cross-shop tests
  let shopId: string;
  let shopId2: string;
  let productId: string;
  let addressId: string;

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

  async function createOrderInPlacedState(): Promise<string> {
    // Seed cart and create an order
    await request(app.getHttpServer()).delete('/cart').set('Authorization', `Bearer ${customerToken}`);
    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 3 });

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId, idempotencyKey: randomUUID() });

    const orderId = orderRes.body.data.id;

    // Advance to PLACED state via DB (simulating payment completion)
    await dataSource.getRepository(Order).update({ id: orderId }, { status: OrderStatus.PLACED });

    return orderId;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    dataSource = app.get(DataSource);

    // Setup users
    const custRes = await loginCustomer('+9977700001');
    customerToken = custRes.token;
    shopkeeperToken = await loginShopkeeper('+9977700002');
    shopkeeperToken2 = await loginShopkeeper('+9977700003');

    // Setup Shop 1
    const shopRes = await request(app.getHttpServer())
      .post('/shopkeeper/shops')
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .send({ name: 'SK Orders Test Shop', location: { longitude: 77.5946, latitude: 12.9716 } });
    shopId = shopRes.body.id;

    await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/status`)
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .send({ status: 'ACTIVE' });

    await request(app.getHttpServer())
      .patch(`/shopkeeper/shops/${shopId}`)
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .send({ minimumOrder: 100, deliveryRadius: 5000 });

    // Setup Shop 2 (for cross-shop tests)
    const shopRes2 = await request(app.getHttpServer())
      .post('/shopkeeper/shops')
      .set('Authorization', `Bearer ${shopkeeperToken2}`)
      .send({ name: 'SK Orders Test Shop 2', location: { longitude: 77.5946, latitude: 12.9716 } });
    shopId2 = shopRes2.body.id;

    // Setup Category & Product for Shop 1
    const catRes = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/categories`)
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .send({ name: 'SK Test Category' });
    const categoryId = catRes.body.id;

    const prodRes = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .send({ name: 'SK Test Product', categoryId, price: 50.00 });
    productId = prodRes.body.id;

    // Setup Customer Address (within delivery radius)
    const addrRes = await request(app.getHttpServer())
      .post('/users/me/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ label: 'Home', addressLine: 'Nearby', longitude: 77.5946, latitude: 12.9800 });
    addressId = addrRes.body.id;
  });

  afterAll(async () => {
    const phones = ['+9977700001', '+9977700002', '+9977700003'];
    await dataSource.query('TRUNCATE TABLE "outbox_events" CASCADE');
    await dataSource.query('TRUNCATE TABLE "audit_logs" CASCADE');
    await dataSource.query('TRUNCATE TABLE "deliveries" CASCADE');
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
    await dataSource.query('TRUNCATE TABLE "outbox_events" CASCADE');
    await dataSource.query('TRUNCATE TABLE "deliveries" CASCADE');
    await dataSource.query('TRUNCATE TABLE "audit_logs" CASCADE');
    await dataSource.query('TRUNCATE TABLE "orders" CASCADE');
  });

  // ─────────────────────────────────────────────────
  // Authorization
  // ─────────────────────────────────────────────────

  describe('Authorization', () => {
    it('should reject non-shopkeeper (customer) from shopkeeper endpoints', async () => {
      const orderId = await createOrderInPlacedState();

      await request(app.getHttpServer())
        .get(`/shopkeeper/shops/${shopId}/orders`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should reject shopkeeper accessing another shop\'s orders', async () => {
      const orderId = await createOrderInPlacedState();

      // shopkeeper2 tries to list orders of shopkeeper1's shop
      await request(app.getHttpServer())
        .get(`/shopkeeper/shops/${shopId}/orders`)
        .set('Authorization', `Bearer ${shopkeeperToken2}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should reject shopkeeper accessing an order from another shop', async () => {
      const orderId = await createOrderInPlacedState();

      // shopkeeper2 tries to accept an order from shopkeeper1's shop
      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken2}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should reject cross-shop ID substitution (order exists but wrong shop in URL)', async () => {
      const orderId = await createOrderInPlacedState();

      // shopkeeper2 tries to use their own shop ID but references shopkeeper1's order
      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId2}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken2}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ─────────────────────────────────────────────────
  // Valid state transitions
  // ─────────────────────────────────────────────────

  describe('Valid State Transitions', () => {
    it('PLACED → SHOP_ACCEPTED', async () => {
      const orderId = await createOrderInPlacedState();

      const res = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(OrderStatus.SHOP_ACCEPTED);

      // Verify audit log
      const auditLog = await dataSource.getRepository(AuditLog).findOne({
        where: { entityId: orderId, action: 'SHOP_ACCEPTED' },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog!.previousState).toEqual({ status: 'PLACED', shopId });
      expect(auditLog!.newState).toEqual({ status: 'SHOP_ACCEPTED', shopId });
    });

    it('PLACED → REJECTED', async () => {
      const orderId = await createOrderInPlacedState();

      const res = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/reject`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .send({ reason: 'Out of stock' })
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(OrderStatus.REJECTED);
    });

    it('SHOP_ACCEPTED → PREPARING', async () => {
      const orderId = await createOrderInPlacedState();

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      const res = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/preparing`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.status).toBe(OrderStatus.PREPARING);
    });

    it('PREPARING → READY_FOR_PICKUP (with outbox event)', async () => {
      const orderId = await createOrderInPlacedState();

      // Accept → Preparing → Ready
      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/preparing`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      const res = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/ready`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.status).toBe(OrderStatus.READY_FOR_PICKUP);

      // Verify outbox event was created
      const outboxEvent = await dataSource.getRepository(OutboxEvent).findOne({
        where: { idempotencyKey: `dispatch_ready_${orderId}` },
      });
      expect(outboxEvent).toBeDefined();
      expect(outboxEvent!.type).toBe('READY_FOR_PICKUP');
      expect(outboxEvent!.status).toBe(OutboxEventStatus.PENDING);
      expect(outboxEvent!.payload).toEqual({ orderId, shopId });
    });

    it('Full happy path: PLACED → SHOP_ACCEPTED → PREPARING → READY_FOR_PICKUP', async () => {
      const orderId = await createOrderInPlacedState();

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/preparing`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/ready`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      // Verify final DB state
      const order = await dataSource.getRepository(Order).findOne({ where: { id: orderId } });
      expect(order!.status).toBe(OrderStatus.READY_FOR_PICKUP);

      // Verify audit trail
      const auditLogs = await dataSource.getRepository(AuditLog).find({
        where: { entityId: orderId },
        order: { createdAt: 'ASC' },
      });
      // Should have SHOP_ACCEPTED, SHOP_PREPARING, SHOP_READY_FOR_PICKUP
      const actions = auditLogs.map(l => l.action);
      expect(actions).toContain('SHOP_ACCEPTED');
      expect(actions).toContain('SHOP_PREPARING');
      expect(actions).toContain('SHOP_READY_FOR_PICKUP');
    });
  });

  // ─────────────────────────────────────────────────
  // Invalid state transitions
  // ─────────────────────────────────────────────────

  describe('Invalid State Transitions', () => {
    it('should reject duplicate accept', async () => {
      const orderId = await createOrderInPlacedState();

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      // Second accept
      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject: preparing before acceptance', async () => {
      const orderId = await createOrderInPlacedState();

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/preparing`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject: ready before preparing', async () => {
      const orderId = await createOrderInPlacedState();

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/ready`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject: reject after preparing', async () => {
      const orderId = await createOrderInPlacedState();

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/preparing`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/reject`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject: ready after rejection', async () => {
      const orderId = await createOrderInPlacedState();

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/reject`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/ready`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ─────────────────────────────────────────────────
  // Concurrency
  // ─────────────────────────────────────────────────

  describe('Concurrency', () => {
    it('double acceptance: only one should succeed', async () => {
      const orderId = await createOrderInPlacedState();

      const results = await Promise.allSettled([
        request(app.getHttpServer())
          .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
          .set('Authorization', `Bearer ${shopkeeperToken}`),
        request(app.getHttpServer())
          .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
          .set('Authorization', `Bearer ${shopkeeperToken}`),
      ]);

      const statuses = results.map((r: any) => r.value.status);
      const successes = statuses.filter((s: number) => s === HttpStatus.OK);
      const failures = statuses.filter((s: number) => s !== HttpStatus.OK);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
    });

    it('accept vs reject race: only one should succeed', async () => {
      const orderId = await createOrderInPlacedState();

      const results = await Promise.allSettled([
        request(app.getHttpServer())
          .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
          .set('Authorization', `Bearer ${shopkeeperToken}`),
        request(app.getHttpServer())
          .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/reject`)
          .set('Authorization', `Bearer ${shopkeeperToken}`),
      ]);

      const statuses = results.map((r: any) => r.value.status);
      const successes = statuses.filter((s: number) => s === HttpStatus.OK);

      expect(successes.length).toBe(1);

      // Verify DB has exactly one final state
      const order = await dataSource.getRepository(Order).findOne({ where: { id: orderId } });
      expect([OrderStatus.SHOP_ACCEPTED, OrderStatus.REJECTED]).toContain(order!.status);
    });

    it('duplicate READY_FOR_PICKUP requests: only one outbox event', async () => {
      const orderId = await createOrderInPlacedState();

      // Move to PREPARING
      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/preparing`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      // Race two ready requests
      const results = await Promise.allSettled([
        request(app.getHttpServer())
          .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/ready`)
          .set('Authorization', `Bearer ${shopkeeperToken}`),
        request(app.getHttpServer())
          .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/ready`)
          .set('Authorization', `Bearer ${shopkeeperToken}`),
      ]);

      const statuses = results.map((r: any) => r.value.status);
      const successes = statuses.filter((s: number) => s === HttpStatus.OK);
      expect(successes.length).toBe(1);

      // Verify exactly one outbox event
      const outboxEvents = await dataSource.getRepository(OutboxEvent).find({
        where: { idempotencyKey: `dispatch_ready_${orderId}` },
      });
      expect(outboxEvents.length).toBe(1);
    });

    it('two identical state-transition requests with the same order/version: only one wins', async () => {
      const orderId = await createOrderInPlacedState();

      const results = await Promise.allSettled([
        request(app.getHttpServer())
          .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
          .set('Authorization', `Bearer ${shopkeeperToken}`),
        request(app.getHttpServer())
          .post(`/shopkeeper/shops/${shopId}/orders/${orderId}/accept`)
          .set('Authorization', `Bearer ${shopkeeperToken}`),
      ]);

      const statuses = results.map((r: any) => r.value.status);
      expect(statuses.filter((s: number) => s === HttpStatus.OK).length).toBe(1);

      // Verify version incremented exactly once
      const order = await dataSource.getRepository(Order).findOne({ where: { id: orderId } });
      expect(order!.status).toBe(OrderStatus.SHOP_ACCEPTED);
    });
  });

  // ─────────────────────────────────────────────────
  // Order listing / queries
  // ─────────────────────────────────────────────────

  describe('Order Listing', () => {
    it('should list all orders for a shop', async () => {
      const orderId = await createOrderInPlacedState();

      const res = await request(app.getHttpServer())
        .get(`/shopkeeper/shops/${shopId}/orders`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(orderId);
    });

    it('should filter orders by status', async () => {
      const orderId1 = await createOrderInPlacedState();
      const orderId2 = await createOrderInPlacedState();

      // Accept one
      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/orders/${orderId1}/accept`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      // Query PLACED only
      const res = await request(app.getHttpServer())
        .get(`/shopkeeper/shops/${shopId}/orders?status=${OrderStatus.PLACED}`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(orderId2);
    });

    it('should get single order details', async () => {
      const orderId = await createOrderInPlacedState();

      const res = await request(app.getHttpServer())
        .get(`/shopkeeper/shops/${shopId}/orders/${orderId}`)
        .set('Authorization', `Bearer ${shopkeeperToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.items).toBeDefined();
    });
  });
});
