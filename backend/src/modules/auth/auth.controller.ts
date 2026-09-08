import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './services/auth/auth.service.js';
import { SendOtpDto, VerifyOtpDto, RefreshTokenDto } from './dto/auth.dto.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { TokenPayload } from './services/token/token.service.js';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('otp/send')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to phone number' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async sendOtp(@Body() dto: SendOtpDto) {
    await this.authService.sendOtp(dto.phoneNumber);
    return { message: 'OTP sent successfully' };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and login/register' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 401, description: 'User account suspended' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const result = await this.authService.verifyOtpAndLogin(
      dto.phoneNumber,
      dto.code,
      dto.platform,
      dto.deviceId
    );
    return result;
  }

  @SkipThrottle()
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token or session revoked' })
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refreshTokens(dto.refreshToken, dto.deviceId);
    return result;
  }

  @SkipThrottle()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({ status: 200, description: 'Successfully logged out' })
  async logout(@CurrentUser() user: TokenPayload) {
    await this.authService.logout(user.deviceId, user.sub);
    return { message: 'Logged out successfully' };
  }

  @SkipThrottle()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions for user' })
  @ApiResponse({ status: 200, description: 'Successfully logged out all sessions' })
  async logoutAll(@CurrentUser() user: TokenPayload) {
    await this.authService.logoutAll(user.sub);
    return { message: 'All sessions logged out successfully' };
  }

  @SkipThrottle()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user info from token' })
  @ApiResponse({ status: 200, description: 'Returns token payload details' })
  getMe(@CurrentUser() user: TokenPayload) {
    // We do NOT trust any client-provided ID. 
    // We return what is cryptographically verified in the JWT.
    // If full profile is needed, client should call GET /users/me (to be implemented later).
    return {
      userId: user.sub,
      roles: user.roles,
      deviceId: user.deviceId,
    };
  }
}

