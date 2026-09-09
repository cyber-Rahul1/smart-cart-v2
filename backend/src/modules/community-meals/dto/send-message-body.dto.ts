import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for POST .../conversation/messages
 *
 * Deliberately contains ONLY the message content.
 * senderId / senderRole / userId / shopId are derived server-side from req.user.sub.
 * idempotencyKey is read from the x-idempotency-key HTTP header, not from the body.
 */
export class SendMessageBodyDto {
  @ApiProperty({
    description: 'Text content of the message. Maximum 2000 characters.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
