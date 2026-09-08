import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+1234567890', description: 'The phone number to send OTP to' })
  @IsString()
  @IsNotEmpty()
  // Basic E.164 validation (can be stricter depending on region)
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Phone number must be a valid E.164 format' })
  phoneNumber: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Phone number must be a valid E.164 format' })
  phoneNumber: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'iOS' })
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiPropertyOptional({ example: 'device-uuid' })
  @IsString()
  @IsOptional()
  deviceId?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'raw-refresh-token-string' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @ApiProperty({ example: 'session-device-id' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
