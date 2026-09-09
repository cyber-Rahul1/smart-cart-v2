import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger, UseFilters, UsePipes, ValidationPipe, OnModuleInit, OnModuleDestroy, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { UserRole } from '../../users/enums/user-role.enum.js';
import { TokenPayload } from '../../auth/services/token/token.service.js';
import { CommunityMealMessagesService } from '../services/community-meal-messages.service.js';
import { CommunityMealConversationService } from '../services/community-meal-conversation.service.js';
import { WsRateLimitService } from '../services/ws-rate-limit.service.js';

export interface AuthenticatedSocket extends Socket {
  user: {
    sub: string;
    roles: UserRole[];
    deviceId: string;
  };
}

@WebSocketGateway({
  namespace: '/ws/v1/community-meals',
  cors: { origin: '*' },
})
export class CommunityMealGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CommunityMealGateway.name);
  private redisSubscriber: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly messagesService: CommunityMealMessagesService,
    private readonly conversationService: CommunityMealConversationService,
    private readonly rateLimitService: WsRateLimitService,
  ) {}

  async onModuleInit() {
    this.redisSubscriber = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    });

    await this.redisSubscriber.subscribe('community-meals:events');

    this.redisSubscriber.on('message', (channel, message) => {
      if (channel === 'community-meals:events') {
        try {
          const { type, allocationId, payload } = JSON.parse(message);
          this.server.in(`allocation_${allocationId}`).emit(type, payload);
        } catch (err) {
          this.logger.error(`Failed to parse redis message: ${(err as Error).message}`);
        }
      }
    });
  }

  async onModuleDestroy() {
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
    }
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.query?.token as string);
        
      if (!token) {
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET', 'super-secret-default-key-do-not-use-in-prod');
      const payload = this.jwtService.verify<TokenPayload>(token, { secret });
      
      client.user = {
        sub: payload.sub,
        roles: payload.roles as UserRole[],
        deviceId: payload.deviceId,
      };

      this.logger.debug(`Client connected: ${client.id} user: ${payload.sub}`);
    } catch (error) {
      this.logger.error(`WebSocket authentication failed for client ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  private handleError(client: AuthenticatedSocket, error: any) {
    const message = error.message || 'An unexpected error occurred.';
    let code = 'INTERNAL_ERROR';

    if (error.name === 'ForbiddenException' || message.includes('Unauthorized')) {
      code = 'UNAUTHORIZED_ALLOCATION';
    } else if (error.name === 'NotFoundException' || message.includes('not found')) {
      code = 'INVALID_UUID';
    } else if (message.includes('READ_ONLY')) {
      code = 'READ_ONLY';
    } else if (error.name === 'ConflictException' || message.includes('Idempotency')) {
      code = 'DUPLICATE_IDEMPOTENCY';
    } else if (message.includes('Rate limit')) {
      code = 'RATE_LIMIT_EXCEEDED';
    } else if (message.includes('must be a UUID')) {
      code = 'INVALID_UUID';
    } else if (error.name === 'BadRequestException' || error.status === 400) {
      code = 'INVALID_PAYLOAD';
    }

    client.emit('error', { code, message });
  }

  @SubscribeMessage('subscribe_allocation')
  async handleSubscribeAllocation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { allocationId: string },
  ) {
    try {
      if (!data || !data.allocationId) {
        throw new Error('Payload missing required fields.');
      }

      const isAllowed = await this.rateLimitService.checkLimit(client.user.sub, 'subscribe', 10, 60);
      if (!isAllowed) {
        throw new Error('Rate limit exceeded');
      }

      await this.conversationService.verifyAccess(data.allocationId, client.user.sub);

      const room = `allocation_${data.allocationId}`;
      client.join(room);
      client.emit('subscribed', { allocationId: data.allocationId });
    } catch (error) {
      this.handleError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { allocationId: string; content: string; idempotencyKey?: string },
  ) {
    try {
      if (!data || !data.allocationId || !data.content) {
        throw new Error('Payload missing required fields.');
      }

      const isAllowed = await this.rateLimitService.checkLimit(client.user.sub, 'send_message', 5, 10);
      if (!isAllowed) {
        throw new Error('Rate limit exceeded');
      }

      // The service validates the allocation, conversation, and persists the message
      const message = await this.messagesService.sendMessage(
        client.user.sub,
        data.allocationId,
        data.content,
        data.idempotencyKey
      );

      // We do NOT emit `new_message` here directly. 
      // The messagesService is responsible for publishing the event to Redis, 
      // which will be caught by our subscriber and broadcast to the room.
      
      // We can emit a specific ack to the sender if needed, but not strictly required
      client.emit('message_sent', { id: message.id, idempotencyKey: data.idempotencyKey });
    } catch (error) {
      this.handleError(client, error);
    }
  }
}
