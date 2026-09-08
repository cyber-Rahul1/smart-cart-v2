import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';

describe('Checkout (e2e)', () => {
  let app: INestApplication<any>;
  let dataSource: DataSource;

  // Tokens
  let tokenA: string;
  let tokenB: string;
  let skToken: string;

  // IDs
  let shopId: string;
  let categoryId: string;
  let productAvailableId: string;
  let productOosId: string;
  let addressA1Id: string; // Inside radius
  let addressA2Id: string; // Outside radius
  let addressBId: string;

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

    // 1. Setup Users
    const resA = await loginCustomer('+9989911111');
    tokenA = resA.token;
    const resB = await loginCustomer('+9989922222');
    tokenB = resB.token;
    skToken = await loginShopkeeper('+9989933333');

    // 2. Setup Shop
    const shopRes = await request(app.getHttpServer())
      .post('/shopkeeper/shops')
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Checkout Test Shop', location: { longitude: 77.5946, latitude: 12.9716 } }); // Bangalore
    shopId = shopRes.body.id;

    await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/status`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ status: 'ACTIVE' });

    await request(app.getHttpServer())
      .patch(`/shopkeeper/shops/${shopId}`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ minimumOrder: 100, deliveryRadius: 5000 }); // 5km radius

    // 3. Setup Categories & Products
    const catRes = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/categories`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Checkout Category' });
    categoryId = catRes.body.id;

    const pAvail = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Checkout Available Product', categoryId, price: 50.00 });
    productAvailableId = pAvail.body.id;

    const pOos = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Checkout OOS Product', categoryId, price: 30.00 });
    productOosId = pOos.body.id;
    await request(app.getHttpServer())
      .patch(`/shopkeeper/shops/${shopId}/products/${productOosId}/status`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ status: 'OUT_OF_STOCK' });

    // 4. Setup Addresses
    // Customer A - Address 1 (Inside radius ~ 2km)
    const addrA1Res = await request(app.getHttpServer())
      .post('/users/me/addresses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ label: 'Home', addressLine: 'Close', longitude: 77.5946, latitude: 12.9800 });
    addressA1Id = addrA1Res.body.id;

    // Customer A - Address 2 (Outside radius ~ 10km+)
    const addrA2Res = await request(app.getHttpServer())
      .post('/users/me/addresses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ label: 'Work', addressLine: 'Far', longitude: 77.6500, latitude: 12.9000 });
    addressA2Id = addrA2Res.body.id;

    // Customer B - Address
    const addrBRes = await request(app.getHttpServer())
      .post('/users/me/addresses')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ label: 'Home', addressLine: 'B Home', longitude: 77.5946, latitude: 12.9716 });
    addressBId = addrBRes.body.id;
  });

  afterAll(async () => {
    const phones = ['+9989911111', '+9989922222', '+9989933333'];
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
    // Clear carts before each test
    await request(app.getHttpServer()).delete('/cart').set('Authorization', `Bearer ${tokenA}`);
    await request(app.getHttpServer()).delete('/cart').set('Authorization', `Bearer ${tokenB}`);
  });

  describe('Validation & Edge Cases', () => {
    it('should reject checkout if cart is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id });
      
      expect(res.body.validationErrors).toBeDefined();
      expect(res.body.validationErrors[0].code).toBe('CART_EMPTY');
    });

    it('should reject checkout if address does not exist', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 });

      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .post('/checkout/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: fakeId })
        .expect(404);
    });

    it('should reject checkout if address belongs to another user (IDOR)', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 });

      await request(app.getHttpServer())
        .post('/checkout/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressBId })
        .expect(400); // Bad Request (Address does not belong)
    });
  });

  describe('Business Rules', () => {
    it('should calculate correct distance and reject if outside delivery radius', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 3 });

      const res = await request(app.getHttpServer())
        .post('/checkout/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA2Id }) // Outside radius
        .expect(200);

      expect(res.body.deliveryEligible).toBe(false);
      expect(res.body.address.distanceMeters).toBeGreaterThan(5000);
      expect(res.body.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'OUTSIDE_DELIVERY_RADIUS' })
        ])
      );
    });

    it('should reject if minimum order is not met', async () => {
      // 1 qty = 50, min order is 100
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 });

      const res = await request(app.getHttpServer())
        .post('/checkout/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id })
        .expect(200);

      expect(res.body.minimumOrderSatisfied).toBe(false);
      expect(res.body.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MINIMUM_ORDER_NOT_MET' })
        ])
      );
    });

    it('should return a successful quote when all conditions are met', async () => {
      // 2 qty = 100, min order is 100
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 2 });

      const res = await request(app.getHttpServer())
        .post('/checkout/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id })
        .expect(200);

      expect(res.body.quoteId).toBeDefined();
      expect(res.body.subtotal).toBe(100);
      expect(res.body.minimumOrderSatisfied).toBe(true);
      expect(res.body.deliveryEligible).toBe(true);
      expect(res.body.address.distanceMeters).toBeLessThan(5000);
      expect(res.body.validationErrors).toBeUndefined();
    });

    it('should flag unavailable products in validation errors', async () => {
      // Create product, add to cart, then mark out of stock
      const tempProd = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${shopId}/products`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ name: 'Temp Prod', categoryId, price: 150.00 });
      
      const tempProdId = tempProd.body.id;

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: tempProdId, quantity: 1 });

      // Mark out of stock
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopId}/products/${tempProdId}/status`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ status: 'OUT_OF_STOCK' });

      const res = await request(app.getHttpServer())
        .post('/checkout/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ addressId: addressA1Id })
        .expect(200);

      expect(res.body.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'PRODUCT_UNAVAILABLE' })
        ])
      );
    });
  });
});
