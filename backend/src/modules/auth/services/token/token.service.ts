import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../../../users/entities/user.entity.js';
import { Device } from '../../../users/entities/device.entity.js';

export interface TokenPayload {
  sub: string;
  roles: string[];
  deviceId: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generates a short-lived access token.
   */
  generateAccessToken(user: User, device: Device): string {
    const payload: TokenPayload = {
      sub: user.id,
      roles: user.roles,
      deviceId: device.id,
    };
    
    return this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m') as any,
    });
  }

  /**
   * Generates a random secure string to act as the raw refresh token.
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  /**
   * Hashes the refresh token for secure database storage.
   */
  async hashRefreshToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }

  /**
   * Verifies a raw refresh token against its hashed version.
   */
  async verifyRefreshToken(token: string, hashedToken: string): Promise<boolean> {
    if (!token || !hashedToken) return false;
    return bcrypt.compare(token, hashedToken);
  }
}

