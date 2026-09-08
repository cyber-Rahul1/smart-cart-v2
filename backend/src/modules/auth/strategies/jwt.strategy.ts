import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenPayload } from '../services/token/token.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'super-secret-default-key-do-not-use-in-prod'),
    });
  }

  async validate(payload: TokenPayload) {
    if (!payload.sub || !payload.roles) {
      throw new UnauthorizedException('Invalid token payload');
    }
    // We return the payload, which gets injected into request.user
    // Zero-trust: Controllers must use this payload for identity.
    return {
      sub: payload.sub,
      roles: payload.roles,
      deviceId: payload.deviceId,
    };
  }
}
