import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CommunityMealMenuLedgerService } from '../services/community-meal-menu-ledger.service.js';
import { UpdateLedgerBodyDto } from '../dto/update-ledger-body.dto.js';
import { ConfirmLedgerBodyDto } from '../dto/confirm-ledger-body.dto.js';
import { MealMenuLedger } from '../entities/meal-menu-ledger.entity.js';

@ApiTags('Community Meals - Ledger')
@ApiBearerAuth()
@Controller('api/v1/community-meals/allocations/:allocationId')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CommunityMealLedgerController {
  constructor(private readonly ledgerService: CommunityMealMenuLedgerService) {}

  /**
   * GET /api/v1/community-meals/allocations/:allocationId/ledger
   *
   * Returns the meal-menu ledger for this allocation.
   * Access: allocation customer OR shopkeeper (offer.shop.owner).
   * Authorization enforced by service.
   */
  @Get('ledger')
  @ApiOperation({
    summary: 'Get the menu ledger for a meal allocation',
    description:
      'Returns the current state of the MealMenuLedger, including version, allergens, ingredients, ' +
      'substitutions, spice level, and lock status. Both the customer and shopkeeper may read the ledger.',
  })
  @ApiParam({ name: 'allocationId', format: 'uuid', description: 'UUID of the meal allocation' })
  @ApiResponse({ status: 200, description: 'Ledger returned', type: MealMenuLedger })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'User is not a participant of this allocation' })
  @ApiResponse({ status: 404, description: 'Allocation or ledger not found' })
  async getLedger(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Req() req: any,
  ): Promise<MealMenuLedger> {
    const userId: string = req.user.sub;
    return this.ledgerService.getLedger(allocationId, userId);
  }

  /**
   * PUT /api/v1/community-meals/allocations/:allocationId/ledger
   *
   * Kitchen (shopkeeper) updates the ledger content.
   * Requires the current version for optimistic-locking.
   * Returns 409 on version conflict or locked ledger.
   * Access: shopkeeper only (enforced by service).
   */
  @Put('ledger')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update the menu ledger (shopkeeper only)',
    description:
      'Allows the kitchen/shopkeeper to update allergens, ingredients, substitutions, and spice level. ' +
      'Uses optimistic locking; supply the current version in expectedVersion. ' +
      'Returns 409 if the ledger is already locked or the version is stale. ' +
      'Customers and unrelated users receive 403.',
  })
  @ApiParam({ name: 'allocationId', format: 'uuid', description: 'UUID of the meal allocation' })
  @ApiResponse({ status: 200, description: 'Ledger updated', type: MealMenuLedger })
  @ApiResponse({ status: 400, description: 'Validation error (invalid fields)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'User is not the shopkeeper for this allocation' })
  @ApiResponse({ status: 404, description: 'Allocation or ledger not found' })
  @ApiResponse({ status: 409, description: 'Version conflict or ledger is already locked' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (5 updates per minute)' })
  async kitchenUpdate(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Body() body: UpdateLedgerBodyDto,
    @Req() req: any,
  ): Promise<MealMenuLedger> {
    const userId: string = req.user.sub;
    const { expectedVersion, ...updateFields } = body;
    return this.ledgerService.kitchenUpdate(allocationId, userId, updateFields, expectedVersion);
  }

  /**
   * POST /api/v1/community-meals/allocations/:allocationId/ledger/confirm
   *
   * Customer early-confirms the menu, locking the ledger immediately.
   * Requires the current version for optimistic-locking.
   * Also transitions the conversation to READ_ONLY.
   * Access: allocation customer only (enforced by service).
   */
  @Post('ledger/confirm')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Early-confirm the menu ledger (customer only)',
    description:
      'Allows the customer to confirm and lock the meal menu before the automatic lock time. ' +
      'Uses optimistic locking; supply the current version in expectedVersion. ' +
      'Returns 409 if the version is stale or the ledger is already locked/expired. ' +
      'Shopkeepers and unrelated users receive 403. ' +
      'On success, the conversation transitions to READ_ONLY.',
  })
  @ApiParam({ name: 'allocationId', format: 'uuid', description: 'UUID of the meal allocation' })
  @ApiResponse({ status: 200, description: 'Ledger confirmed and locked' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'User is not the customer for this allocation' })
  @ApiResponse({ status: 404, description: 'Allocation or ledger not found' })
  @ApiResponse({ status: 409, description: 'Version conflict or ledger already locked/expired' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (5 confirmations per minute)' })
  async confirmLedger(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Body() body: ConfirmLedgerBodyDto,
    @Req() req: any,
  ): Promise<{ message: string }> {
    const userId: string = req.user.sub;
    await this.ledgerService.confirmLedger(allocationId, userId, body.expectedVersion);
    return { message: 'Ledger confirmed and locked successfully' };
  }
}
