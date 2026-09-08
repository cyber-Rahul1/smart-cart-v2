import { Controller, Post, Body, Get, Param, Patch, UseGuards, Req, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { CommunityMealRequestsService } from '../services/community-meal-requests.service.js';
import { CreateCommunityMealRequestDto } from '../dto/create-community-meal-request.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@Controller('api/v1/community-meals/requests')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CommunityMealRequestsController {
  constructor(private readonly communityMealRequestsService: CommunityMealRequestsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createRequest(
    @Req() req: any,
    @Body() dto: CreateCommunityMealRequestDto,
  ) {
    const userId = req.user.sub;
    const request = await this.communityMealRequestsService.createRequest(userId, dto);
    return { data: request };
  }

  @Get(':id')
  async getRequest(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = req.user.sub;
    const request = await this.communityMealRequestsService.getRequest(id, userId);
    return { data: request };
  }

  @Patch(':id/cancel')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async cancelRequest(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = req.user.sub;
    const request = await this.communityMealRequestsService.cancelRequest(id, userId);
    return { data: request };
  }
}
