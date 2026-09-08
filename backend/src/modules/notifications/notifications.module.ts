import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Notification } from '../audit/entities/notification.entity.js';
import { Device } from '../users/entities/device.entity.js';
import { NotificationService } from '../audit/services/notification.service.js';
import { MockNotificationProvider } from '../audit/providers/mock-notification.provider.js';
import { NOTIFICATION_PROVIDER } from '../audit/providers/notification-provider.interface.js';
import { NotificationsController } from './notifications.controller.js';
import { PushDispatchService } from './services/push-dispatch.service.js';
import { PushPayloadBuilder } from './services/push-payload.builder.js';
import { PUSH_NOTIFICATION_PROVIDER } from './providers/push-provider.interface.js';
import { MockPushProvider } from './providers/mock-push.provider.js';
import { FcmPushProvider } from './providers/fcm-push.provider.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Device]),
    ConfigModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    {
      provide: NOTIFICATION_PROVIDER,
      useClass: MockNotificationProvider,
    },
    PushPayloadBuilder,
    PushDispatchService,
    {
      provide: PUSH_NOTIFICATION_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('PUSH_PROVIDER', 'mock');
        return provider === 'fcm' ? new FcmPushProvider() : new MockPushProvider();
      },
    },
  ],
  exports: [NotificationService, PushDispatchService],
})
export class NotificationsModule {}
