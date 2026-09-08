import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductsService } from './services/products.service.js';
import { ShopkeeperCategoriesController } from './controllers/shopkeeper-categories.controller.js';
import { ShopkeeperProductsController } from './controllers/shopkeeper-products.controller.js';
import { PublicCatalogController } from './controllers/public-catalog.controller.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Product, AuditLog])],
  controllers: [ShopkeeperCategoriesController, ShopkeeperProductsController, PublicCatalogController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
