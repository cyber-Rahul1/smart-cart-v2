import { Controller, Get, Post, Param, Query, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ShopkeeperOrdersService } from './shopkeeper-orders.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { CheckOwnership, OwnershipGuard } from '../auth/guards/ownership.guard.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { OrderStatus } from '../orders/enums/order-status.enum.js';

@ApiTags('Shopkeeper Orders')
@ApiBearerAuth()
@Controller('shopkeeper/shops/:shopId/orders')
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles(UserRole.SHOPKEEPER)
@CheckOwnership({ entity: Shop, param: 'shopId', userField: 'ownerId' })
export class ShopkeeperOrdersController {
  constructor(private readonly shopkeeperOrdersService: ShopkeeperOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders for a shop' })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of orders for the shop' })
  async getOrders(
    @Req() req: any,
    @Param('shopId') shopId: string,
    @Query('status') status?: OrderStatus,
  ) {
    const data = await this.shopkeeperOrdersService.getOrders(req.user.sub, shopId, status);
    return { success: true, data };
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order details' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order details' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Order not found' })
  async getOrder(
    @Req() req: any,
    @Param('shopId') shopId: string,
    @Param('orderId') orderId: string,
  ) {
    const data = await this.shopkeeperOrdersService.getOrder(req.user.sub, shopId, orderId);
    return { success: true, data };
  }

  @Post(':orderId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an order' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order accepted' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid state transition' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Concurrency conflict' })
  async acceptOrder(
    @Req() req: any,
    @Param('shopId') shopId: string,
    @Param('orderId') orderId: string,
  ) {
    const data = await this.shopkeeperOrdersService.acceptOrder(req.user.sub, shopId, orderId);
    return { success: true, data };
  }

  @Post(':orderId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an order' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order rejected' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid state transition' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Concurrency conflict' })
  async rejectOrder(
    @Req() req: any,
    @Param('shopId') shopId: string,
    @Param('orderId') orderId: string,
    @Body('reason') reason?: string,
  ) {
    const data = await this.shopkeeperOrdersService.rejectOrder(req.user.sub, shopId, orderId, reason);
    return { success: true, data };
  }

  @Post(':orderId/preparing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order as being prepared' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order is now being prepared' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid state transition' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Concurrency conflict' })
  async prepareOrder(
    @Req() req: any,
    @Param('shopId') shopId: string,
    @Param('orderId') orderId: string,
  ) {
    const data = await this.shopkeeperOrdersService.prepareOrder(req.user.sub, shopId, orderId);
    return { success: true, data };
  }

  @Post(':orderId/ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order as ready for pickup' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order is ready for pickup, dispatch triggered' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid state transition' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Concurrency conflict' })
  async readyOrder(
    @Req() req: any,
    @Param('shopId') shopId: string,
    @Param('orderId') orderId: string,
  ) {
    const data = await this.shopkeeperOrdersService.readyOrder(req.user.sub, shopId, orderId);
    return { success: true, data };
  }
}
