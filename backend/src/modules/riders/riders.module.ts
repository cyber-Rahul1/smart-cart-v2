import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RidersController } from './riders.controller.js';
import { RidersService } from './riders.service.js';
import { RiderProfile } from '../users/entities/rider-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([RiderProfile, User, AuditLog])],
  controllers: [RidersController],
  providers: [RidersService],
  exports: [RidersService],
})
export class RidersModule {}
