import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateRiderProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  vehicleType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  vehicleRegistration?: string;
}
