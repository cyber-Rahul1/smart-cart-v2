import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity.js';
import { KitchenCompliance } from '../entities/kitchen-compliance.entity.js';
import { ShopStatus } from '../../shops/enums/shop-status.enum.js';
import { FssaiStatus } from '../enums/fssai-status.enum.js';
import { KitchenOperationalStatus } from '../enums/kitchen-operational-status.enum.js';

@Injectable()
export class KitchenEligibilityService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(KitchenCompliance)
    private readonly complianceRepo: Repository<KitchenCompliance>,
  ) {}

  async checkEligibility(userId: string, shopId: string): Promise<{ eligible: boolean; reason?: string }> {
    const shop = await this.shopRepo.findOne({ where: { id: shopId } });
    
    if (!shop) {
      return { eligible: false, reason: 'Shop not found' };
    }
    
    if (shop.ownerId !== userId) {
      return { eligible: false, reason: 'You do not own this shop' };
    }

    if (shop.status !== ShopStatus.ACTIVE) {
      return { eligible: false, reason: 'Shop is not active' };
    }

    const compliance = await this.complianceRepo.findOne({ where: { shopId } });
    if (!compliance) {
      return { eligible: false, reason: 'Compliance record not found' };
    }

    if (compliance.kycStatus !== 'VERIFIED') {
      return { eligible: false, reason: 'KYC is not verified' };
    }

    if (compliance.fssaiStatus !== FssaiStatus.VALID) {
      return { eligible: false, reason: 'FSSAI license is not valid' };
    }

    const now = new Date();
    if (compliance.fssaiValidFrom && compliance.fssaiValidFrom > now) {
      return { eligible: false, reason: 'FSSAI license is not yet valid' };
    }
    if (compliance.fssaiValidUntil && compliance.fssaiValidUntil < now) {
      return { eligible: false, reason: 'FSSAI license has expired' };
    }

    if (compliance.settlementAccountStatus !== 'ACTIVE') {
      return { eligible: false, reason: 'Settlement account is not active' };
    }

    if (compliance.operationalStatus !== KitchenOperationalStatus.ELIGIBLE) {
      return { eligible: false, reason: 'Kitchen operational status is not eligible' };
    }

    return { eligible: true };
  }

  async requireEligibility(userId: string, shopId: string): Promise<void> {
    const { eligible, reason } = await this.checkEligibility(userId, shopId);
    if (!eligible) {
      throw new ForbiddenException(`Kitchen is not eligible for community meals: ${reason}`);
    }
  }
}
