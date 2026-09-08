import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Shop } from '../shops/entities/shop.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { ShopAvailabilityService } from '../shops/services/shop-availability.service.js';
import { ShopStatus } from '../shops/enums/shop-status.enum.js';
import { ProductStatus } from '../products/enums/product-status.enum.js';

@Injectable()
export class SearchService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly shopAvailabilityService: ShopAvailabilityService,
  ) {}

  /**
   * Keysest pagination cursor parsing
   * Format: base64(distance_shopId_productId)
   */
  private decodeCursor(cursor: string) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const parts = decoded.split('_');
      if (parts.length !== 3) throw new Error();
      return {
        distance: parseFloat(parts[0]),
        shopId: parts[1],
        productId: parts[2],
      };
    } catch {
      throw new BadRequestException('Invalid cursor format');
    }
  }

  private encodeCursor(distance: number, shopId: string, productId: string) {
    const raw = `${distance}_${shopId}_${productId}`;
    return Buffer.from(raw).toString('base64');
  }

  async searchProducts(
    lat: number,
    lng: number,
    query: string,
    limit = 20,
    cursor?: string,
  ) {
    if (limit > 50) limit = 50;

    let cursorCondition = '';
    const params: any[] = [lng, lat];
    let paramIndex = 3;

    if (cursor) {
      const { distance, shopId, productId } = this.decodeCursor(cursor);
      // keyset condition: (distance > X) OR (distance = X AND shopId > Y) OR (distance = X AND shopId = Y AND productId > Z)
      cursorCondition = `
        AND (
          ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) > $${paramIndex}
          OR (
            ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) = $${paramIndex} 
            AND (
              s.id > $${paramIndex + 1}
              OR (s.id = $${paramIndex + 1} AND p.id > $${paramIndex + 2})
            )
          )
        )
      `;
      params.push(distance, shopId, productId);
      paramIndex += 3;
    }

    let searchCondition = '';
    if (query) {
      searchCondition = `AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    const rawQuery = `
      SELECT 
        p.id as "productId",
        p.name as "productName",
        p.description,
        p.price,
        p."categoryId",
        s.id as "shopId",
        s.name as "shopName",
        ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
      FROM products p
      INNER JOIN shops s ON p."shopId" = s.id
      WHERE s.status = '${ShopStatus.ACTIVE}'
        AND p.status = '${ProductStatus.AVAILABLE}'
        AND ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) <= s."deliveryRadius"
        ${cursorCondition}
        ${searchCondition}
      ORDER BY 
        distance ASC,
        s.id ASC,
        p.id ASC
      LIMIT ${limit + 1}
    `;

    const rawResults = await this.dataSource.query(rawQuery, params);

    // Filter by actual business availability (e.g. within operating hours)
    // To maintain keyset pagination stability and limits, we fetch a bit more and filter.
    // However, shopAvailabilityService uses JS logic (date/time). 
    // Ideally this is pushed to DB, but for now we iterate and filter.
    
    const results = [];
    for (const row of rawResults) {
      if (results.length >= limit) break; // we got our limit
      const isAvailable = await this.shopAvailabilityService.isShopAvailable(row.shopId);
      if (isAvailable) {
        results.push(row);
      }
    }

    // Determine next cursor (using the last item of the requested limit, if there are more)
    let nextCursor = null;
    if (rawResults.length > limit) {
      const lastItem = results[results.length - 1];
      if (lastItem) {
        nextCursor = this.encodeCursor(lastItem.distance, lastItem.shopId, lastItem.productId);
      }
    }

    return {
      data: results,
      nextCursor,
    };
  }

  private decodeShopCursor(cursor: string) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const parts = decoded.split('_');
      if (parts.length !== 2) throw new Error();
      return {
        distance: parseFloat(parts[0]),
        shopId: parts[1],
      };
    } catch {
      throw new BadRequestException('Invalid cursor format');
    }
  }

  private encodeShopCursor(distance: number, shopId: string) {
    const raw = `${distance}_${shopId}`;
    return Buffer.from(raw).toString('base64');
  }

  async searchShops(
    lat: number,
    lng: number,
    query: string,
    limit = 20,
    cursor?: string,
  ) {
    if (limit > 50) limit = 50;

    let cursorCondition = '';
    const params: any[] = [lng, lat];
    let paramIndex = 3;

    if (cursor) {
      const { distance, shopId } = this.decodeShopCursor(cursor);
      cursorCondition = `
        AND (
          ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) > $${paramIndex}
          OR (
            ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) = $${paramIndex} 
            AND id > $${paramIndex + 1}
          )
        )
      `;
      params.push(distance, shopId);
      paramIndex += 2;
    }

    let searchCondition = '';
    if (query) {
      searchCondition = `AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    const rawQuery = `
      SELECT 
        id as "shopId",
        name as "shopName",
        description,
        "deliveryRadius",
        "minimumOrder",
        ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
      FROM shops
      WHERE status = '${ShopStatus.ACTIVE}'
        AND ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) <= "deliveryRadius"
        ${cursorCondition}
        ${searchCondition}
      ORDER BY 
        distance ASC,
        id ASC
      LIMIT ${limit + 1}
    `;

    const rawResults = await this.dataSource.query(rawQuery, params);
    const results = [];
    for (const row of rawResults) {
      if (results.length >= limit) break;
      const isAvailable = await this.shopAvailabilityService.isShopAvailable(row.shopId);
      if (isAvailable) {
        results.push(row);
      }
    }

    let nextCursor = null;
    if (rawResults.length > limit) {
      const lastItem = results[results.length - 1];
      if (lastItem) {
        nextCursor = this.encodeShopCursor(lastItem.distance, lastItem.shopId);
      }
    }

    return {
      data: results,
      nextCursor,
    };
  }
}
