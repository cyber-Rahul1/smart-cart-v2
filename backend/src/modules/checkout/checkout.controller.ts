import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutPreviewRequestDto, CheckoutQuoteDto } from './dto/checkout.dto.js';

@ApiTags('Checkout')
@Controller('checkout')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('preview')
  @Roles(UserRole.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview checkout quote for the current cart and selected address' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Checkout quote generated', type: CheckoutQuoteDto })
  async previewCheckout(@Request() req: any, @Body() dto: CheckoutPreviewRequestDto) {
    return this.checkoutService.prepareCheckout(req.user.sub, dto);
  }
}
