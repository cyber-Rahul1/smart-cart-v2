import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';

describe('UsersController (e2e)', () => {
  let app: INestApplication<any>;
  let dataSource: DataSource;
  let accessToken: string;
  let deviceId: string;
  let addressId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE "phoneNumber" = \'+9988888888\'');
    await app.close();
  });

  describe('Setup - Authentication', () => {
    it('Should login and get tokens', async () => {
      // 1. Send OTP
      await request(app.getHttpServer())
        .post('/auth/otp/send')
        .send({ phoneNumber: '+9988888888' })
        .expect(200);

      // 2. Verify OTP
      const response = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phoneNumber: '+9988888888', code: '123456', platform: 'test-device' })
        .expect(200);

      accessToken = response.body.accessToken;
      
      const jwtParts = accessToken.split('.');
      const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
      deviceId = payload.deviceId;
    });
  });

  describe('1. Profile APIs', () => {
    it('GET /users/me should return profile info', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);
      
      if (response.status !== 200) {
        console.log('GET /users/me failed:', response.body);
      }
      expect(response.status).toBe(200);
        
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('phoneNumber', '+9988888888');
      expect(response.body).toHaveProperty('roles');
      expect(response.body).toHaveProperty('profile');
    });

    it('PATCH /users/me should update profile name', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'John Doe' })
        .expect(200);
        
      expect(response.body.profile.name).toBe('John Doe');
    });

    it('PATCH /users/me should ignore arbitrary fields like roles', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roles: ['ADMIN'] })
        .expect(200);
        
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);
        
      expect(response.body.roles).not.toContain('ADMIN');
    });
  });

  describe('2. Address APIs', () => {
    it('POST /users/me/addresses should create address and set as default', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          label: 'Home',
          addressLine: '123 Main St',
          latitude: 40.7128,
          longitude: -74.0060,
        });
        
      if (response.status !== 201) {
        console.log('POST /users/me/addresses failed:', response.body || response.status);
      }
      expect(response.status).toBe(201);
        
      expect(response.body).toHaveProperty('id');
      expect(response.body.label).toBe('Home');
      expect(response.body.isDefault).toBe(true); // First address should be default
      
      addressId = response.body.id;
    });

    it('GET /users/me/addresses should list addresses', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
        
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
    });

    it('PATCH /users/me/addresses/:id should update address', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/me/addresses/${addressId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ label: 'Work' })
        .expect(200);
        
      expect(response.body.label).toBe('Work');
    });

    it('POST /users/me/addresses/:id/default should set address as default', async () => {
      // Create a second address
      const res2 = await request(app.getHttpServer())
        .post('/users/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          label: 'Other',
          addressLine: '456 Other St',
          latitude: 40.0,
          longitude: -74.0,
        })
        .expect(201);
        
      expect(res2.body.isDefault).toBe(false);

      // Set second address as default
      await request(app.getHttpServer())
        .post(`/users/me/addresses/${res2.body.id}/default`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
        
      // Verify first address is no longer default
      const res1 = await request(app.getHttpServer())
        .get(`/users/me/addresses/${addressId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
        
      expect(res1.body.isDefault).toBe(false);
    });

    it('DELETE /users/me/addresses/:id should delete address', async () => {
      await request(app.getHttpServer())
        .delete(`/users/me/addresses/${addressId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
        
      await request(app.getHttpServer())
        .get(`/users/me/addresses/${addressId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('3. Device APIs', () => {
    it('GET /users/me/devices should list active devices', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me/devices')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
        
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].platform).toBe('test-device');
    });

    it('PATCH /users/me/devices/:deviceId/push-token should update token', async () => {
      await request(app.getHttpServer())
        .patch(`/users/me/devices/${deviceId}/push-token`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ pushToken: 'test-fcm-token', pushProvider: 'FCM' })
        .expect(200);
        
      // Ensure it doesn't return the pushToken via GET /devices
      const response = await request(app.getHttpServer())
        .get('/users/me/devices')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
        
      const device = response.body.find((d: any) => d.id === deviceId);
      expect(device.pushToken).toBeUndefined();
    });

    it('DELETE /users/me/devices/:deviceId should revoke a specific device', async () => {
      await request(app.getHttpServer())
        .delete(`/users/me/devices/${deviceId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
        
      const response = await request(app.getHttpServer())
        .get('/users/me/devices')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
        
      const device = response.body.find((d: any) => d.id === deviceId);
      expect(device.isRevoked).toBe(true);
    });
  });
});
