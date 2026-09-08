import { Controller, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ProductsService } from '../services/products.service.js';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/products.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { UserRole } from '../../users/enums/user-role.enum.js';
import { CheckOwnership, OwnershipGuard } from '../../auth/guards/ownership.guard.js';
import { Shop } from '../../shops/entities/shop.entity.js';

@Controller('shopkeeper/shops/:shopId/categories')
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles(UserRole.SHOPKEEPER)
@CheckOwnership({ entity: Shop, param: 'shopId', userField: 'ownerId' })
export class ShopkeeperCategoriesController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  async createCategory(@Param('shopId') shopId: string, @Body() dto: CreateCategoryDto) {
    return this.productsService.createCategory(shopId, dto);
  }

  @Patch(':categoryId')
  async updateCategory(@Param('shopId') shopId: string, @Param('categoryId') categoryId: string, @Body() dto: UpdateCategoryDto) {
    return this.productsService.updateCategory(shopId, categoryId, dto);
  }

  @Delete(':categoryId')
  async deleteCategory(@Param('shopId') shopId: string, @Param('categoryId') categoryId: string) {
    await this.productsService.deleteCategory(shopId, categoryId);
    return { success: true };
  }
}
