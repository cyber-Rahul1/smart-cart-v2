import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';

describe('Shopkeeper Products & Categories (e2e)', () => {
  let app: INestApplication<any>;
  let dataSource: DataSource;
  let accessTokenA: string;
  let accessTokenB: string;
  let shopIdA: string;
  let shopIdB: string;
  let categoryIdA: string;
  let productIdA: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    // Setup Shopkeeper A
    await request(app.getHttpServer()).post('/auth/otp/send').send({ phoneNumber: '+9922222222' });
    await dataSource.query(`INSERT INTO users ("phoneNumber", roles, status) VALUES ('+9922222222', '{"CUSTOMER", "SHOPKEEPER"}', 'ACTIVE')`);
    const resA = await request(app.getHttpServer()).post('/auth/otp/verify').send({ phoneNumber: '+9922222222', code: '123456', platform: 'test' });
    accessTokenA = resA.body.accessToken;

    // Setup Shopkeeper B
    await request(app.getHttpServer()).post('/auth/otp/send').send({ phoneNumber: '+9933333333' });
    await dataSource.query(`INSERT INTO users ("phoneNumber", roles, status) VALUES ('+9933333333', '{"CUSTOMER", "SHOPKEEPER"}', 'ACTIVE')`);
    const resB = await request(app.getHttpServer()).post('/auth/otp/verify').send({ phoneNumber: '+9933333333', code: '123456', platform: 'test' });
    accessTokenB = resB.body.accessToken;

    // Create Shop A
    const shopARes = await request(app.getHttpServer()).post('/shopkeeper/shops').set('Authorization', `Bearer ${accessTokenA}`).send({ name: 'Shop A', location: { longitude: 1, latitude: 1 } });
    shopIdA = shopARes.body.id;

    // Create Shop B
    const shopBRes = await request(app.getHttpServer()).post('/shopkeeper/shops').set('Authorization', `Bearer ${accessTokenB}`).send({ name: 'Shop B', location: { longitude: 2, latitude: 2 } });
    shopIdB = shopBRes.body.id;
  });

  afterAll(async () => {
    const phones = ['+9922222222', '+9933333333'];
    await dataSource.query(`DELETE FROM products WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM categories WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM shop_hours WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1))`, [phones]);
    await dataSource.query(`DELETE FROM users WHERE "phoneNumber" = ANY($1)`, [phones]);
    await app.close();
  });

  describe('Categories', () => {
    it('POST /shopkeeper/shops/:shopId/categories should create a category', async () => {
      const res = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopIdA}/categories`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Beverages' })
        .expect(201);
      categoryIdA = res.body.id;
    });

    it('PATCH /shopkeeper/shops/:shopId/categories/:categoryId should prevent cross-shop category modification', async () => {
      // B tries to modify A's category by substituting shopIdA
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopIdA}/categories/${categoryIdA}`)
        .set('Authorization', `Bearer ${accessTokenB}`) // B's token
        .send({ name: 'Hacked' })
        .expect(403); // OwnershipGuard fails because B doesn't own Shop A
    });

    it('PATCH /shopkeeper/shops/:shopId/categories/:categoryId should prevent cross-shop category modification (case 2)', async () => {
      // A tries to modify B's category (pretending it's in A's shop)
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopIdA}/categories/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Hacked' })
        .expect(404); // Not found for this shop
    });
  });

  describe('Products', () => {
    it('POST /shopkeeper/shops/:shopId/products should create a product', async () => {
      const res = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopIdA}/products`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Cola', categoryId: categoryIdA, price: 2.50 })
        .expect(201);
      productIdA = res.body.id;
    });

    it('POST /shopkeeper/shops/:shopId/products should prevent cross-shop category assignment', async () => {
      // A tries to create a product in Shop A, but using a Category belonging to Shop B
      // First, create a category in Shop B
      const catBRes = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopIdB}/categories`)
        .set('Authorization', `Bearer ${accessTokenB}`)
        .send({ name: 'Snacks' });
      const categoryIdB = catBRes.body.id;

      await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopIdA}/products`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Stolen Snack', categoryId: categoryIdB, price: 1 })
        .expect(403); // Category does not exist in this shop
    });

    it('PATCH /shopkeeper/shops/:shopId/products/:productId should prevent cross-shop modification', async () => {
      // B tries to modify A's product using their own shopId (B owns shop B)
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopIdB}/products/${productIdA}`)
        .set('Authorization', `Bearer ${accessTokenB}`)
        .send({ price: 0 })
        .expect(404); // Product not found in shop B
    });
  });
});
