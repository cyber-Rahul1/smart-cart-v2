import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity.js';
import { Product } from '../entities/product.entity.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { CreateCategoryDto, UpdateCategoryDto, CreateProductDto, UpdateProductDto, UpdateProductStatusDto } from '../dto/products.dto.js';
import { ProductStatus } from '../enums/product-status.enum.js';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  // ==========================
  // CATEGORIES
  // ==========================

  async createCategory(shopId: string, dto: CreateCategoryDto): Promise<Category> {
    const category = this.categoryRepo.create({
      shopId,
      name: dto.name,
      description: dto.description,
    });
    return this.categoryRepo.save(category);
  }

  async updateCategory(shopId: string, categoryId: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId, shopId } });
    if (!category) throw new NotFoundException('Category not found for this shop');

    if (dto.name !== undefined) category.name = dto.name;
    if (dto.description !== undefined) category.description = dto.description;

    return this.categoryRepo.save(category);
  }

  async deleteCategory(shopId: string, categoryId: string): Promise<void> {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId, shopId } });
    if (!category) throw new NotFoundException('Category not found for this shop');
    
    // Check if products exist before hard deleting, or rely on RESTRICT foreign key
    // The DB will throw an error if we try to delete a category that has products (onDelete: 'RESTRICT')
    // To handle gracefully:
    const productsCount = await this.productRepo.count({ where: { categoryId } });
    if (productsCount > 0) {
      throw new BadRequestException('Cannot delete category with existing products');
    }

    await this.categoryRepo.softDelete(categoryId);
  }

  async getPublicCategories(shopId: string): Promise<Category[]> {
    return this.categoryRepo.find({ where: { shopId } });
  }

  // ==========================
  // PRODUCTS
  // ==========================

  async createProduct(userId: string, shopId: string, dto: CreateProductDto): Promise<Product> {
    // Assert category belongs to the shop
    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId, shopId } });
    if (!category) {
      throw new ForbiddenException('Category does not exist in this shop');
    }

    const product = this.productRepo.create({
      shopId,
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description,
      image: dto.image,
      price: dto.price,
      status: ProductStatus.AVAILABLE,
    });

    const savedProduct = await this.productRepo.save(product);

    await this.auditLogRepo.save({
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: savedProduct.id,
      performedBy: userId,
      newState: { name: savedProduct.name, price: savedProduct.price },
    });

    return savedProduct;
  }

  async updateProduct(userId: string, shopId: string, productId: string, dto: UpdateProductDto): Promise<Product> {
    // We enforce the shop boundary here as well. This prevents cross-shop ID substitution.
    const product = await this.productRepo.findOne({ where: { id: productId, shopId } });
    if (!product) throw new NotFoundException('Product not found for this shop');

    if (dto.categoryId !== undefined) {
      const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId, shopId } });
      if (!category) {
        throw new ForbiddenException('Category does not exist in this shop');
      }
      product.categoryId = dto.categoryId;
    }

    const oldPrice = product.price;

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.image !== undefined) product.image = dto.image;
    if (dto.price !== undefined) product.price = dto.price;

    const savedProduct = await this.productRepo.save(product);

    if (oldPrice !== savedProduct.price) {
      await this.auditLogRepo.save({
        action: 'PRODUCT_PRICE_CHANGED',
        entityType: 'Product',
        entityId: savedProduct.id,
        performedBy: userId,
        previousState: { price: oldPrice },
        newState: { price: savedProduct.price },
      });
    }

    return savedProduct;
  }

  async updateProductStatus(userId: string, shopId: string, productId: string, dto: UpdateProductStatusDto): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id: productId, shopId } });
    if (!product) throw new NotFoundException('Product not found for this shop');

    product.status = dto.status;
    return this.productRepo.save(product);
  }

  async getPublicProducts(shopId: string): Promise<Product[]> {
    // Hide DISCONTINUED products
    return this.productRepo.createQueryBuilder('product')
      .where('product.shopId = :shopId', { shopId })
      .andWhere('product.status IN (:...statuses)', { statuses: [ProductStatus.AVAILABLE, ProductStatus.OUT_OF_STOCK] })
      .getMany();
  }
}
