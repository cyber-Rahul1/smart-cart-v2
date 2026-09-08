import { IsEnum, IsNumber, IsNotEmpty } from 'class-validator';
import { RiderAvailabilityStatus } from '../../users/enums/rider-availability-status.enum.js';

export class UpdateRiderStatusDto {
  @IsEnum(RiderAvailabilityStatus)
  @IsNotEmpty()
  status: RiderAvailabilityStatus;

  @IsNumber()
  @IsNotEmpty()
  version: number;
}
