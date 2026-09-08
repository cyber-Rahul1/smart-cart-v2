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
import { Logger, UseFilters, UsePipes, ValidationPipe, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { TrackingService } from './tracking.service.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { TokenPayload } from '../auth/services/token/token.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from '../logistics/entities/delivery.entity.js';
import { Order } from '../orders/entities/order.entity.js';

// Extend Socket to hold auth info
export interface AuthenticatedSocket extends Socket {
  user: {
    sub: string;
    roles: UserRole[];
    deviceId: string;
  };
}

@WebSocketGateway({
  namespace: '/ws/v1/tracking',
  cors: { origin: '*' },
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);
  private redisSubscriber: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly trackingService: TrackingService,
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async onModuleInit() {
    this.redisSubscriber = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    });

    await this.redisSubscriber.psubscribe('delivery:*:location');

    this.redisSubscriber.on('pmessage', (pattern, channel, message) => {
      try {
        const payload = JSON.parse(message);
        this.server.in(channel).emit('location_update', payload);
      } catch (err) {
        this.logger.error(`Failed to parse redis message: ${(err as Error).message}`);
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
    // Connection drops do NOT auto-offline riders.
  }

  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('update_location')
  async handleLocationUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: any,
  ) {
    // Only RIDER can publish
    if (!client.user.roles.includes(UserRole.RIDER)) {
      client.emit('error', { message: 'Unauthorized. Only riders can publish locations.' });
      return;
    }

    const { lat, lng, riderTimestamp, deliveryId } = data;

    // Basic bounds validation
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      client.emit('error', { message: 'Invalid coordinates' });
      return;
    }

    // Timestamp sanity (no future timestamps)
    if (riderTimestamp > Date.now() + 5000) {
      client.emit('error', { message: 'Timestamp is in the future' });
      return;
    }

    if (deliveryId) {
      const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
      if (!delivery || !['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'].includes(delivery.status)) {
         client.emit('error', { message: 'Delivery is not active' });
         return; // Reject terminal delivery updates
      }
    }

    const result = await this.trackingService.updateLocation({
      riderId: client.user.sub,
      lat,
      lng,
      riderTimestamp,
      deliveryId,
    });

    if (result === 'SUCCESS') {
      client.emit('location_updated', { status: 'SUCCESS' });
    } else if (result === 'STALE') {
      // Discard silently or emit warning
    } else if (result === 'JUMP_REJECTED') {
      this.logger.warn(`Impossible jump rejected for rider ${client.user.sub}`);
      // Metric for anomalous jump could be recorded here
    }
  }

  @SubscribeMessage('subscribe_delivery')
  async handleSubscribeDelivery(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { deliveryId: string },
  ) {
    // Verify ownership of the delivery before joining room
    const delivery = await this.deliveryRepo.findOne({
      where: { id: data.deliveryId },
      relations: {
        order: {
          shop: true
        }
      },
    });

    if (!delivery) {
      client.emit('error', { message: 'Delivery not found' });
      return;
    }

    // Active delivery states
    const activeStates = ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'];
    if (!activeStates.includes(delivery.status)) {
      client.emit('error', { message: 'Delivery is not active' });
      return;
    }

    const user = client.user;
    let isAuthorized = false;

    if (user.roles.includes(UserRole.ADMIN)) {
      isAuthorized = true;
    } else if (user.roles.includes(UserRole.CUSTOMER) && delivery.order.customerId === user.sub) {
      isAuthorized = true;
    } else if (user.roles.includes(UserRole.SHOPKEEPER) && delivery.order.shop.ownerId === user.sub) {
      isAuthorized = true;
    } else if (user.roles.includes(UserRole.RIDER) && delivery.riderId === user.sub) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      client.emit('error', { message: 'Unauthorized to track this delivery' });
      return;
    }

    const room = `delivery:${data.deliveryId}:location`;
    client.join(room);
    client.emit('subscribed', { deliveryId: data.deliveryId });
  }

  @SubscribeMessage('unsubscribe_delivery')
  async handleUnsubscribeDelivery(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { deliveryId: string },
  ) {
    const room = `delivery:${data.deliveryId}:location`;
    client.leave(room);
    client.emit('unsubscribed', { deliveryId: data.deliveryId });
  }

  /**
   * Called by the application when a delivery reaches a terminal state (DELIVERED, FAILED)
   */
  async terminateDeliveryTracking(deliveryId: string) {
    const room = `delivery:${deliveryId}:location`;
    this.server.in(room).emit('tracking_terminated', { deliveryId });
    this.server.in(room).socketsLeave(room); // Force all clients to leave the room
    this.logger.debug(`Terminated tracking for delivery ${deliveryId}`);
  }
}
