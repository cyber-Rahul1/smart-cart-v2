import { Controller, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ProductsService } from '../services/products.service.js';
import { CreateProductDto, UpdateProductDto, UpdateProductStatusDto } from '../dto/products.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { UserRole } from '../../users/enums/user-role.enum.js';
import { CheckOwnership, OwnershipGuard } from '../../auth/guards/ownership.guard.js';
import { Shop } from '../../shops/entities/shop.entity.js';

@Controller('shopkeeper/shops/:shopId/products')
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles(UserRole.SHOPKEEPER)
@CheckOwnership({ entity: Shop, param: 'shopId', userField: 'ownerId' })
export class ShopkeeperProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  async createProduct(@Req() req: any, @Param('shopId') shopId: string, @Body() dto: CreateProductDto) {
    return this.productsService.createProduct(req.user.sub, shopId, dto);
  }

  @Patch(':productId')
  async updateProduct(@Req() req: any, @Param('shopId') shopId: string, @Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.productsService.updateProduct(req.user.sub, shopId, productId, dto);
  }

  @Patch(':productId/status')
  async updateProductStatus(@Req() req: any, @Param('shopId') shopId: string, @Param('productId') productId: string, @Body() dto: UpdateProductStatusDto) {
    return this.productsService.updateProductStatus(req.user.sub, shopId, productId, dto);
  }
}
