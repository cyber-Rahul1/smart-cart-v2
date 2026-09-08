import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';

describe('Shopkeeper Shops (e2e)', () => {
  let app: INestApplication<any>;
  let dataSource: DataSource;
  let accessToken: string;
  let shopId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    dataSource = app.get(DataSource);

    // Setup shopkeeper user
    const phone = '+9911111111';
    await request(app.getHttpServer()).post('/auth/otp/send').send({ phoneNumber: phone });
    
    // Insert user with SHOPKEEPER role so verify uses it
    await dataSource.query(`INSERT INTO users ("phoneNumber", roles, status) VALUES ($1, '{"CUSTOMER", "SHOPKEEPER"}', 'ACTIVE')`, [phone]);
    
    const authRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phoneNumber: phone, code: '123456', platform: 'test-device' });
    accessToken = authRes.body.accessToken;
  });

  afterAll(async () => {
    const phone = '+9911111111';
    await dataSource.query(`DELETE FROM products WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = $1))`, [phone]);
    await dataSource.query(`DELETE FROM categories WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = $1))`, [phone]);
    await dataSource.query(`DELETE FROM shop_hours WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = $1))`, [phone]);
    await dataSource.query(`DELETE FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = $1)`, [phone]);
    await dataSource.query(`DELETE FROM users WHERE "phoneNumber" = $1`, [phone]);
    await app.close();
  });

  it('POST /shopkeeper/shops should create a shop and ignore client ownerId', async () => {
    const response = await request(app.getHttpServer())
      .post('/shopkeeper/shops')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'My E2E Shop',
        description: 'Test shop description',
        location: { longitude: 77.5946, latitude: 12.9716 },
        ownerId: '99999999-9999-9999-9999-999999999999', // Malicious ownerId
      })
      .expect(201);
      
    expect(response.body).toHaveProperty('id');
    expect(response.body.ownerId).not.toBe('99999999-9999-9999-9999-999999999999'); // Should be overridden
    shopId = response.body.id;
  });

  it('GET /shopkeeper/shops/mine should return shops', async () => {
    const response = await request(app.getHttpServer())
      .get('/shopkeeper/shops/mine')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
      
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0].id).toBe(shopId);
  });

  it('PATCH /shopkeeper/shops/:shopId should update shop details', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/shopkeeper/shops/${shopId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Updated E2E Shop',
        deliveryRadius: 3000,
      })
      .expect(200);
      
    expect(response.body.name).toBe('Updated E2E Shop');
    expect(response.body.deliveryRadius).toBe(3000);
  });

  it('POST /shopkeeper/shops/:shopId/status should update operational status', async () => {
    const response = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'ACTIVE',
      })
      .expect(201);
      
    expect(response.body.status).toBe('ACTIVE');
  });

  it('PUT /shopkeeper/shops/:shopId/hours should update operating hours', async () => {
    const response = await request(app.getHttpServer())
      .put(`/shopkeeper/shops/${shopId}/hours`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        hours: [
          { dayOfWeek: 1, openTime: '09:00:00', closeTime: '17:00:00', isClosed: false },
          { dayOfWeek: 2, openTime: '09:00:00', closeTime: '17:00:00', isClosed: false },
        ]
      })
      .expect(200);
      
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(2);
    expect(response.body[0].dayOfWeek).toBe(1);
    expect(response.body[0].openTime).toBe('09:00:00');
  });
});
