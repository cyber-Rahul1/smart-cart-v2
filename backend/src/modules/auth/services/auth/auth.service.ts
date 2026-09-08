import { Injectable, Inject, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TokenService } from '../token/token.service.js';
import { PHONE_VERIFICATION_PROVIDER, type PhoneVerificationProvider } from '../../providers/phone-verification.provider.js';
import { User } from '../../../users/entities/user.entity.js';
import { Device } from '../../../users/entities/device.entity.js';
import { UserRole } from '../../../users/enums/user-role.enum.js';
import { UserStatus } from '../../../users/enums/user-status.enum.js';
import { AuditLog } from '../../../audit/entities/audit-log.entity.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PHONE_VERIFICATION_PROVIDER)
    private readonly verificationProvider: PhoneVerificationProvider,
    private readonly tokenService: TokenService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Normalizes the phone number (currently a simple trim and plus addition,
   * but can be expanded to full E.164 parsing).
   */
  normalizePhoneNumber(phone: string): string {
    let normalized = phone.replace(/\s+/g, '');
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    return normalized;
  }

  async sendOtp(phoneNumber: string): Promise<void> {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    await this.verificationProvider.sendVerification(normalized);
    
    // Non-blocking audit log
    this.dataSource.getRepository(AuditLog).save({
      action: 'OTP_REQUESTED',
      entityType: 'User',
      entityId: normalized, // We don't have user ID yet for new users, so use phone
      performedBy: 'SYSTEM',
      newState: { phone: normalized }, // Don't log this if it's considered sensitive account enum, but for now we log it.
    }).catch(err => this.logger.error('Failed to write audit log', err));
  }

  async verifyOtpAndLogin(phoneNumber: string, code: string, platform?: string, deviceId?: string) {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    
    const isValid = await this.verificationProvider.checkVerification(normalized, code);
    if (!isValid) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      let user = await manager.findOne(User, { where: { phoneNumber: normalized } });
      
      let isNewUser = false;
      if (!user) {
        user = manager.create(User, {
          phoneNumber: normalized,
          roles: [UserRole.CUSTOMER], // Default role
          status: UserStatus.ACTIVE,
        });
        await manager.save(User, user);
        isNewUser = true;
      } else if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException('User account is suspended or inactive');
      }

      // Create new session/device
      const device = manager.create(Device, {
        userId: user.id,
        platform,
        deviceId,
      });

      const rawRefreshToken = this.tokenService.generateRefreshToken();
      device.refreshTokenHash = await this.tokenService.hashRefreshToken(rawRefreshToken);
      
      await manager.save(Device, device);

      const accessToken = this.tokenService.generateAccessToken(user, device);

      await manager.save(AuditLog, {
        action: isNewUser ? 'USER_REGISTERED' : 'OTP_VERIFIED',
        entityType: 'User',
        entityId: user.id,
        performedBy: user.id,
        newState: { deviceId: device.id, platform },
      });

      return {
        user: {
          id: user.id,
          roles: user.roles,
        },
        accessToken,
        refreshToken: rawRefreshToken,
      };
    });
  }

  async refreshTokens(rawRefreshToken: string, deviceId: string) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
        const device = await manager.findOne(Device, {
          where: { id: deviceId },
          relations: { user: true },
        });

        if (!device) {
          throw new UnauthorizedException('Session not found');
        }

        const user = device.user as unknown as User;

        if (device.isRevoked) {
          await manager.save(AuditLog, {
            action: 'TOKEN_REUSE_DETECTED',
            entityType: 'Device',
            entityId: device.id,
            performedBy: user.id,
            newState: { alert: 'Attempted to refresh a revoked session' },
          });
          throw new UnauthorizedException('Session revoked');
        }

        const isValid = await this.tokenService.verifyRefreshToken(rawRefreshToken, device.refreshTokenHash);
        if (!isValid) {
          throw new UnauthorizedException('Invalid refresh token');
        }

        if (user.status !== 'ACTIVE') {
          throw new UnauthorizedException('User account is suspended');
        }

        // Rotate Refresh Token with Explicit Optimistic Locking
        const newRawRefreshToken = this.tokenService.generateRefreshToken();
        const newHash = await this.tokenService.hashRefreshToken(newRawRefreshToken);
        
        const updateResult = await manager.update(Device, 
          { id: device.id, version: device.version }, 
          { refreshTokenHash: newHash, lastSeenAt: new Date() }
        );

        if (updateResult.affected === 0) {
          throw new UnauthorizedException('Concurrent refresh detected');
        }

        const newAccessToken = this.tokenService.generateAccessToken(user, device);

        await manager.save(AuditLog, {
          action: 'TOKEN_REFRESHED',
          entityType: 'Device',
          entityId: device.id,
          performedBy: user.id,
        });

        return {
          accessToken: newAccessToken,
          refreshToken: newRawRefreshToken,
        };
      });
  }

  async logout(deviceId: string, userId: string) {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const device = await manager.findOne(Device, { where: { id: deviceId, userId } });
      if (device) {
        device.isRevoked = true;
        await manager.save(Device, device);

        await manager.save(AuditLog, {
          action: 'LOGOUT',
          entityType: 'Device',
          entityId: device.id,
          performedBy: userId,
        });
      }
    });
  }

  async logoutAll(userId: string) {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.update(Device, { userId, isRevoked: false }, { isRevoked: true });
      await manager.save(AuditLog, {
        action: 'LOGOUT_ALL',
        entityType: 'User',
        entityId: userId,
        performedBy: userId,
      });
    });
  }
}

