import { Controller, Get, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { CommunityMealClusteringService } from '../services/community-meal-clustering.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@Controller('api/v1/community-meals/clusters')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CommunityMealClustersController {
  constructor(private readonly clusteringService: CommunityMealClusteringService) {}

  @Get('nearby')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getNearbyClusters(
    @Req() req: any,
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

    const { clusters, nextCursor } = await this.clusteringService.getNearbyClusters(lat, lng, limit, cursor);

    return {
      data: clusters,
      pagination: {
        nextCursor,
      },
    };
  }
}
