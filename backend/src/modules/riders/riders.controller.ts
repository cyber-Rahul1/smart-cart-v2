import { Controller, Get, Patch, Post, Body, UseGuards, Request } from '@nestjs/common';
import { RidersService } from './riders.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { UpdateRiderProfileDto } from './dto/update-rider-profile.dto.js';
import { UpdateRiderStatusDto } from './dto/update-rider-status.dto.js';

@Controller('rider')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RIDER)
export class RidersController {
  constructor(private readonly ridersService: RidersService) {}

  @Get('me')
  async getProfile(@Request() req: any) {
    const profile = await this.ridersService.getProfile(req.user.sub);
    return { success: true, data: profile };
  }

  @Patch('me')
  async updateProfile(@Request() req: any, @Body() dto: UpdateRiderProfileDto) {
    const profile = await this.ridersService.updateProfile(req.user.sub, dto);
    return { success: true, data: profile };
  }

  @Get('me/status')
  async getStatus(@Request() req: any) {
    const profile = await this.ridersService.getProfile(req.user.sub);
    return {
      success: true,
      data: {
        kycStatus: profile.kycStatus,
        availabilityStatus: profile.availabilityStatus,
        version: profile.version,
      },
    };
  }

  @Post('me/status')
  async updateStatus(@Request() req: any, @Body() dto: UpdateRiderStatusDto) {
    const result = await this.ridersService.updateAvailability(req.user.sub, dto, true); // true = isClientRequest
    return { success: true, data: result };
  }
}
