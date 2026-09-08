import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../entities/user.entity.js';
import { CustomerProfile } from '../entities/customer-profile.entity.js';
import { Device } from '../entities/device.entity.js';
import { UpdateProfileDto } from '../dto/users.dto.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly dataSource: DataSource,
  ) {}

  async getProfile(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: { customerProfile: true },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return {
        id: user.id,
        phoneNumber: user.phoneNumber,
        roles: user.roles,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profile: user.customerProfile ? {
          name: user.customerProfile.name,
        } : null,
      };
    } catch (error) {
      console.error('getProfile ERROR:', error);
      throw error;
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        relations: { customerProfile: true },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (dto.name !== undefined) {
        if (!user.customerProfile) {
          user.customerProfile = manager.create(CustomerProfile, { userId: user.id });
        }
        user.customerProfile.name = dto.name;
        await manager.save(CustomerProfile, user.customerProfile);
        
        await manager.save(AuditLog, {
          action: 'PROFILE_UPDATED',
          entityType: 'User',
          entityId: user.id,
          performedBy: user.id,
          newState: { name: dto.name },
        });
      }

      return {
        id: user.id,
        phoneNumber: user.phoneNumber,
        roles: user.roles,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profile: user.customerProfile ? {
          name: user.customerProfile.name,
        } : null,
      };
    });
  }

  async getDevices(userId: string) {
    const devices = await this.deviceRepository.find({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
    });

    return devices.map(d => ({
      id: d.id,
      platform: d.platform,
      lastSeenAt: d.lastSeenAt,
      isRevoked: d.isRevoked,
      createdAt: d.createdAt,
    }));
  }

  async revokeDevice(userId: string, deviceId: string) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const device = await manager.findOne(Device, {
        where: { id: deviceId },
      });

      if (!device) {
        throw new NotFoundException('Device not found');
      }

      if (device.userId !== userId) {
        throw new ForbiddenException('Cannot revoke a device belonging to another user');
      }

      if (!device.isRevoked) {
        device.isRevoked = true;
        await manager.save(Device, device);
        
        await manager.save(AuditLog, {
          action: 'DEVICE_REVOKED',
          entityType: 'Device',
          entityId: device.id,
          performedBy: userId,
        });
      }
    });
  }

  async updatePushToken(userId: string, deviceId: string, pushToken: string, pushProvider: string) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const device = await manager.findOne(Device, {
        where: { id: deviceId },
      });

      if (!device) {
        throw new NotFoundException('Device not found');
      }

      if (device.userId !== userId) {
        throw new ForbiddenException('Cannot modify a device belonging to another user');
      }

      device.pushToken = pushToken;
      device.pushProvider = pushProvider;
      await manager.save(Device, device);

      // Do NOT log the actual push token in the audit log for security reasons.
      await manager.save(AuditLog, {
        action: 'DEVICE_PUSH_TOKEN_UPDATED',
        entityType: 'Device',
        entityId: device.id,
        performedBy: userId,
        newState: { pushProvider }, 
      });
    });
  }
}
