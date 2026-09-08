import { BadRequestException } from '@nestjs/common';
import { RiderAvailabilityStatus } from '../users/enums/rider-availability-status.enum.js';
import { RiderKycStatus } from '../users/enums/rider-kyc-status.enum.js';

export class RiderAvailabilityStateMachine {
  static validateTransition(
    currentStatus: RiderAvailabilityStatus,
    targetStatus: RiderAvailabilityStatus,
    kycStatus: RiderKycStatus,
    isClientRequest: boolean = false,
  ): void {
    if (currentStatus === targetStatus) {
      throw new BadRequestException(`Rider is already in ${targetStatus} state`);
    }

    if (isClientRequest) {
      if (targetStatus === RiderAvailabilityStatus.BUSY || targetStatus === RiderAvailabilityStatus.SUSPENDED) {
        throw new BadRequestException(`Client cannot directly transition to ${targetStatus}`);
      }
    }

    // Eligibility check for ONLINE
    if (targetStatus === RiderAvailabilityStatus.ONLINE) {
      if (kycStatus !== RiderKycStatus.APPROVED) {
        throw new BadRequestException(`Cannot go ONLINE. KYC status is ${kycStatus}`);
      }
    }

    const validTransitions: Record<RiderAvailabilityStatus, RiderAvailabilityStatus[]> = {
      [RiderAvailabilityStatus.OFFLINE]: [
        RiderAvailabilityStatus.ONLINE,
        RiderAvailabilityStatus.SUSPENDED,
      ],
      [RiderAvailabilityStatus.ONLINE]: [
        RiderAvailabilityStatus.OFFLINE,
        RiderAvailabilityStatus.BUSY,
        RiderAvailabilityStatus.SUSPENDED,
      ],
      [RiderAvailabilityStatus.BUSY]: [
        RiderAvailabilityStatus.ONLINE,
        RiderAvailabilityStatus.SUSPENDED,
      ],
      [RiderAvailabilityStatus.SUSPENDED]: [
        RiderAvailabilityStatus.OFFLINE, // Admin action restores to OFFLINE usually
      ],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(`Invalid transition from ${currentStatus} to ${targetStatus}`);
    }
  }
}
