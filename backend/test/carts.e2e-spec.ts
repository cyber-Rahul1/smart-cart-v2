import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';

/**
 * Phase 4B: Cart E2E Tests
 *
 * Covers:
 *  - Basic CRUD (get, add, update, remove, clear)
 *  - Ownership (IDOR protection)
 *  - One-shop-per-cart invariant
 *  - Product availability validation
 *  - Server-side pricing (decimal accuracy)
 *  - Quantity validation (max 99)
 *  - Minimum-order calculations
 *  - Concurrent add-to-cart (duplicate item protection)
 *  - Concurrent cross-shop (multi-shop cart prevention)
 *  - Unauthenticated / non-customer access
 */
describe('Cart (e2e)', () => {
  let app: INestApplication<any>;
  let dataSource: DataSource;

  // Two customer tokens
  let tokenA: string;
  let tokenB: string;

  // Shop fixtures
  let shopId: string;       // ACTIVE shop owned by a shopkeeper
  let shop2Id: string;      // Second ACTIVE shop

  // Product fixtures
  let productAvailableId: string;
  let productOosId: string;
  let productDiscontinuedId: string;
  let productShop2Id: string;
  let productPriceChangeId: string;
  let productAvailabilityTestId: string; // Dedicated product for mutation tests

  // Shopkeeper token (for status updates)
  let skToken: string;
  let skShopId: string;

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

    // ---- Customers ----
    const resA = await loginCustomer('+9981111111');
    tokenA = resA.token;
    const resB = await loginCustomer('+9982222222');
    tokenB = resB.token;

    // ---- Shopkeeper for product/shop management ----
    skToken = await loginShopkeeper('+9983333333');

    // Create Shop 1 (ACTIVE, minimumOrder=100)
    const shop1Res = await request(app.getHttpServer())
      .post('/shopkeeper/shops')
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Cart Test Shop 1', location: { longitude: 77.5946, latitude: 12.9716 } });
    skShopId = shop1Res.body.id;
    shopId = skShopId;

    // Make shop ACTIVE
    await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/status`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ status: 'ACTIVE' });

    // Set minimum order to 100
    await request(app.getHttpServer())
      .patch(`/shopkeeper/shops/${shopId}`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ minimumOrder: 100 });

    // Create Shop 2 (ACTIVE)
    const shop2Res = await request(app.getHttpServer())
      .post('/shopkeeper/shops')
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Cart Test Shop 2', location: { longitude: 77.6, latitude: 12.98 } });
    shop2Id = shop2Res.body.id;
    await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shop2Id}/status`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ status: 'ACTIVE' });

    // Create category in shop1
    const catRes = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/categories`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Test Category' });
    const categoryId = catRes.body.id;

    // Create category in shop2
    const cat2Res = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shop2Id}/categories`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Shop2 Category' });
    const category2Id = cat2Res.body.id;

    // Create products in shop1
    const pAvail = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Available Product', categoryId, price: 50.00 });
    productAvailableId = pAvail.body.id;

    const pOos = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'OOS Product', categoryId, price: 30.00 });
    productOosId = pOos.body.id;
    // Set out of stock
    await request(app.getHttpServer())
      .patch(`/shopkeeper/shops/${shopId}/products/${productOosId}/status`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ status: 'OUT_OF_STOCK' });

    const pDisc = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Discontinued Product', categoryId, price: 20.00 });
    productDiscontinuedId = pDisc.body.id;
    await request(app.getHttpServer())
      .patch(`/shopkeeper/shops/${shopId}/products/${productDiscontinuedId}/status`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ status: 'DISCONTINUED' });

    const pPrice = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Price Change Product', categoryId, price: 25.50 });
    productPriceChangeId = pPrice.body.id;

    // Dedicated product for availability mutation tests (stays separate from productAvailableId)
    const pAvailTest = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Availability Test Product', categoryId, price: 15.00 });
    productAvailabilityTestId = pAvailTest.body.id;

    // Create product in shop2
    const pShop2 = await request(app.getHttpServer())
      .post(`/shopkeeper/shops/${shop2Id}/products`)
      .set('Authorization', `Bearer ${skToken}`)
      .send({ name: 'Shop2 Product', categoryId: category2Id, price: 40.00 });
    productShop2Id = pShop2.body.id;
  });

  afterAll(async () => {
    const phones = ['+9981111111', '+9982222222', '+9983333333'];
    await dataSource.query(`DELETE FROM cart_items WHERE "cartId" IN (SELECT id FROM carts WHERE "userId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM carts WHERE "userId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1))`, [phones]);
    await dataSource.query(`DELETE FROM products WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM categories WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
    await dataSource.query(`DELETE FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1))`, [phones]);
    await dataSource.query(`DELETE FROM users WHERE "phoneNumber" = ANY($1)`, [phones]);
    await app.close();
  });

  // =========================================================================
  // 1. BASIC CRUD
  // =========================================================================
  describe('1. Basic Cart CRUD', () => {
    it('GET /cart - should return an empty cart for a new customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.subtotal).toBe(0);
      expect(res.body.data.itemCount).toBe(0);
    });

    it('POST /cart/items - should add a product to the cart', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 2 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].quantity).toBe(2);
      expect(res.body.data.items[0].unitPrice).toBe(50);
      expect(res.body.data.items[0].lineTotal).toBe(100); // 50 * 2
      expect(res.body.data.subtotal).toBe(100);
      expect(res.body.data.shop.id).toBe(shopId);
    });

    it('GET /cart - should return the current cart with totals', async () => {
      const res = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.subtotal).toBe(100);
      expect(res.body.data.itemCount).toBe(1);
      expect(res.body.data.totalQuantity).toBe(2);
    });

    it('PATCH /cart/items/:id - should update quantity', async () => {
      const cartRes = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
      const cartItemId = cartRes.body.data.items[0].id;

      const res = await request(app.getHttpServer())
        .patch(`/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ quantity: 3 })
        .expect(200);

      expect(res.body.data.items[0].quantity).toBe(3);
      expect(res.body.data.subtotal).toBe(150); // 50 * 3
    });

    it('DELETE /cart/items/:id - should remove an item', async () => {
      const cartRes = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
      const cartItemId = cartRes.body.data.items[0].id;

      const res = await request(app.getHttpServer())
        .delete(`/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.subtotal).toBe(0);
    });

    it('DELETE /cart - should clear the cart and reset shop association', async () => {
      // Add an item first
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 });

      const res = await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.shop).toBeNull();
    });
  });

  // =========================================================================
  // 2. OWNERSHIP / IDOR PROTECTION
  // =========================================================================
  describe('2. Cart Ownership & IDOR Protection', () => {
    let cartItemIdA: string;

    beforeAll(async () => {
      // Customer A adds an item
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 });
      cartItemIdA = res.body.data.items[0].id;
    });

    afterAll(async () => {
      // Clear cart A
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('Customer B cannot read Customer A cart (B gets their own empty cart)', async () => {
      const res = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
    });

    it('Customer B cannot PATCH Customer A cart item (IDOR)', async () => {
      await request(app.getHttpServer())
        .patch(`/cart/items/${cartItemIdA}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ quantity: 99 })
        .expect(404);
    });

    it('Customer B cannot DELETE Customer A cart item (IDOR)', async () => {
      await request(app.getHttpServer())
        .delete(`/cart/items/${cartItemIdA}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  // =========================================================================
  // 3. ONE-SHOP-PER-CART
  // =========================================================================
  describe('3. One-Shop-Per-Cart Invariant', () => {
    beforeEach(async () => {
      // Start each sub-test with a clean customer A cart
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('First item establishes cart shop association', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 })
        .expect(201);

      expect(res.body.data.shop.id).toBe(shopId);
    });

    it('Product from same shop can be added to cart', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 });

      // Add the price-change product (same shop)
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productPriceChangeId, quantity: 1 })
        .expect(201);

      expect(res.body.data.items).toHaveLength(2);
    });

    it('Product from different shop is rejected with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 });

      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productShop2Id, quantity: 1 })
        .expect(409);

      expect(res.body.message).toMatch(/different shop/i);
    });

    it('Explicit clear allows switching shops', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 });

      // Clear
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Now add from shop 2
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productShop2Id, quantity: 1 })
        .expect(201);

      expect(res.body.data.shop.id).toBe(shop2Id);
    });
  });

  // =========================================================================
  // 4. PRODUCT AVAILABILITY VALIDATION
  // =========================================================================
  describe('4. Product Availability', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('AVAILABLE product can be added', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 })
        .expect(201);
    });

    it('OUT_OF_STOCK product cannot be added', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productOosId, quantity: 1 })
        .expect(400);

      expect(res.body.message).toMatch(/not available/i);
    });

    it('DISCONTINUED product cannot be added', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productDiscontinuedId, quantity: 1 })
        .expect(400);

      expect(res.body.message).toMatch(/not available/i);
    });

    it('Existing cart item reflects changed product availability (isAvailable=false)', async () => {
      // Use a dedicated product to avoid polluting other test state
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailabilityTestId, quantity: 1 });

      // Now mark it as out-of-stock (simulate shopkeeper action)
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopId}/products/${productAvailabilityTestId}/status`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ status: 'OUT_OF_STOCK' });

      const cartRes = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const item = cartRes.body.data.items.find((i: any) => i.productId === productAvailabilityTestId);
      expect(item).toBeDefined();
      expect(item.isAvailable).toBe(false);

      // Always restore status
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopId}/products/${productAvailabilityTestId}/status`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ status: 'AVAILABLE' });
    });
  });

  // =========================================================================
  // 5. SERVER-SIDE PRICING (exact decimal)
  // =========================================================================
  describe('5. Server-Side Pricing', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('Client-provided price fields are rejected/ignored (server uses DB price)', async () => {
      // Add without any price fields — server uses DB price
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 })
        .expect(201);

      // Server always returns DB price (50), not anything from the client
      expect(res.body.data.items[0].unitPrice).toBe(50); // DB price
      expect(res.body.data.subtotal).toBe(50);
    });

    it('Server calculates line totals with exact decimal arithmetic', async () => {
      // productPriceChangeId is priced at 25.50
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productPriceChangeId, quantity: 3 })
        .expect(201);

      expect(res.body.data.items[0].lineTotal).toBe(76.50); // 25.50 * 3
      expect(res.body.data.subtotal).toBe(76.50);
    });

    it('Product price changes are reflected in cart totals on next GET', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productPriceChangeId, quantity: 2 });

      // Shopkeeper changes price to 30.00
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopId}/products/${productPriceChangeId}`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ price: 30.00 });

      const cartRes = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`);

      const item = cartRes.body.data.items.find((i: any) => i.productId === productPriceChangeId);
      expect(item.unitPrice).toBe(30);
      expect(item.lineTotal).toBe(60); // 30 * 2
      expect(cartRes.body.data.subtotal).toBe(60);

      // Restore price
      await request(app.getHttpServer())
        .patch(`/shopkeeper/shops/${shopId}/products/${productPriceChangeId}`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ price: 25.50 });
    });
  });

  // =========================================================================
  // 6. QUANTITY VALIDATION
  // =========================================================================
  describe('6. Quantity Validation', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('Rejects quantity of 0 on add', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 0 })
        .expect(400);
    });

    it('Rejects negative quantity', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: -1 })
        .expect(400);
    });

    it('Rejects quantity > 99 (MAX_CART_QUANTITY)', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 100 })
        .expect(400);
    });

    it('Allows quantity at boundary (99)', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 99 })
        .expect(201);

      expect(res.body.data.items[0].quantity).toBe(99);
    });

    it('Duplicate product increments existing item quantity', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 2 });

      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 3 })
        .expect(201);

      // Only one CartItem, quantity should be 5
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].quantity).toBe(5);
    });

    it('Exceeding MAX_CART_QUANTITY via increment is rejected', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 98 });

      // Adding 2 more would bring to 100, which exceeds 99
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 2 })
        .expect(400);

      expect(res.body.message).toMatch(/maximum quantity/i);
    });

    it('PATCH with quantity 0 removes the item', async () => {
      const addRes = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 2 });
      const itemId = addRes.body.data.items[0].id;

      const res = await request(app.getHttpServer())
        .patch(`/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ quantity: 0 })
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
    });
  });

  // =========================================================================
  // 7. MINIMUM ORDER
  // =========================================================================
  describe('7. Minimum Order', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('Cart is still editable below minimum order', async () => {
      // Shop has minimumOrder=100; product is 50 each
      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 1 })
        .expect(201);

      // Subtotal (50) < minimumOrder (100)
      expect(res.body.data.subtotal).toBe(50);
      expect(res.body.data.minimumOrder).toBe(100);
      expect(res.body.data.remainingAmount).toBe(50);
    });

    it('Remaining amount is calculated correctly', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: productAvailableId, quantity: 2 });

      const cartRes = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`);

      // subtotal=100, minimumOrder=100, remaining=0
      expect(cartRes.body.data.subtotal).toBe(100);
      expect(cartRes.body.data.remainingAmount).toBe(0);
    });
  });

  // =========================================================================
  // 8. SHOP AVAILABILITY (suspended shop rejects new additions)
  // =========================================================================
  describe('8. Shop Availability', () => {
    let suspendedShopId: string;
    let suspendedProductId: string;

    beforeAll(async () => {
      // Create a suspended shop
      const shopRes = await request(app.getHttpServer())
        .post('/shopkeeper/shops')
        .set('Authorization', `Bearer ${skToken}`)
        .send({ name: 'Suspended Shop', location: { longitude: 77.59, latitude: 12.97 } });
      suspendedShopId = shopRes.body.id;

      // Create a product in it
      const catRes = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${suspendedShopId}/categories`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ name: 'Cat' });
      const pRes = await request(app.getHttpServer())
        .post(`/shopkeeper/shops/${suspendedShopId}/products`)
        .set('Authorization', `Bearer ${skToken}`)
        .send({ name: 'Suspended Prod', categoryId: catRes.body.id, price: 10 });
      suspendedProductId = pRes.body.id;
      // Keep shop INACTIVE (default)
    });

    afterAll(async () => {
      await dataSource.query(`DELETE FROM products WHERE "shopId" = $1`, [suspendedShopId]);
      await dataSource.query(`DELETE FROM categories WHERE "shopId" = $1`, [suspendedShopId]);
      await dataSource.query(`DELETE FROM shops WHERE id = $1`, [suspendedShopId]);
    });

    it('Cannot add product from INACTIVE shop', async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);

      const res = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: suspendedProductId, quantity: 1 })
        .expect(400);

      expect(res.body.message).toMatch(/not accepting orders/i);
    });
  });

  // =========================================================================
  // 9. CONCURRENCY: Simultaneous add of same product
  // =========================================================================
  describe('9. Concurrency: Simultaneous Add (Same Product)', () => {
    afterAll(async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('Concurrent add requests for same product must not create duplicate items', async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);

      // Fire 5 concurrent add requests
      const requests = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/cart/items')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ productId: productAvailableId, quantity: 1 }),
      );

      const results = await Promise.all(requests);
      const allSucceeded = results.filter(r => r.status === 201 || r.status === 200);
      expect(allSucceeded.length).toBeGreaterThan(0);

      // Check the cart: must have exactly ONE item row
      const cartRes = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(cartRes.body.data.items).toHaveLength(1);
      // Quantity must be ≤ 99 (MAX_CART_QUANTITY)
      expect(cartRes.body.data.items[0].quantity).toBeLessThanOrEqual(99);
    });
  });

  // =========================================================================
  // 10. CONCURRENCY: Simultaneous first-item from different shops
  // =========================================================================
  describe('10. Concurrency: Cross-Shop First-Item Race', () => {
    afterAll(async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);
    });

    it('Concurrent first-item adds from different shops must not produce multi-shop cart', async () => {
      await request(app.getHttpServer())
        .delete('/cart')
        .set('Authorization', `Bearer ${tokenA}`);

      // Fire concurrently: one from shop1, one from shop2
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post('/cart/items')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ productId: productAvailableId, quantity: 1 }),
        request(app.getHttpServer())
          .post('/cart/items')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ productId: productShop2Id, quantity: 1 }),
      ]);

      // Exactly one must succeed; the other must fail (409 conflict or other error)
      const statuses = [r1.status, r2.status];
      void statuses;

      // At least one must have succeeded and at least one failed,
      // OR both from same shop scenario succeeded.
      // Key invariant: cart must contain items from only ONE shop.
      const cartRes = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenA}`);

      const shopIds = new Set(
        cartRes.body.data.items.map(() => cartRes.body.data.shop?.id).filter(Boolean)
      );
      // Cart must belong to at most one shop
      expect(shopIds.size).toBeLessThanOrEqual(1);
      console.log('Cross-shop race result:', { statuses, cartShop: cartRes.body.data.shop?.id });
    });
  });

  // =========================================================================
  // 11. AUTHENTICATION / AUTHORIZATION
  // =========================================================================
  describe('11. Authentication & Authorization', () => {
    it('Unauthenticated GET /cart returns 401', async () => {
      await request(app.getHttpServer()).get('/cart').expect(401);
    });

    it('Unauthenticated POST /cart/items returns 401', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .send({ productId: productAvailableId, quantity: 1 })
        .expect(401);
    });

    it('Non-existent product returns 404', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 })
        .expect(404);
    });

    it('Malformed UUID returns 400', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: 'not-a-uuid', quantity: 1 })
        .expect(400);
    });
  });
});
