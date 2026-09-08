import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum PushProviderType {
  FCM = 'FCM',
  APNS = 'APNS',
}

export class UpdatePushTokenDto {
  @ApiProperty({ example: 'fcm-token-123', description: 'The push token from the provider' })
  @IsString()
  @IsNotEmpty()
  pushToken: string;

  @ApiProperty({ enum: PushProviderType, example: PushProviderType.FCM, description: 'The provider type' })
  @IsEnum(PushProviderType)
  pushProvider: PushProviderType;
}
