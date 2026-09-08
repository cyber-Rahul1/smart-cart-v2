import { IsString, IsOptional, IsNumber, IsEnum, Min, Max, IsBoolean, IsArray, ValidateNested, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShopStatus } from '../enums/shop-status.enum.js';

export class LocationDto {
  @ApiProperty({ example: -122.4194 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: 37.7749 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;
}

export class CreateShopDto {
  @ApiProperty({ example: 'My Awesome Shop' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'The best shop in town' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  banner?: string;

  @ApiPropertyOptional({ default: 5000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  deliveryRadius?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumOrder?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  preparationTime?: number;
}

export class UpdateShopDto {
  @ApiPropertyOptional({ example: 'My Awesome Shop' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'The best shop in town' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  @IsOptional()
  location?: LocationDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  banner?: string;

  @ApiPropertyOptional({ default: 5000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  deliveryRadius?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumOrder?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  preparationTime?: number;
}

export class UpdateShopStatusDto {
  @ApiProperty({ enum: ShopStatus, example: ShopStatus.ACTIVE })
  @IsEnum(ShopStatus)
  status: ShopStatus;
}

export class ShopHoursDto {
  @ApiProperty({ example: 1, description: '0=Sunday, 6=Saturday' })
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00:00' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, { message: 'openTime must be in HH:mm:ss format' })
  openTime: string;

  @ApiProperty({ example: '18:00:00' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, { message: 'closeTime must be in HH:mm:ss format' })
  closeTime: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isClosed: boolean;
}

export class UpdateShopHoursDto {
  @ApiProperty({ type: [ShopHoursDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopHoursDto)
  hours: ShopHoursDto[];
}
