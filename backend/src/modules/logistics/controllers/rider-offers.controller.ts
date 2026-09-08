import { Controller, Param, Post, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { OffersService } from '../services/offers.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { UserRole } from '../../users/enums/user-role.enum.js';
import type { TokenPayload } from '../../auth/services/token/token.service.js';

@Controller('riders/offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RiderOffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post(':offerId/accept')
  @Roles(UserRole.RIDER)
  async acceptOffer(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const delivery = await this.offersService.acceptOffer(user.sub, offerId);
    return {
      message: 'Offer accepted successfully',
      deliveryId: delivery.id,
    };
  }

  @Post(':offerId/reject')
  @Roles(UserRole.RIDER)
  async rejectOffer(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    await this.offersService.rejectOffer(user.sub, offerId);
    return {
      message: 'Offer rejected successfully',
    };
  }
}
