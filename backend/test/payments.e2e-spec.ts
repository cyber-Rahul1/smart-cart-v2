import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { PaymentMethod } from '../src/modules/payments/enums/payment-method.enum.js';
import { PaymentStatus } from '../src/modules/payments/enums/payment-status.enum.js';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum.js';
import { RazorpayProvider } from '../src/modules/payments/providers/razorpay.provider.js';

describe('PaymentsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  let customerToken: string;
  let otherCustomerToken: string;
  let customerId: string;
  let otherCustomerId: string;

  beforeAll(async () => {
    const mockRazorpayProvider = {
      createPaymentSession: vi.fn().mockImplementation(() => Promise.resolve({
        providerOrderId: 'order_test_' + Math.random().toString(36).substring(7),
        amountInMinorUnits: 10050,
        currency: 'INR',
      })),
      getPaymentStatus: vi.fn().mockResolvedValue(PaymentStatus.PENDING),
      refundPayment: vi.fn().mockResolvedValue({
        providerRefundId: 'rfnd_test_123',
        status: PaymentStatus.REFUNDED,
      }),
      verifyWebhook: vi.fn().mockReturnValue(true),
      parseWebhookEvent: vi.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RazorpayProvider)
      .useValue(mockRazorpayProvider)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);

    // Setup test users
    customerId = '00000000-0000-0000-0000-000000000001';
    otherCustomerId = '00000000-0000-0000-0000-000000000002';
    
    // Insert mock users if not exists (assume seeded or use raw query)
    await dataSource.query(`
      INSERT INTO users (id, "phoneNumber", status, roles)
      VALUES ($1, '+919999999991', 'ACTIVE', '{CUSTOMER}')
      ON CONFLICT DO NOTHING
    `, [customerId]);

    await dataSource.query(`
      INSERT INTO users (id, "phoneNumber", status, roles)
      VALUES ($1, '+919999999992', 'ACTIVE', '{CUSTOMER}')
      ON CONFLICT DO NOTHING
    `, [otherCustomerId]);

    // Insert mock shop if not exists
    await dataSource.query(`
      INSERT INTO shops (id, name, "ownerId", location)
      VALUES ('00000000-0000-0000-0000-000000000000', 'Test Shop', $1, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326))
      ON CONFLICT DO NOTHING
    `, [otherCustomerId]);

    const jwtSecret = process.env.JWT_SECRET || 'test-secret';
    customerToken = jwtService.sign({ sub: customerId, roles: ['CUSTOMER'] }, { secret: jwtSecret });
    otherCustomerToken = jwtService.sign({ sub: otherCustomerId, roles: ['CUSTOMER'] }, { secret: jwtSecret });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orders/:id/payment', () => {
    let orderId: string;

    beforeEach(async () => {
      // Create a fresh order for each test
      const res = await dataSource.query(`
        INSERT INTO orders ("customerId", "shopId", "subtotal", "totalAmount", "status", "deliveryFee", "deliveryAddressLabel", "deliveryAddressLine", "deliveryLocation", "version")
        VALUES ($1, '00000000-0000-0000-0000-000000000000', 100.50, 100.50, 'CREATED', 0, 'Home', '123 Test St', ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326), 1)
        RETURNING id
      `, [customerId]);
      orderId = res[0].id;
    });

    it('should initiate online payment and create a payment attempt', async () => {
      const response = await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', 'idem-key-1')
        .send({ paymentMethod: PaymentMethod.ONLINE })
        .expect(201);

      expect(response.body).toHaveProperty('paymentId');
      expect(response.body.status).toBe(PaymentStatus.PENDING);
      
      const order = await dataSource.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order[0].status).toBe(OrderStatus.PAYMENT_PENDING);
    });

    it('should prevent initiating payment for another user\'s order', async () => {
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .set('x-idempotency-key', 'idem-key-2')
        .send({ paymentMethod: PaymentMethod.ONLINE })
        .expect(404); // returns 404 to not leak order existence
    });

    it('should be idempotent for same request', async () => {
      const key = 'idem-key-3';
      
      const res1 = await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', key)
        .send({ paymentMethod: PaymentMethod.ONLINE })
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', key)
        .send({ paymentMethod: PaymentMethod.ONLINE })
        .expect(201); // should return 201 with same data

      expect(res1.body.paymentId).toEqual(res2.body.paymentId);
    });

    it('should return 409 conflict if idempotency key reused for different request payload', async () => {
      const key = 'idem-key-4';
      
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', key)
        .send({ paymentMethod: PaymentMethod.ONLINE })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', key)
        .send({ paymentMethod: PaymentMethod.COD })
        .expect(409); // Conflict
    });

    it('should reject payment if order already has a successful payment', async () => {
      // Mark as captured manually
      await dataSource.query(`
        INSERT INTO payments ("orderId", "amount", "provider", "status", "paymentMethod", "idempotencyKey", "requestPayloadHash", "version")
        VALUES ($1, 100.50, 'RAZORPAY', 'CAPTURED', 'ONLINE', 'some-key-captured', 'some-hash', 1)
      `, [orderId]);

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', 'idem-key-5')
        .send({ paymentMethod: PaymentMethod.ONLINE })
        .expect(409);
    });

    it('should allow retry on failed attempt with new key', async () => {
      await dataSource.query(`
        INSERT INTO payments ("orderId", "amount", "provider", "status", "paymentMethod", "idempotencyKey", "requestPayloadHash", "version")
        VALUES ($1, 100.50, 'RAZORPAY', 'FAILED', 'ONLINE', 'old-failed-key', 'some-hash', 1)
      `, [orderId]);

      const response = await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', 'new-retry-key')
        .send({ paymentMethod: PaymentMethod.ONLINE })
        .expect(201);
      
      expect(response.body).toHaveProperty('paymentId');
      expect(response.body.status).toBe(PaymentStatus.PENDING);
    });

    it('should immediately transition to PLACED for COD', async () => {
      const response = await request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('x-idempotency-key', 'idem-key-cod-1')
        .send({ paymentMethod: PaymentMethod.COD })
        .expect(201);

      expect(response.body.status).toBe(PaymentStatus.PENDING);
      
      const order = await dataSource.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order[0].status).toBe(OrderStatus.PLACED);
    });
  });

  describe('POST /webhooks/razorpay', () => {
    let orderId: string;
    let providerOrderId: string;
    const testSecret = 'test_webhook_secret';

    beforeAll(() => {
      // Re-mock verifyWebhook and parseWebhookEvent to behave realistically for the webhook tests
      const mockRazorpayProvider: any = app.get(RazorpayProvider);
      
      mockRazorpayProvider.verifyWebhook.mockImplementation((signature: string, rawBody: Buffer) => {
        const crypto = require('crypto');
        const expectedSignature = crypto
          .createHmac('sha256', testSecret)
          .update(rawBody.toString('utf8'))
          .digest('hex');
        return expectedSignature === signature;
      });

      mockRazorpayProvider.parseWebhookEvent.mockImplementation((payload: any) => {
        if (!payload || !payload.event) {
          const { BadRequestException } = require('@nestjs/common');
          throw new BadRequestException('Invalid webhook payload format');
        }
        
        const eventName = payload.event;
        let providerOrderId = '';
        let providerPaymentId = '';

        if (payload.payload?.payment?.entity) {
          providerPaymentId = payload.payload.payment.entity.id;
          providerOrderId = payload.payload.payment.entity.order_id;
        }
        if (payload.payload?.order?.entity) {
          providerOrderId = payload.payload.order.entity.id;
        }

        if (!providerOrderId) {
          const { BadRequestException } = require('@nestjs/common');
          throw new BadRequestException('Could not extract providerOrderId from webhook payload');
        }

        let status = PaymentStatus.PENDING;
        if (eventName === 'payment.captured' || eventName === 'order.paid') status = PaymentStatus.CAPTURED;
        else if (eventName === 'payment.failed') status = PaymentStatus.FAILED;

        return {
          providerEventId: '',
          providerOrderId,
          providerPaymentId,
          eventName,
          status,
        };
      });
    });

    beforeEach(async () => {
      // Create a fresh order and pending payment for webhook tests
      const orderRes = await dataSource.query(`
        INSERT INTO orders ("customerId", "shopId", "subtotal", "totalAmount", "status", "deliveryFee", "deliveryAddressLabel", "deliveryAddressLine", "deliveryLocation", "version")
        VALUES ($1, '00000000-0000-0000-0000-000000000000', 100.50, 100.50, 'PAYMENT_PENDING', 0, 'Home', '123 Test St', ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326), 1)
        RETURNING id
      `, [customerId]);
      orderId = orderRes[0].id;

      providerOrderId = 'order_hook_' + Math.random().toString(36).substring(7);

      await dataSource.query(`
        INSERT INTO payments ("orderId", "amount", "provider", "providerOrderId", "status", "paymentMethod", "idempotencyKey", "requestPayloadHash", "version")
        VALUES ($1, 100.50, 'RAZORPAY', $2, 'PENDING', 'ONLINE', 'hook-idem-1', 'hash-1', 1)
      `, [orderId, providerOrderId]);
    });

    const generateSignature = (payloadStr: string) => {
      const crypto = require('crypto');
      return crypto.createHmac('sha256', testSecret).update(payloadStr).digest('hex');
    };

    it('should accept valid raw body + valid Razorpay signature', async () => {
      const payId = 'pay_acc_' + Math.random().toString(36).substring(7);
      const evId = 'ev_1_' + Math.random().toString(36).substring(7);
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: { id: payId, order_id: providerOrderId }
          }
        }
      };
      const payloadStr = JSON.stringify(payload);
      const signature = generateSignature(payloadStr);

      await request(app.getHttpServer())
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', evId)
        .send(payload)
        .expect(201);

      const payment = await dataSource.query(`SELECT status FROM payments WHERE "providerOrderId" = $1`, [providerOrderId]);
      expect(payment[0].status).toBe(PaymentStatus.CAPTURED);
      
      const order = await dataSource.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order[0].status).toBe(OrderStatus.PLACED);
    });

    it('should reject same payload with one byte modified', async () => {
      const payId = 'pay_mod_' + Math.random().toString(36).substring(7);
      const evId = 'ev_2_' + Math.random().toString(36).substring(7);
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: { id: payId, order_id: providerOrderId }
          }
        }
      };
      const validPayloadStr = JSON.stringify(payload);
      const signature = generateSignature(validPayloadStr);

      const modifiedPayload = { ...payload, event: 'payment.failed' };

      await request(app.getHttpServer())
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', evId)
        .send(modifiedPayload)
        .expect(400);
    });

    it('should reject invalid signature', async () => {
      const payId = 'pay_inv_' + Math.random().toString(36).substring(7);
      const evId = 'ev_3_' + Math.random().toString(36).substring(7);
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: { id: payId, order_id: providerOrderId }
          }
        }
      };

      await request(app.getHttpServer())
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', 'invalid_signature')
        .set('x-razorpay-event-id', evId)
        .send(payload)
        .expect(400);
    });

    it('should reject missing signature', async () => {
      const evId = 'ev_4_' + Math.random().toString(36).substring(7);
      await request(app.getHttpServer())
        .post('/webhooks/razorpay')
        .set('x-razorpay-event-id', evId)
        .send({ event: 'payment.captured' })
        .expect(400);
    });

    it('should be idempotent for same webhook event twice', async () => {
      const payId = 'pay_dup_' + Math.random().toString(36).substring(7);
      const evId = 'ev_dup_' + Math.random().toString(36).substring(7);
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: { id: payId, order_id: providerOrderId }
          }
        }
      };
      const payloadStr = JSON.stringify(payload);
      const signature = generateSignature(payloadStr);

      await request(app.getHttpServer())
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', evId)
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', evId)
        .send(payload)
        .expect(201);

      const events = await dataSource.query(`SELECT COUNT(*) as count FROM webhook_events WHERE "eventId" = $1`, [evId]);
      expect(events[0].count).toBe("1");
    });

    it('should handle out of order webhooks gracefully', async () => {
      const payId = 'pay_ooo_' + Math.random().toString(36).substring(7);
      const evId1 = 'ev_ooo1_' + Math.random().toString(36).substring(7);
      const evId2 = 'ev_ooo2_' + Math.random().toString(36).substring(7);
      
      const payloadCaptured = {
        event: 'payment.captured',
        payload: { payment: { entity: { id: payId, order_id: providerOrderId } } }
      };
      const signatureCaptured = generateSignature(JSON.stringify(payloadCaptured));

      await request(app.getHttpServer())
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', signatureCaptured)
        .set('x-razorpay-event-id', evId1)
        .send(payloadCaptured)
        .expect(201);

      const payloadFailed = {
        event: 'payment.failed',
        payload: { payment: { entity: { id: payId, order_id: providerOrderId } } }
      };
      const signatureFailed = generateSignature(JSON.stringify(payloadFailed));

      await request(app.getHttpServer())
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', signatureFailed)
        .set('x-razorpay-event-id', evId2)
        .send(payloadFailed)
        .expect(201);

      const payment = await dataSource.query(`SELECT status FROM payments WHERE "providerOrderId" = $1`, [providerOrderId]);
      expect(payment[0].status).toBe(PaymentStatus.CAPTURED);
      
      const order = await dataSource.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(order[0].status).toBe(OrderStatus.PLACED);
    });
  });
});
