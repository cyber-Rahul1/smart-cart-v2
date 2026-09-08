import { Controller, Param, Post, Get, UseGuards, ParseUUIDPipe, Body } from '@nestjs/common';
import { RiderDeliveriesService } from '../services/rider-deliveries.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { UserRole } from '../../users/enums/user-role.enum.js';
import type { TokenPayload } from '../../auth/services/token/token.service.js';
import { DeliveryFailureReason } from '../enums/delivery-failure-reason.enum.js';

@Controller('riders/deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiderDeliveriesController {
  constructor(private readonly riderDeliveriesService: RiderDeliveriesService) {}

  @Get('active')
  @Roles(UserRole.RIDER)
  async getActiveDelivery(@CurrentUser() user: TokenPayload) {
    const delivery = await this.riderDeliveriesService.getActiveDelivery(user.sub);
    return { delivery };
  }

  @Get(':deliveryId')
  @Roles(UserRole.RIDER)
  async getDeliveryDetails(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const delivery = await this.riderDeliveriesService.getDeliveryDetails(user.sub, deliveryId);
    return { delivery };
  }

  @Post(':deliveryId/pickup')
  @Roles(UserRole.RIDER)
  async pickupDelivery(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body('otp') otp: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const delivery = await this.riderDeliveriesService.pickupDelivery(user.sub, deliveryId, otp);
    return { message: 'Delivery picked up', delivery };
  }

  @Post(':deliveryId/start')
  @Roles(UserRole.RIDER)
  async startDelivery(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const delivery = await this.riderDeliveriesService.startDelivery(user.sub, deliveryId);
    return { message: 'Delivery started', delivery };
  }

  @Post(':deliveryId/arriving')
  @Roles(UserRole.RIDER)
  async arrivingAtDelivery(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const delivery = await this.riderDeliveriesService.arrivingAtDelivery(user.sub, deliveryId);
    return { message: 'Arriving at delivery', delivery };
  }

  @Post(':deliveryId/complete')
  @Roles(UserRole.RIDER)
  async completeDelivery(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body('otp') otp: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const delivery = await this.riderDeliveriesService.completeDelivery(user.sub, deliveryId, otp);
    return { message: 'Delivery completed', delivery };
  }

  @Post(':deliveryId/fail')
  @Roles(UserRole.RIDER)
  async failDelivery(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body('reason') reason: DeliveryFailureReason,
    @Body('notes') notes: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const delivery = await this.riderDeliveriesService.failDelivery(user.sub, deliveryId, reason, notes);
    return { message: 'Delivery failed', delivery };
  }
}
