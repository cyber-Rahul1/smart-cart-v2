import { IsString, IsOptional, IsNumber, Min, Max, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'The display name of the customer' })
  @IsString()
  @IsOptional()
  name?: string;
}

export class CreateAddressDto {
  @ApiProperty({ description: 'A label for the address, e.g., Home, Work' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ description: 'The full physical address line' })
  @IsString()
  @IsNotEmpty()
  addressLine: string;

  @ApiProperty({ description: 'Latitude between -90 and 90' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ description: 'Longitude between -180 and 180' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
