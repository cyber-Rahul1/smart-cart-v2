import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';

describe('Customer Shops Discovery (e2e)', () => {
  let app: INestApplication<any>;
  let dataSource: DataSource;
  let shopId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    // Create a shop directly in DB for discovery
    const ownerRes = await dataSource.query(`INSERT INTO users ("phoneNumber", roles) VALUES ('+9944444444', '{"SHOPKEEPER"}') RETURNING id`);
    const ownerId = ownerRes[0].id;

    const shopRes = await dataSource.query(`
      INSERT INTO shops (name, "ownerId", location, "deliveryRadius", status)
      VALUES ('Nearby Shop', $1, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 5000, 'ACTIVE')
      RETURNING id
    `, [ownerId]);
    shopId = shopRes[0].id;

    // Create a discontinued product
    const catRes = await dataSource.query(`INSERT INTO categories (name, "shopId") VALUES ('Cat 1', $1) RETURNING id`, [shopId]);
    await dataSource.query(`
      INSERT INTO products (name, price, "categoryId", "shopId", status, version)
      VALUES 
        ('Active Product', 10, $1, $2, 'AVAILABLE', 1),
        ('Hidden Product', 5, $1, $2, 'DISCONTINUED', 1)
    `, [catRes[0].id, shopId]);
  });

  afterAll(async () => {
    const phone = '+9944444444';
    await dataSource.query(`DELETE FROM products WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = $1))`, [phone]);
    await dataSource.query(`DELETE FROM categories WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = $1))`, [phone]);
    await dataSource.query(`DELETE FROM shop_hours WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = $1))`, [phone]);
    await dataSource.query(`DELETE FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = $1)`, [phone]);
    await dataSource.query(`DELETE FROM users WHERE "phoneNumber" = $1`, [phone]);
    await app.close();
  });

  it('GET /shops should discover nearby shops within delivery radius', async () => {
    const res = await request(app.getHttpServer())
      .get('/shops')
      .query({ lat: 12.9716, lng: 77.5946, radius: 2000 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.find((s: any) => s.id === shopId)).toBeDefined();
  });

  it('GET /shops should NOT discover shops outside delivery radius', async () => {
    // 500km away
    const res = await request(app.getHttpServer())
      .get('/shops')
      .query({ lat: 15.0, lng: 77.0, radius: 1000000 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.find((s: any) => s.id === shopId)).toBeUndefined();
  });

  it('GET /shops/:shopId/products should hide DISCONTINUED products', async () => {
    const res = await request(app.getHttpServer())
      .get(`/shops/${shopId}/products`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const products = res.body.data;
    expect(products.length).toBeGreaterThanOrEqual(1);
    expect(products.find((p: any) => p.name === 'Active Product')).toBeDefined();
    expect(products.find((p: any) => p.name === 'Hidden Product')).toBeUndefined();
  });
});
