import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import type { IPushNotificationProvider } from '../providers/push-provider.interface.js';
import { PUSH_NOTIFICATION_PROVIDER, InvalidTokenError } from '../providers/push-provider.interface.js';
import { PushPayloadBuilder } from './push-payload.builder.js';
import { Device } from '../../users/entities/device.entity.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';

@Injectable()
export class PushDispatchService {
  private readonly logger = new Logger(PushDispatchService.name);

  constructor(
    @Inject(PUSH_NOTIFICATION_PROVIDER)
    private readonly pushProvider: IPushNotificationProvider,
    private readonly payloadBuilder: PushPayloadBuilder,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Dispatches a push notification to all active devices for a given user.
   * Gracefully handles and cleans up invalid push tokens.
   */
  async dispatchToUser(userId: string, eventType: string, entityId: string): Promise<void> {
    const devices = await this.deviceRepository.find({
      where: { userId, isRevoked: false },
      select: { id: true, pushToken: true, pushProvider: true, userId: true },
    });

    const activePushDevices = devices.filter(d => d.pushToken);
    
    if (activePushDevices.length === 0) {
      this.logger.debug(`No active push devices found for user ${userId}`);
      return;
    }

    const payload = this.payloadBuilder.buildPayload(eventType, entityId);
    
    // Dispatch to all devices concurrently
    const dispatchPromises = activePushDevices.map(async (device) => {
      try {
        await this.pushProvider.sendToDevice(device.pushToken as string, payload);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          this.logger.warn(`Invalid push token detected for device ${device.id}. Deactivating token.`);
          await this.deactivateInvalidToken(device.id);
        } else {
          this.logger.error(`Failed to send push to device ${device.id}`, error);
          throw error; // Re-throw transient errors so BullMQ handles backoff/retries
        }
      }
    });

    // Wait for all dispatches. Use Promise.allSettled to not fail the whole batch
    // if one specific provider call throws a transient error, but we want the outer job to retry
    // so we'll throw if any rejected with a transient error.
    const results = await Promise.allSettled(dispatchPromises);
    const rejections = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    
    if (rejections.length > 0) {
      this.logger.error(`Failed to dispatch to some devices: ${rejections.map(r => r.reason?.message).join(', ')}`);
      throw rejections[0].reason; // Bubble up first error for retry
    }
  }

  private async deactivateInvalidToken(deviceId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const device = await manager.findOne(Device, { where: { id: deviceId } });
      if (device) {
        device.pushToken = null;
        device.pushProvider = null;
        await manager.save(Device, device);

        await manager.save(AuditLog, {
          action: 'DEVICE_PUSH_TOKEN_INVALIDATED',
          entityType: 'Device',
          entityId: device.id,
          performedBy: 'SYSTEM',
        });
      }
    });
  }
}
