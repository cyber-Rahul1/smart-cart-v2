import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DataSource, Repository } from 'typeorm';
import { User } from '../src/modules/users/entities/user.entity.js';
import { RiderProfile } from '../src/modules/users/entities/rider-profile.entity.js';
import { UserRole } from '../src/modules/users/enums/user-role.enum.js';
import { RiderKycStatus } from '../src/modules/users/enums/rider-kyc-status.enum.js';
import { RiderAvailabilityStatus } from '../src/modules/users/enums/rider-availability-status.enum.js';
import { JwtService } from '@nestjs/jwt';
import { Device } from '../src/modules/users/entities/device.entity.js';

describe('RidersController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let riderUser: User;
  let riderToken: string;
  let otherRiderToken: string;
  let customerToken: string;
  let riderProfile: RiderProfile;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);
  });

  beforeEach(async () => {
    // Clear tables
    await dataSource.query(`TRUNCATE TABLE "users", "rider_profiles", "devices", "audit_logs" CASCADE;`);

    // Create a Rider
    riderUser = await dataSource.getRepository(User).save({
      phoneNumber: '1112223333',
      roles: [UserRole.RIDER],
    });

    riderProfile = await dataSource.getRepository(RiderProfile).save({
      userId: riderUser.id,
      name: 'Test Rider',
      kycStatus: RiderKycStatus.APPROVED,
      availabilityStatus: RiderAvailabilityStatus.OFFLINE,
      vehicleRegistration: 'ABC-123',
    });

    const riderDevice = await dataSource.getRepository(Device).save({
      userId: riderUser.id,
      refreshToken: 'rider-token',
    });

    riderToken = jwtService.sign({ sub: riderUser.id, roles: [UserRole.RIDER], deviceId: riderDevice.id }, { secret: process.env.JWT_SECRET || 'secret' });

    // Create another Rider
    const otherRider = await dataSource.getRepository(User).save({
      phoneNumber: '9998887777',
      roles: [UserRole.RIDER],
    });
    await dataSource.getRepository(RiderProfile).save({
      userId: otherRider.id,
      name: 'Other Rider',
    });
    const otherRiderDevice = await dataSource.getRepository(Device).save({
      userId: otherRider.id,
      refreshToken: 'other-token',
    });
    otherRiderToken = jwtService.sign({ sub: otherRider.id, roles: [UserRole.RIDER], deviceId: otherRiderDevice.id }, { secret: process.env.JWT_SECRET || 'secret' });

    // Create a Customer
    const customerUser = await dataSource.getRepository(User).save({
      phoneNumber: '4445556666',
      roles: [UserRole.CUSTOMER],
    });
    const customerDevice = await dataSource.getRepository(Device).save({
      userId: customerUser.id,
      refreshToken: 'customer-token',
    });
    customerToken = jwtService.sign({ sub: customerUser.id, roles: [UserRole.CUSTOMER], deviceId: customerDevice.id }, { secret: process.env.JWT_SECRET || 'secret' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Security & Access', () => {
    it('should block CUSTOMER from accessing rider APIs', async () => {
      await request(app.getHttpServer())
        .get('/rider/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    it('should allow RIDER to get own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/rider/me')
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Rider');
    });

    it('should update allowed fields via PATCH /rider/me', async () => {
      const res = await request(app.getHttpServer())
        .patch('/rider/me')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ name: 'Updated Rider', vehicleType: 'Bike' })
        .expect(200);
      
      expect(res.body.data.name).toBe('Updated Rider');
      expect(res.body.data.vehicleType).toBe('Bike');

      // Check if kycStatus or role could be changed (they are not in DTO, so they should be ignored/throw validation)
    });
  });

  describe('Availability & KYC State Machine', () => {
    it('should successfully transition OFFLINE -> ONLINE when APPROVED', async () => {
      // Refresh profile to get current version
      const profile = await dataSource.getRepository(RiderProfile).findOne({ where: { userId: riderUser.id } });
      
      const res = await request(app.getHttpServer())
        .post('/rider/me/status')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'ONLINE', version: profile!.version })
        .expect(201);
      
      expect(res.body.data.status).toBe('ONLINE');
    });

    it('should reject ONLINE transition if KYC is PENDING', async () => {
      // Set to pending
      await dataSource.getRepository(RiderProfile).update({ userId: riderUser.id }, { kycStatus: RiderKycStatus.PENDING });
      const profile = await dataSource.getRepository(RiderProfile).findOne({ where: { userId: riderUser.id } });

      const res = await request(app.getHttpServer())
        .post('/rider/me/status')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'ONLINE', version: profile!.version })
        .expect(400);

      expect(res.body.message).toMatch(/Cannot go ONLINE/);
    });

    it('should reject client trying to directly set BUSY', async () => {
      const profile = await dataSource.getRepository(RiderProfile).findOne({ where: { userId: riderUser.id } });
      
      const res = await request(app.getHttpServer())
        .post('/rider/me/status')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'BUSY', version: profile!.version })
        .expect(400);
      
      expect(res.body.message).toMatch(/Client cannot directly transition to BUSY/);
    });

    it('should fail with ConflictException on concurrent updates (stale version)', async () => {
      const profile = await dataSource.getRepository(RiderProfile).findOne({ where: { userId: riderUser.id } });
      const staleVersion = profile!.version;
      
      // Update once successfully
      await request(app.getHttpServer())
        .post('/rider/me/status')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'ONLINE', version: staleVersion })
        .expect(201);

      // Attempt second update with the same (now stale) version
      await request(app.getHttpServer())
        .post('/rider/me/status')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'OFFLINE', version: staleVersion })
        .expect(409); // ConflictException
    });
  });
});
