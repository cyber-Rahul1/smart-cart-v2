import { Controller, Get, Post, Patch, Put, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ShopsService } from '../services/shops.service.js';
import { CreateShopDto, UpdateShopDto, UpdateShopStatusDto, UpdateShopHoursDto } from '../dto/shops.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { UserRole } from '../../users/enums/user-role.enum.js';
import { CheckOwnership, OwnershipGuard } from '../../auth/guards/ownership.guard.js';
import { Shop } from '../entities/shop.entity.js';

@Controller('shopkeeper/shops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SHOPKEEPER)
export class ShopkeeperShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  async createShop(@Req() req: any, @Body() dto: CreateShopDto) {
    return this.shopsService.createShop(req.user.sub, dto);
  }

  @Get('mine')
  async getMyShops(@Req() req: any) {
    return this.shopsService.getMyShops(req.user.sub);
  }

  @Get(':shopId')
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ entity: Shop, param: 'shopId', userField: 'ownerId' })
  async getShopById(@Param('shopId') shopId: string) {
    return this.shopsService.getShopById(shopId);
  }

  @Patch(':shopId')
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ entity: Shop, param: 'shopId', userField: 'ownerId' })
  async updateShop(@Param('shopId') shopId: string, @Body() dto: UpdateShopDto) {
    return this.shopsService.updateShop(shopId, dto);
  }

  @Post(':shopId/status')
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ entity: Shop, param: 'shopId', userField: 'ownerId' })
  async updateShopStatus(@Req() req: any, @Param('shopId') shopId: string, @Body() dto: UpdateShopStatusDto) {
    return this.shopsService.updateShopStatus(req.user.sub, shopId, dto);
  }

  @Get(':shopId/hours')
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ entity: Shop, param: 'shopId', userField: 'ownerId' })
  async getShopHours(@Param('shopId') shopId: string) {
    return this.shopsService.getShopHours(shopId);
  }

  @Put(':shopId/hours')
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ entity: Shop, param: 'shopId', userField: 'ownerId' })
  async updateShopHours(@Param('shopId') shopId: string, @Body() dto: UpdateShopHoursDto) {
    return this.shopsService.updateShopHours(shopId, dto);
  }
}
