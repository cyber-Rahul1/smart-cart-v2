import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from './core/config/config.module.js';
import { ConfigService, ConfigModule as NestConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module.js';
import { RedisModule } from './core/redis/redis.module.js';
import { QueueModule } from './core/queue/queue.module.js';
import { WebSocketModule } from './core/websocket/websocket.module.js';
import { HealthModule } from './core/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { RidersModule } from './modules/riders/riders.module.js';
import { LogisticsModule } from './modules/logistics/logistics.module.js';
import { ShopsModule } from './modules/shops/shops.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { CartsModule } from './modules/carts/carts.module.js';
import { CheckoutModule } from './modules/checkout/checkout.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { TrackingModule } from './modules/tracking/tracking.module.js';
import { ScheduleModule } from '@nestjs/schedule';

import { OutboxModule } from './modules/outbox/outbox.module.js';
import { ShopkeeperOrdersModule } from './modules/shopkeeper-orders/shopkeeper-orders.module.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { AppThrottlerGuard } from './core/guards/app-throttler.guard.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.otp', 'body.token', 'req.headers["x-razorpay-signature"]'],
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL', 60000), // 60 seconds
            limit: Number(config.get('THROTTLE_LIMIT', 100)), // 100 requests per minute by default
          },
        ],
        storage: new ThrottlerStorageRedisService({
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
          keyPrefix: 'rate-limit:',
        }),
      }),
    }),
    ConfigModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    WebSocketModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RidersModule,
    LogisticsModule,
    NotificationsModule,
    SearchModule,
    TrackingModule,
    ShopsModule,
    ProductsModule,
    CartsModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    OutboxModule,
    ShopkeeperOrdersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
