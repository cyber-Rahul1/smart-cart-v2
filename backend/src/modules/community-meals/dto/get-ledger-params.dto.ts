import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetLedgerParamsDto {
  @ApiProperty({ description: 'UUID of the meal allocation', format: 'uuid' })
  @IsUUID()
  allocationId: string;
}
