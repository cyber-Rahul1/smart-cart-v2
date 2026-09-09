import { Controller, Post, Param, Body, UseGuards, Req, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { MealAllocationsService } from '../services/meal-allocations.service.js';
import { CreateMealAllocationDto } from '../dto/create-meal-allocation.dto.js';

@Controller('api/v1/community-meals/requests/:requestId/allocations')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CustomerMealAllocationsController {
  constructor(private readonly allocationsService: MealAllocationsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createAllocation(
    @Req() req: any,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CreateMealAllocationDto,
  ) {
    const userId = req.user.sub;
    const allocation = await this.allocationsService.createAllocation(userId, requestId, dto.offerId);
    return { data: allocation };
  }
}
