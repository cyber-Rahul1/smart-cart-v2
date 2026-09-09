import { Controller, Get, Param, UseGuards, Req, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CommunityMealConversationService } from '../services/community-meal-conversation.service.js';
import { MealConversation } from '../entities/meal-conversation.entity.js';

@ApiTags('Community Meals - Conversation')
@ApiBearerAuth()
@Controller('api/v1/community-meals/allocations/:allocationId')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CommunityMealConversationController {
  constructor(private readonly conversationService: CommunityMealConversationService) {}

  /**
   * GET /api/v1/community-meals/allocations/:allocationId/conversation
   *
   * Returns the existing conversation for this allocation, creating it on first call.
   * Access is limited to the allocation's customer OR the shop's owner.
   * Authorization is enforced entirely inside the service.
   */
  @Get('conversation')
  @ApiOperation({
    summary: 'Get or create conversation for a meal allocation',
    description:
      'Returns the existing conversation, creating it atomically on the first call. ' +
      'Only the allocation customer and the shopkeeper (offer.shop.owner) may access this endpoint. ' +
      'Concurrent first-calls are resolved safely via the UNIQUE(allocationId) constraint.',
  })
  @ApiParam({ name: 'allocationId', format: 'uuid', description: 'UUID of the meal allocation' })
  @ApiResponse({ status: 200, description: 'Conversation returned', type: MealConversation })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'User is not a participant of this allocation' })
  @ApiResponse({ status: 404, description: 'Allocation not found' })
  async getOrCreateConversation(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Req() req: any,
  ): Promise<MealConversation> {
    const userId: string = req.user.sub;
    return this.conversationService.getOrCreateConversation(allocationId, userId);
  }
}
