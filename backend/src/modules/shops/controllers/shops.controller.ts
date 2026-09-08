import { Controller, Get, Param, Query, ParseIntPipe, ParseFloatPipe, DefaultValuePipe } from '@nestjs/common';
import { ShopsService } from '../services/shops.service.js';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get()
  async getNearbyShops(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius', new DefaultValuePipe(5000), ParseIntPipe) radius: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const { shops, total } = await this.shopsService.getNearbyShops(lat, lng, radius, limit, page);
    return {
      success: true,
      data: shops,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  @Get('new-near-you')
  async getNewNearYouShops(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius', new DefaultValuePipe(5000), ParseIntPipe) radius: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    const { shops, nextCursor } = await this.shopsService.getNewNearYouShops(lat, lng, radius, limit, cursor);
    return {
      success: true,
      data: shops,
      meta: {
        limit,
        nextCursor,
      },
    };
  }

  @Get(':shopId')
  async getShopById(@Param('shopId') shopId: string) {
    const shop = await this.shopsService.getShopById(shopId);
    return {
      success: true,
      data: shop,
    };
  }
}
