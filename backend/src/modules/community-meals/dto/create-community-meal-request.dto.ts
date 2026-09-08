import { IsString, IsNumber, IsNotEmpty, Min, Max, IsDateString, IsOptional } from 'class-validator';

export class CreateCommunityMealRequestDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsNotEmpty()
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsNotEmpty()
  lng: number;

  @IsString()
  @IsNotEmpty()
  mealType: string;

  @IsString()
  @IsNotEmpty()
  cuisine: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsNotEmpty()
  budgetMin: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsNotEmpty()
  budgetMax: number;

  @IsDateString()
  @IsNotEmpty()
  timeWindowStart: string;

  @IsDateString()
  @IsNotEmpty()
  timeWindowEnd: string;

  @IsString()
  @IsOptional()
  dietaryRestrictions?: string;

  @IsString()
  @IsOptional()
  spiceLevel?: string;
}
