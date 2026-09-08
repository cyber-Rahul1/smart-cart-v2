import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from '../services/users.service.js';
import { AddressesService } from '../services/addresses.service.js';
import { UpdateProfileDto, CreateAddressDto, UpdateAddressDto } from '../dto/users.dto.js';
import { UpdatePushTokenDto } from '../dto/update-push-token.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { TokenPayload } from '../../auth/services/token/token.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly addressesService: AddressesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Returns user profile' })
  async getProfile(@CurrentUser() user: TokenPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @Patch()
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Returns updated user profile' })
  async updateProfile(
    @CurrentUser() user: TokenPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Get('addresses')
  @ApiOperation({ summary: 'List user addresses' })
  @ApiResponse({ status: 200, description: 'Returns list of addresses' })
  async getAddresses(@CurrentUser() user: TokenPayload) {
    return this.addressesService.getAddresses(user.sub);
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Create new address' })
  @ApiResponse({ status: 201, description: 'Address created' })
  async createAddress(
    @CurrentUser() user: TokenPayload,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.createAddress(user.sub, dto);
  }

  @Get('addresses/:addressId')
  @ApiOperation({ summary: 'Get a specific address' })
  @ApiResponse({ status: 200, description: 'Returns the address' })
  async getAddress(
    @CurrentUser() user: TokenPayload,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    return this.addressesService.getAddress(user.sub, addressId);
  }

  @Patch('addresses/:addressId')
  @ApiOperation({ summary: 'Update a specific address' })
  @ApiResponse({ status: 200, description: 'Returns updated address' })
  async updateAddress(
    @CurrentUser() user: TokenPayload,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.updateAddress(user.sub, addressId, dto);
  }

  @Delete('addresses/:addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a specific address' })
  @ApiResponse({ status: 204, description: 'Address deleted' })
  async deleteAddress(
    @CurrentUser() user: TokenPayload,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    await this.addressesService.deleteAddress(user.sub, addressId);
  }

  @Post('addresses/:addressId/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set address as default' })
  @ApiResponse({ status: 200, description: 'Address set as default' })
  async setDefaultAddress(
    @CurrentUser() user: TokenPayload,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    await this.addressesService.setDefaultAddress(user.sub, addressId);
    return { success: true };
  }

  @Get('devices')
  @ApiOperation({ summary: 'List user active devices' })
  @ApiResponse({ status: 200, description: 'Returns list of devices' })
  async getDevices(@CurrentUser() user: TokenPayload) {
    return this.usersService.getDevices(user.sub);
  }

  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific device' })
  @ApiResponse({ status: 204, description: 'Device revoked' })
  async revokeDevice(
    @CurrentUser() user: TokenPayload,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    await this.usersService.revokeDevice(user.sub, deviceId);
  }

  @Patch('devices/:deviceId/push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update push token for a device' })
  @ApiResponse({ status: 200, description: 'Push token updated successfully' })
  async updatePushToken(
    @CurrentUser() user: TokenPayload,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: UpdatePushTokenDto,
  ) {
    await this.usersService.updatePushToken(user.sub, deviceId, dto.pushToken, dto.pushProvider);
    return { success: true };
  }
}
