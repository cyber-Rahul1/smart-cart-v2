import { IsString, IsOptional, IsNumber, IsEnum, Min, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../enums/product-status.enum.js';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Beverages' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Refreshing drinks' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Beverages' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Refreshing drinks' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Cola 500ml' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'd3b07384-d9a1-432a-8b1a-8e2b83b8a1c9' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ example: 'Cold carbonated beverage' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ example: 1.99 })
  @IsNumber()
  @Min(0)
  price: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Cola 500ml' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'd3b07384-d9a1-432a-8b1a-8e2b83b8a1c9' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Cold carbonated beverage' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ example: 1.99 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;
}

export class UpdateProductStatusDto {
  @ApiProperty({ enum: ProductStatus, example: ProductStatus.OUT_OF_STOCK })
  @IsEnum(ProductStatus)
  status: ProductStatus;
}
