import { Controller, Get, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../audit/entities/notification.entity.js';
import { NotificationStatus } from '../audit/enums/notification-status.enum.js';

@Controller('customers/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class NotificationsController {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  @Get()
  async getNotifications(@Req() req: any) {
    const notifications = await this.notificationRepo.find({
      where: { userId: req.user.sub },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return {
      success: true,
      data: notifications,
    };
  }

  @Patch(':id/read')
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const notification = await this.notificationRepo.findOne({
      where: { id, userId: req.user.sub },
    });
    if (notification) {
      notification.status = NotificationStatus.READ;
      await this.notificationRepo.save(notification);
    }
    return { success: true };
  }
}
