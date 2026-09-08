import { Controller, Post, Param, Body, Headers, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { Throttle } from '@nestjs/throttler';

@Controller('orders')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':id/payment')
  @UseGuards(JwtAuthGuard)
  async initiatePayment(
    @Param('id') orderId: string,
    @Body() dto: InitiatePaymentDto,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Request() req: any,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('x-idempotency-key header is required');
    }

    const customerId = req.user.sub;
    return this.paymentsService.initiatePayment(orderId, customerId, dto, idempotencyKey);
  }
}
