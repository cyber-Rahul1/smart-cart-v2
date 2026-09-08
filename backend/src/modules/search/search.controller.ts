import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { SearchService } from './search.service.js';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('products')
  @ApiOperation({ summary: 'Global search and discovery for products' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 50' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async searchProducts(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('q') query?: string,
    @Query('limit') limit = 20,
    @Query('cursor') cursor?: string,
  ) {
    if (!lat || !lng) {
      throw new BadRequestException('Coordinates (lat, lng) are required');
    }
    
    return this.searchService.searchProducts(
      Number(lat),
      Number(lng),
      query || '',
      Number(limit),
      cursor
    );
  }

  @Get('shops')
  @ApiOperation({ summary: 'Global search and discovery for shops' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 50' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async searchShops(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('q') query?: string,
    @Query('limit') limit = 20,
    @Query('cursor') cursor?: string,
  ) {
    if (!lat || !lng) {
      throw new BadRequestException('Coordinates (lat, lng) are required');
    }
    
    return this.searchService.searchShops(
      Number(lat),
      Number(lng),
      query || '',
      Number(limit),
      cursor
    );
  }
}
