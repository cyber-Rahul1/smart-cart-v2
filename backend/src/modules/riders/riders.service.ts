import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RiderProfile } from '../users/entities/rider-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserStatus } from '../users/enums/user-status.enum.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { RiderAvailabilityStateMachine } from './riders.state-machine.js';
import { RiderAvailabilityStatus } from '../users/enums/rider-availability-status.enum.js';
import { RiderKycStatus } from '../users/enums/rider-kyc-status.enum.js';
import { UpdateRiderProfileDto } from './dto/update-rider-profile.dto.js';
import { UpdateRiderStatusDto } from './dto/update-rider-status.dto.js';

@Injectable()
export class RidersService {
  constructor(
    @InjectRepository(RiderProfile)
    private readonly riderProfileRepo: Repository<RiderProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  async getProfile(userId: string): Promise<RiderProfile> {
    const profile = await this.riderProfileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Rider profile not found');
    }
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateRiderProfileDto): Promise<RiderProfile> {
    const profile = await this.getProfile(userId);
    const oldState = { name: profile.name, vehicleType: profile.vehicleType, vehicleRegistration: profile.vehicleRegistration };

    if (dto.name !== undefined) profile.name = dto.name;
    if (dto.vehicleType !== undefined) profile.vehicleType = dto.vehicleType;
    if (dto.vehicleRegistration !== undefined) profile.vehicleRegistration = dto.vehicleRegistration;

    const savedProfile = await this.riderProfileRepo.save(profile);

    // Audit log without license/registration if we want to be very safe, but we only have registration here. Let's redact it for safety.
    const safeOldState = { ...oldState, vehicleRegistration: oldState.vehicleRegistration ? '***' : undefined };
    const safeNewState = { name: savedProfile.name, vehicleType: savedProfile.vehicleType, vehicleRegistration: savedProfile.vehicleRegistration ? '***' : undefined };

    await this.auditLogRepo.save(this.auditLogRepo.create({
      entityType: 'RIDER_PROFILE',
      entityId: savedProfile.id,
      action: 'RIDER_PROFILE_UPDATED',
      previousState: safeOldState,
      newState: safeNewState,
      performedBy: userId,
    }));

    return savedProfile;
  }

  async updateAvailability(userId: string, dto: UpdateRiderStatusDto, isClientRequest: boolean = true): Promise<{ status: RiderAvailabilityStatus, version: number }> {
    return await this.dataSource.transaction(async (manager) => {
      // Need to lock the user row to ensure the user is not suspended concurrently
      const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_read' } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== UserStatus.ACTIVE || !user.roles.includes(UserRole.RIDER)) {
        throw new BadRequestException('User is not an active rider');
      }

      // Fetch profile without lock to allow version-based optimistic locking
      const profile = await manager.findOne(RiderProfile, { where: { userId } });
      if (!profile) throw new NotFoundException('Rider profile not found');

      // State machine validation
      RiderAvailabilityStateMachine.validateTransition(
        profile.availabilityStatus,
        dto.status,
        profile.kycStatus,
        isClientRequest
      );

      const oldStatus = profile.availabilityStatus;
      const expectedVersion = dto.version;

      // Update with version check
      const result = await manager.update(RiderProfile, 
        { id: profile.id, version: expectedVersion }, 
        { availabilityStatus: dto.status, version: expectedVersion + 1 }
      );

      if (result.affected === 0) {
        throw new ConflictException('Availability update failed due to concurrent modification');
      }

      // Create Audit Log
      await manager.save(AuditLog, manager.create(AuditLog, {
        entityType: 'RIDER_PROFILE',
        entityId: profile.id,
        action: 'RIDER_AVAILABILITY_CHANGED',
        previousState: { availabilityStatus: oldStatus },
        newState: { availabilityStatus: dto.status },
        performedBy: userId,
      }));

      return { status: dto.status, version: expectedVersion + 1 };
    });
  }

  async isDispatchEligible(userId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: { riderProfile: true } });
    if (!user) return false;
    
    return (
      user.status === UserStatus.ACTIVE &&
      user.roles.includes(UserRole.RIDER) &&
      !!user.riderProfile &&
      user.riderProfile.kycStatus === RiderKycStatus.APPROVED &&
      user.riderProfile.availabilityStatus === RiderAvailabilityStatus.ONLINE
    );
  }
}
