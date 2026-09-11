import { Controller, Post, Headers, Request, BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { PayoutWebhooksService } from '../services/payout-webhooks.service.js';

@Controller('v1/webhooks/payouts')
export class PayoutWebhooksController {
  constructor(private readonly payoutWebhooksService: PayoutWebhooksService) {}

  @Post()
  async handleWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Request() req: RawBodyRequest<ExpressRequest>,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    await this.payoutWebhooksService.processWebhook(headers, rawBody, req.body);
    return { status: 'ok' };
  }
}
