import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetConversationParamsDto {
  @ApiProperty({ description: 'UUID of the meal allocation', format: 'uuid' })
  @IsUUID()
  allocationId: string;
}
