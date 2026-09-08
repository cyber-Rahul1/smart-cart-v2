import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from '../services/products.service.js';

@Controller('shops/:shopId')
export class PublicCatalogController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('categories')
  async getCategories(@Param('shopId') shopId: string) {
    const categories = await this.productsService.getPublicCategories(shopId);
    return {
      success: true,
      data: categories,
    };
  }

  @Get('products')
  async getProducts(@Param('shopId') shopId: string) {
    const products = await this.productsService.getPublicProducts(shopId);
    return {
      success: true,
      data: products,
    };
  }
}
