import { Injectable } from '@nestjs/common';
import { ShopsService } from './shops.service.js';
import { ShopStatus } from '../enums/shop-status.enum.js';

@Injectable()
export class ShopAvailabilityService {
  constructor(private readonly shopsService: ShopsService) {}

  async isShopAvailable(shopId: string, currentTime: Date = new Date()): Promise<boolean> {
    const shop = await this.shopsService.getShopById(shopId);
    if (shop.status !== ShopStatus.ACTIVE) {
      return false;
    }

    const hours = await this.shopsService.getShopHours(shopId);
    if (!hours || hours.length === 0) {
      return true; // Assume 24/7 if no hours defined
    }

    const dayOfWeek = currentTime.getDay();
    const dayHours = hours.filter(h => h.dayOfWeek === dayOfWeek);

    if (dayHours.length === 0) {
      return false; // Not open this day
    }

    // Format current time as HH:mm:ss for comparison
    const hh = String(currentTime.getHours()).padStart(2, '0');
    const mm = String(currentTime.getMinutes()).padStart(2, '0');
    const ss = String(currentTime.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:${ss}`;

    for (const h of dayHours) {
      if (h.isClosed) continue;
      
      if (timeStr >= h.openTime && timeStr <= h.closeTime) {
        return true;
      }
    }

    return false;
  }
}
