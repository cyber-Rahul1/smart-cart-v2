import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum.js';
import { ShopStatus } from '../src/modules/shops/enums/shop-status.enum.js';
import { ProductStatus } from '../src/modules/products/enums/product-status.enum.js';
import { PaymentStatus } from '../src/modules/payments/enums/payment-status.enum.js';

process.env.JWT_SECRET = 'test-secret';
process.env.RAZORPAY_KEY_ID = 'test-key';
process.env.RAZORPAY_KEY_SECRET = 'test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';

describe('Phase 9 Features (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  
  let customerToken: string;
  let customerId: string;
  let shopId: string;
  let productId1: string;
  let productId2: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);

    customerId = '99999999-9999-9999-9999-999999999991';
    customerToken = jwtService.sign({ sub: customerId, roles: ['CUSTOMER'] }, { secret: process.env.JWT_SECRET || 'test-secret' });

    // Seed mock data
    await dataSource.query(`
      INSERT INTO users (id, "phoneNumber", status, roles)
      VALUES ($1, '+1000000009', 'ACTIVE', '{"CUSTOMER"}')
      ON CONFLICT DO NOTHING
    `, [customerId]);

    shopId = '99999999-9999-9999-9999-999999999992';
    await dataSource.query(`
      INSERT INTO shops (id, name, "ownerId", location, status, "deliveryRadius", "minimumOrder")
      VALUES ($1, 'Test Shop', $2, ST_SetSRID(ST_MakePoint(77.1025, 28.7041), 4326), '${ShopStatus.ACTIVE}', 5000, 50)
      ON CONFLICT DO NOTHING
    `, [shopId, customerId]);

    const categoryId = '99999999-9999-9999-9999-999999999995';
    await dataSource.query(`
      INSERT INTO categories (id, "shopId", name)
      VALUES ($1, $2, 'Test Category')
      ON CONFLICT DO NOTHING
    `, [categoryId, shopId]);

    productId1 = '99999999-9999-9999-9999-999999999993';
    productId2 = '99999999-9999-9999-9999-999999999994';
    await dataSource.query(`
      INSERT INTO products (id, "shopId", "categoryId", name, price, status, version)
      VALUES 
        ($1, $3, $4, 'Apple', 10.0, '${ProductStatus.AVAILABLE}', 1),
        ($2, $3, $4, 'Banana', 5.0, '${ProductStatus.AVAILABLE}', 1)
      ON CONFLICT DO NOTHING
    `, [productId1, productId2, shopId, categoryId]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Search & Discovery', () => {
    it('should search products with pagination', async () => {
      // 1st page
      const res1 = await request(app.getHttpServer())
        .get('/search/products?lat=28.7041&lng=77.1025&limit=1')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res1.body.data.length).toBe(1);
      expect(res1.body.nextCursor).toBeDefined();

      // 2nd page
      const res2 = await request(app.getHttpServer())
        .get(`/search/products?lat=28.7041&lng=77.1025&limit=1&cursor=${res1.body.nextCursor}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res2.body.data.length).toBe(1);
      expect(res2.body.data[0].productId).not.toBe(res1.body.data[0].productId);
    });

    it('should search shops', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/shops?lat=28.7041&lng=77.1025&limit=10')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const shop = res.body.data.find(s => s.shopId === shopId);
      expect(shop).toBeDefined();
    });
  });

  describe('Notifications', () => {
    it('should get notifications list', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers/notifications')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
