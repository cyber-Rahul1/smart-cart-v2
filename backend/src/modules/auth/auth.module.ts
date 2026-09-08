import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { AuthController } from './auth.controller.js';
import { AuthService } from './services/auth/auth.service.js';
import { TokenService } from './services/token/token.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { PHONE_VERIFICATION_PROVIDER } from './providers/phone-verification.provider.js';
import { TwilioVerificationProvider } from './providers/twilio-verification.provider.js';
import { MockVerificationProvider } from './providers/mock-verification.provider.js';
import { User } from '../users/entities/user.entity.js';
import { Device } from '../users/entities/device.entity.js';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([User, Device]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'super-secret-default-key-do-not-use-in-prod'),
        signOptions: { expiresIn: configService.get<string>('JWT_ACCESS_EXPIRATION', '15m') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    {
      provide: PHONE_VERIFICATION_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const useMockVal = configService.get('USE_MOCK_TWILIO');
        const useMock = useMockVal === true || useMockVal === 'true';
        const isProduction = configService.get<string>('NODE_ENV') === 'production';
        if (useMock && !isProduction) {
          return new MockVerificationProvider();
        }
        return new TwilioVerificationProvider(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
