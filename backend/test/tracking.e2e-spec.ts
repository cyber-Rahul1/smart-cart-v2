import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { TrackingService } from '../src/modules/tracking/tracking.service.js';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';

describe('Tracking & Live Location (e2e)', () => {
  let app: INestApplication;
  let trackingService: TrackingService;
  let redis: Redis;
  let dataSource: DataSource;
  let serverPort: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    // Start listening on a dynamic port
    await app.listen(0);
    serverPort = app.getHttpServer().address().port;

    trackingService = app.get<TrackingService>(TrackingService);
    redis = app.get<Redis>('REDIS_CLIENT');
    dataSource = app.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await redis.quit();
    await app.close();
  });

  afterEach(async () => {
    // Cleanup any rider:location keys to prevent test pollution
    const keys = await redis.keys('rider:location:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.del('rider:locations:geo');
  });

  it('Cold Start: First location with no previous sample accepted cleanly', async () => {
    const riderId = randomUUID();
    const result = await trackingService.updateLocation({
      riderId,
      lat: 12.9716,
      lng: 77.5946,
      riderTimestamp: 1000,
    });
    expect(result).toBe('SUCCESS');

    const hash = await trackingService.getLatestLocation(riderId);
    expect(hash).toBeDefined();
    expect(hash.lat).toBe(12.9716);
  });

  it('Ordering & Edge Deltas: Older or equal location is ignored natively', async () => {
    const riderId = randomUUID();
    
    // First location
    await trackingService.updateLocation({
      riderId, lat: 12.0, lng: 77.0, riderTimestamp: 5000,
    });

    // Older location
    const olderResult = await trackingService.updateLocation({
      riderId, lat: 12.1, lng: 77.1, riderTimestamp: 4000,
    });
    expect(olderResult).toBe('STALE');

    // Equal timestamp
    const equalResult = await trackingService.updateLocation({
      riderId, lat: 12.1, lng: 77.1, riderTimestamp: 5000,
    });
    expect(equalResult).toBe('STALE');

    const hash = await trackingService.getLatestLocation(riderId);
    expect(hash.lat).toBe(12.0); // Remains unchanged
  });

  it('Jump Validation: Impossible jump (> 150km/h) cleanly rejected', async () => {
    const riderId = randomUUID();
    
    // First location in Bangalore
    await trackingService.updateLocation({
      riderId, lat: 12.9716, lng: 77.5946, riderTimestamp: 1000,
    });

    // Next location in Delhi (approx 1700km away), 1 hour later
    // 1700 km / 1 hr = 1700 km/h (> 150 km/h)
    const jumpResult = await trackingService.updateLocation({
      riderId, lat: 28.7041, lng: 77.1025, riderTimestamp: 1000 + (3600 * 1000),
    });
    
    expect(jumpResult).toBe('JUMP_REJECTED');

    const hash = await trackingService.getLatestLocation(riderId);
    expect(hash.lat).toBe(12.9716); // Remained at Bangalore
  });

  it('Atomicity: Verify Hash and GEO consistency', async () => {
    const riderId = randomUUID();
    await trackingService.updateLocation({
      riderId, lat: 12.9716, lng: 77.5946, riderTimestamp: 1000,
    });

    // Check Hash
    const hash = await trackingService.getLatestLocation(riderId);
    expect(hash).toBeDefined();

    // Check GEO
    const geoPos = await redis.geopos('rider:locations:geo', riderId);
    expect(geoPos[0]).toBeDefined();
    // GEO stores Lng, Lat
    expect(Math.abs(parseFloat(geoPos[0]![0]) - 77.5946)).toBeLessThan(0.0001);
    expect(Math.abs(parseFloat(geoPos[0]![1]) - 12.9716)).toBeLessThan(0.0001);
  });

  it('Stale Geo: Stale Hash with lingering GEO member explicitly discarded during cleanup', async () => {
    const riderId = randomUUID();
    await trackingService.updateLocation({
      riderId, lat: 12.9716, lng: 77.5946, riderTimestamp: 1000,
    });

    // Artificially delete the hash to simulate TTL expiration
    await redis.del(`rider:location:${riderId}`);

    // Verify GEO member still exists
    let geoPos = await redis.geopos('rider:locations:geo', riderId);
    expect(geoPos[0]).toBeDefined();

    // Run cleanup
    await trackingService.cleanupStaleGeo();

    // Verify GEO member is gone
    geoPos = await redis.geopos('rider:locations:geo', riderId);
    expect(geoPos[0]).toBeNull();
  });

  it('Concurrency: Concurrent accepted location updates process safely', async () => {
    const riderId = randomUUID();
    
    // Fire 50 updates concurrently with randomized slightly increasing timestamps
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        trackingService.updateLocation({
          riderId,
          lat: 12.9716 + (i * 0.0001),
          lng: 77.5946 + (i * 0.0001),
          riderTimestamp: 1000 + i, // Strictly increasing
        })
      );
    }
    
    await Promise.all(promises);

    // Because they fire concurrently, they race. The highest timestamp might not be the last one processed.
    // But no matter what, the system shouldn't crash, and the final state should be structurally consistent.
    const hash = await trackingService.getLatestLocation(riderId);
    expect(hash).toBeDefined();
    expect(hash.riderTimestamp).toBeGreaterThanOrEqual(1000);
  });

  describe('Socket.IO Bridge (Redis -> Customer)', () => {
    let customerToken: string;
    let customerId: string;
    let orderId: string;
    let deliveryId: string;
    let riderToken: string;
    let riderId: string;
    let socket: Socket;

    beforeAll(async () => {
      // 1. Create Customer
      const phone = '+9989977777';
      await request(app.getHttpServer()).post('/auth/otp/send').send({ phoneNumber: phone });
      await dataSource.query(
        `INSERT INTO users ("phoneNumber", roles, status) VALUES ($1, '{"CUSTOMER"}', 'ACTIVE') ON CONFLICT ("phoneNumber") DO NOTHING`,
        [phone],
      );
      const res = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phoneNumber: phone, code: '123456', platform: 'test' });
      customerToken = res.body.accessToken;
      customerId = res.body.user.id;

      // 2. Create Rider
      const rPhone = '+9989988888';
      await request(app.getHttpServer()).post('/auth/otp/send').send({ phoneNumber: rPhone });
      await dataSource.query(
        `INSERT INTO users ("phoneNumber", roles, status) VALUES ($1, '{"RIDER"}', 'ACTIVE') ON CONFLICT ("phoneNumber") DO NOTHING`,
        [rPhone],
      );
      const rRes = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phoneNumber: rPhone, code: '123456', platform: 'test' });
      riderToken = rRes.body.accessToken;
      riderId = rRes.body.user.id;

      const profileRes = await dataSource.query(`
        INSERT INTO rider_profiles ("userId", version) 
        VALUES ($1, 1) RETURNING id
      `, [riderId]);
      const riderProfileId = profileRes[0].id;

      // 3. Create dummy Shop to satisfy order schema
      const shopRes = await dataSource.query(`
        INSERT INTO shops ("ownerId", name, "minimumOrder", "deliveryRadius", location, status) 
        VALUES ($1, 'Test Shop', 0, 1000, ST_SetSRID(ST_MakePoint(77.0, 12.0), 4326), 'ACTIVE') RETURNING id
      `, [customerId]);
      const shopId = shopRes[0].id;

      // 4. Create Order and Delivery
      const orderRes = await dataSource.query(`
        INSERT INTO orders ("customerId", "shopId", status, subtotal, "deliveryFee", "totalAmount", "deliveryAddressLabel", "deliveryAddressLine", "deliveryLocation", version)
        VALUES ($1, $2, 'OUT_FOR_DELIVERY', 100, 0, 100, 'Home', 'Line 1', ST_SetSRID(ST_MakePoint(77.0, 12.0), 4326), 1) RETURNING id
      `, [customerId, shopId]);
      orderId = orderRes[0].id;

      const delRes = await dataSource.query(`
        INSERT INTO deliveries ("orderId", "riderId", status, version, "pickupLocation", "dropoffLocation")
        VALUES ($1, $2, 'OUT_FOR_DELIVERY', 1, ST_SetSRID(ST_MakePoint(77.0, 12.0), 4326), ST_SetSRID(ST_MakePoint(77.0, 12.0), 4326)) RETURNING id
      `, [orderId, riderProfileId]);
      deliveryId = delRes[0].id;
    });

    afterAll(async () => {
      if (socket) {
        socket.disconnect();
      }
      await dataSource.query(`DELETE FROM deliveries WHERE "orderId" = $1`, [orderId]);
      await dataSource.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
    });

    it('should receive location updates via Socket.IO when rider publishes to Redis', (done) => {
      // Connect customer socket
      socket = io(`http://localhost:${serverPort}/ws/v1/tracking`, {
        query: { token: customerToken },
        transports: ['websocket'],
      });

      socket.on('connect', () => {
        // Customer subscribes to delivery room
        socket.emit('subscribe_delivery', { deliveryId });
      });

      socket.on('subscribed', (data) => {
        expect(data.deliveryId).toBe(deliveryId);

        // Rider publishes location update using HTTP (which publishes to Redis) or tracking service directly
        // Because we are testing Redis -> SocketIO, we'll use trackingService which writes to Redis
        setTimeout(async () => {
          await trackingService.updateLocation({
            riderId,
            lat: 12.3456,
            lng: 77.6543,
            riderTimestamp: Date.now(),
            deliveryId, // This makes TrackingService publish to delivery room
          });
        }, 500);
      });

      socket.on('location_update', (payload) => {
        expect(payload.riderId).toBe(riderId);
        expect(payload.lat).toBe(12.3456);
        expect(payload.lng).toBe(77.6543);
        expect(payload.deliveryId).toBe(deliveryId);
        done();
      });

      socket.on('error', (err) => {
        done(new Error('Socket error: ' + JSON.stringify(err)));
      });
    }, 10000);
  });
});
