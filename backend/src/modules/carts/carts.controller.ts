import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CartsService } from './carts.service.js';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user-role.enum.js';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user\'s cart' })
  @ApiResponse({ status: 200, description: 'Cart with current prices and totals. Calculated server-side.' })
  async getCart(@Request() req: any) {
    const data = await this.cartsService.getCart(req.user.sub);
    return { success: true, data };
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a product to the cart' })
  @ApiResponse({ status: 201, description: 'Item added. Cart shop is established on first item.' })
  @ApiResponse({ status: 400, description: 'Product unavailable or quantity invalid.' })
  @ApiResponse({ status: 409, description: 'Cart already belongs to a different shop. Clear cart first.' })
  async addItem(@Request() req: any, @Body() dto: AddToCartDto) {
    const data = await this.cartsService.addItem(req.user.sub, dto);
    return { success: true, data };
  }

  @Patch('items/:cartItemId')
  @ApiOperation({ summary: 'Update quantity of a cart item. Setting quantity to 0 removes the item.' })
  @ApiResponse({ status: 200, description: 'Quantity updated.' })
  @ApiResponse({ status: 404, description: 'Cart item not found or does not belong to user.' })
  async updateItemQuantity(
    @Request() req: any,
    @Param('cartItemId') cartItemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const data = await this.cartsService.updateItemQuantity(req.user.sub, cartItemId, dto);
    return { success: true, data };
  }

  @Delete('items/:cartItemId')
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiResponse({ status: 200, description: 'Item removed.' })
  @ApiResponse({ status: 404, description: 'Cart item not found or does not belong to user.' })
  async removeItem(@Request() req: any, @Param('cartItemId') cartItemId: string) {
    const data = await this.cartsService.removeItem(req.user.sub, cartItemId);
    return { success: true, data };
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the cart and reset shop association' })
  @ApiResponse({ status: 200, description: 'Cart cleared.' })
  async clearCart(@Request() req: any) {
    const data = await this.cartsService.clearCart(req.user.sub);
    return { success: true, data };
  }
}
