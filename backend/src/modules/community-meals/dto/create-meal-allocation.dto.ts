import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMealAllocationDto {
  @ApiProperty({ description: 'The ID of the community meal offer to allocate' })
  @IsUUID()
  @IsNotEmpty()
  offerId: string;
}
