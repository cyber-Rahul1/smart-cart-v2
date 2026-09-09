import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { CommunityMealGateway } from '../gateways/community-meal.gateway.js';
import { CommunityMealMessagesService } from '../services/community-meal-messages.service.js';
import { CommunityMealConversationService } from '../services/community-meal-conversation.service.js';
import { WsRateLimitService } from '../services/ws-rate-limit.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('WebSocket Integration', () => {
  let gateway: CommunityMealGateway;
  let messagesService: any;
  let conversationService: any;
  let rateLimitService: any;

  beforeEach(async () => {
    messagesService = { sendMessage: vi.fn() } as any;
    conversationService = { verifyAccess: vi.fn() } as any;
    rateLimitService = { checkLimit: vi.fn().mockResolvedValue(true) } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityMealGateway,
        { provide: CommunityMealMessagesService, useValue: messagesService },
        { provide: CommunityMealConversationService, useValue: conversationService },
        { provide: WsRateLimitService, useValue: rateLimitService },
        { provide: JwtService, useValue: { verify: vi.fn() } },
        { provide: ConfigService, useValue: { get: vi.fn() } },
      ],
    }).compile();

    gateway = module.get<CommunityMealGateway>(CommunityMealGateway);
  });

  const makeClient = () => ({
    id: 'socket1',
    user: { sub: 'u1', roles: ['CUSTOMER'] },
    join: vi.fn(),
    emit: vi.fn(),
  } as any);

  it('subscribe_allocation enforces DB authorization', async () => {
    const client = makeClient();
    conversationService.verifyAccess.mockResolvedValue({ role: 'CUSTOMER' });

    await gateway.handleSubscribeAllocation(client, { allocationId: 'alloc1' });
    expect(conversationService.verifyAccess).toHaveBeenCalledWith('alloc1', 'u1');
    expect(client.join).toHaveBeenCalledWith('allocation_alloc1');
  });

  it('unauthorized subscribe is rejected', async () => {
    const client = makeClient();
    conversationService.verifyAccess.mockRejectedValue(new Error('Unauthorized'));

    await gateway.handleSubscribeAllocation(client, { allocationId: 'alloc1' });
    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'UNAUTHORIZED_ALLOCATION' }));
    expect(client.join).not.toHaveBeenCalled();
  });

  it('send_message strictly passes payload and delegates event publishing', async () => {
    const client = makeClient();
    messagesService.sendMessage.mockResolvedValue({ id: 'msg1' } as any);

    await gateway.handleSendMessage(client, { allocationId: 'a1', content: 'hello' });
    expect(messagesService.sendMessage).toHaveBeenCalledWith('u1', 'a1', 'hello', undefined);
    expect(client.emit).toHaveBeenCalledWith('message_sent', { id: 'msg1', idempotencyKey: undefined });
  });

  it('rate limit exceeded rejects message', async () => {
    const client = makeClient();
    rateLimitService.checkLimit.mockResolvedValue(false);

    await gateway.handleSendMessage(client, { allocationId: 'a1', content: 'hello' });
    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }));
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
  });
});
