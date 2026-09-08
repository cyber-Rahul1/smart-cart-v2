import { Controller, Get, Post, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto, OrderResponseDto } from './dto/orders.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user-role.enum.js';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new order from the current cart' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Order successfully created', type: OrderResponseDto })
  async createOrder(@Request() req: any, @Body() dto: CreateOrderDto) {
    const data = await this.ordersService.createOrder(req.user.sub, dto);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders for the current user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of orders', type: [OrderResponseDto] })
  async getOrders(@Request() req: any) {
    const data = await this.ordersService.getOrders(req.user.sub);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific order by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order details', type: OrderResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Order not found or does not belong to user' })
  async getOrder(@Request() req: any, @Param('id') id: string) {
    const data = await this.ordersService.getOrder(req.user.sub, id);
    return { success: true, data };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order before it is prepared' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order successfully cancelled', type: OrderResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Order cannot be cancelled in its current state' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Concurrency conflict occurred, try again' })
  async cancelOrder(@Request() req: any, @Param('id') id: string, @Body('reason') reason?: string) {
    const data = await this.ordersService.cancelOrder(req.user.sub, id, reason);
    return { success: true, data };
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a review for a delivered order' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Review successfully submitted' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Order not in DELIVERED state' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Order already reviewed' })
  async addReview(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { shopRating?: number; riderRating?: number; comment?: string }
  ) {
    await this.ordersService.addReview(req.user.sub, id, dto);
    return { success: true };
  }
}
