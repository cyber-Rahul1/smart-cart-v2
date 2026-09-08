import { Controller, Post, Headers, Request, BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { PaymentsService } from './payments.service.js';
import { WebhooksService } from './webhooks.service.js';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly webhooksService: WebhooksService,
  ) {}

  @Post('razorpay')
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event-id') eventId: string,
    @Request() req: RawBodyRequest<ExpressRequest>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing signature');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    // Pass the raw payload buffer to the service for verification
    await this.webhooksService.processWebhook(signature, eventId, rawBody, req.body);
    return { status: 'ok' };
  }
}
