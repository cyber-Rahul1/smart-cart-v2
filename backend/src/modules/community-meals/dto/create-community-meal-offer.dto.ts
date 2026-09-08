import { IsString, IsNumber, IsNotEmpty, Min, Max, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class CreateCommunityMealOfferDto {
  @IsUUID()
  @IsNotEmpty()
  clusterId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsNotEmpty()
  pricePerServing: number;

  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  minQuantity: number;

  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  maxQuantity: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  menuDescription: string;
}
