import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CommunityMealMessagesService } from '../services/community-meal-messages.service.js';
import { CommunityMealConversationService } from '../services/community-meal-conversation.service.js';
import { GetMessagesQueryDto } from '../dto/get-messages-query.dto.js';
import { SendMessageBodyDto } from '../dto/send-message-body.dto.js';
import { PaginatedMessageDto } from '../dto/paginated-message.dto.js';
import { MealMessage } from '../entities/meal-message.entity.js';

@ApiTags('Community Meals - Messages')
@ApiBearerAuth()
@Controller('api/v1/community-meals/allocations/:allocationId')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CommunityMealMessageController {
  constructor(
    private readonly messagesService: CommunityMealMessagesService,
    private readonly conversationService: CommunityMealConversationService,
  ) {}

  /**
   * GET /api/v1/community-meals/allocations/:allocationId/conversation/messages
   *
   * Returns a cursor-paginated list of messages for this allocation's conversation.
   * Cursor format is base64-JSON({ createdAt, id }) – owned and decoded by the service.
   * The controller passes cursor/limit straight through without interpreting them.
   */
  @Get('conversation/messages')
  @ApiOperation({
    summary: 'List messages in the conversation for a meal allocation',
    description:
      'Returns a cursor-paginated array of messages ordered by (createdAt ASC, id ASC). ' +
      'Pass the returned nextCursor as the cursor query parameter for the next page. ' +
      'Only the allocation customer and the shopkeeper may access this endpoint.',
  })
  @ApiParam({ name: 'allocationId', format: 'uuid', description: 'UUID of the meal allocation' })
  @ApiResponse({ status: 200, description: 'Paginated messages', type: PaginatedMessageDto })
  @ApiResponse({ status: 400, description: 'Invalid cursor or pagination parameters' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'User is not a participant of this allocation' })
  @ApiResponse({ status: 404, description: 'Allocation or conversation not found' })
  async getMessages(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Query() query: GetMessagesQueryDto,
    @Req() req: any,
  ): Promise<PaginatedMessageDto> {
    const userId: string = req.user.sub;
    const limit = query.limit ?? 20;

    // Verify participant access (throws ForbiddenException / NotFoundException internally)
    await this.conversationService.verifyAccess(allocationId, userId);

    // Resolve conversation for this allocation
    const conversation = await this.conversationService.getOrCreateConversation(allocationId, userId);

    // Fetch limit+1 to determine if a next page exists without an extra COUNT query
    const messages: MealMessage[] = await this.messagesService.getMessages(
      conversation.id,
      query.cursor,
      limit + 1,
    );

    const hasNext = messages.length > limit;
    const pageItems = hasNext ? messages.slice(0, limit) : messages;

    // Build next cursor using the service's existing base64-JSON format
    const lastItem = pageItems[pageItems.length - 1];
    const nextCursor: string | null =
      hasNext && lastItem
        ? Buffer.from(JSON.stringify({ createdAt: lastItem.createdAt, id: lastItem.id })).toString('base64')
        : null;

    return {
      data: pageItems,
      meta: { limit, hasNext, nextCursor },
    };
  }

  /**
   * POST /api/v1/community-meals/allocations/:allocationId/conversation/messages
   *
   * Sends a new message in this allocation's conversation.
   * Identity (senderId, senderRole) is derived server-side from req.user.sub.
   * Idempotency is enforced via the x-idempotency-key header + DB unique constraint.
   */
  @Post('conversation/messages')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a message in the conversation for a meal allocation',
    description:
      'Creates a new message. senderId and senderRole are derived from the authenticated JWT; ' +
      'clients may NOT supply them. Provide x-idempotency-key to safely retry without duplicating messages.',
  })
  @ApiParam({ name: 'allocationId', format: 'uuid', description: 'UUID of the meal allocation' })
  @ApiHeader({
    name: 'x-idempotency-key',
    description: 'Optional idempotency key (UUID). Duplicate sends with the same key return the original message.',
    required: false,
  })
  @ApiResponse({ status: 201, description: 'Message created', type: MealMessage })
  @ApiResponse({ status: 400, description: 'Validation error (empty / too long content)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'User is not a participant, or conversation is READ_ONLY' })
  @ApiResponse({ status: 404, description: 'Allocation or conversation not found' })
  @ApiResponse({ status: 409, description: 'Idempotency error' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (10 messages per minute)' })
  async sendMessage(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Body() body: SendMessageBodyDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Req() req: any,
  ): Promise<{ data: MealMessage }> {
    const userId: string = req.user.sub;

    // Resolve conversation (creates if first access, also verifies access)
    const conversation = await this.conversationService.getOrCreateConversation(allocationId, userId);

    const message = await this.messagesService.sendMessage(
      userId,
      conversation.id,
      body.content,
      idempotencyKey,
    );

    return { data: message };
  }
}
