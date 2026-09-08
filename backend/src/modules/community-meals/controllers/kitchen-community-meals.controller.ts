import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, HttpCode, HttpStatus, ParseUUIDPipe, BadRequestException } from '@nestjs/common';
import { CommunityMealOffersService } from '../services/community-meal-offers.service.js';
import { CreateCommunityMealOfferDto } from '../dto/create-community-meal-offer.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@Controller('api/v1/community-meals/kitchen/shops/:shopId')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class KitchenCommunityMealsController {
  constructor(private readonly offersService: CommunityMealOffersService) {}

  @Get('clusters')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getNearbyClusters(
    @Req() req: any,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Query('lat') latStr: string,
    @Query('lng') lngStr: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ) {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const limit = limitStr ? parseInt(limitStr, 10) : 20;

    if (isNaN(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException('Invalid latitude');
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException('Invalid longitude');
    }

    const userId = req.user.sub;
    const { clusters, nextCursor } = await this.offersService.getEligibleDemandClusters(userId, shopId, lat, lng, limit, cursor);

    return {
      data: clusters,
      pagination: {
        nextCursor,
      },
    };
  }

  @Post('offers')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createOffer(
    @Req() req: any,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Body() dto: CreateCommunityMealOfferDto,
  ) {
    const userId = req.user.sub;
    const offer = await this.offersService.createOffer(userId, shopId, dto);
    return { data: offer };
  }
}
