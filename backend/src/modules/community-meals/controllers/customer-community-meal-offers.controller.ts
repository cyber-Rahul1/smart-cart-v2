import { Controller, Get, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { CommunityMealOffersService } from '../services/community-meal-offers.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@Controller('api/v1/community-meals/clusters/:clusterId/offers')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CustomerCommunityMealOffersController {
  constructor(private readonly offersService: CommunityMealOffersService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getOffers(
    @Param('clusterId', ParseUUIDPipe) clusterId: string,
  ) {
    const offers = await this.offersService.getCustomerOffers(clusterId);
    return { data: offers };
  }
}
