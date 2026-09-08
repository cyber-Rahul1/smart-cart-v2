import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Shop } from '../entities/shop.entity.js';
import { ShopHours } from '../entities/shop-hours.entity.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { CreateShopDto, UpdateShopDto, UpdateShopStatusDto, UpdateShopHoursDto } from '../dto/shops.dto.js';
import { ShopStatus } from '../enums/shop-status.enum.js';

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(ShopHours)
    private readonly shopHoursRepo: Repository<ShopHours>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async createShop(userId: string, dto: CreateShopDto): Promise<Shop> {
    const shop = this.shopRepo.create({
      ownerId: userId,
      name: dto.name,
      description: dto.description,
      logo: dto.logo,
      banner: dto.banner,
      deliveryRadius: dto.deliveryRadius ?? 5000,
      minimumOrder: dto.minimumOrder ?? 0,
      preparationTime: dto.preparationTime ?? 30,
      location: {
        type: 'Point',
        coordinates: [dto.location.longitude, dto.location.latitude],
      },
      status: ShopStatus.INACTIVE, // Newly created shops start as inactive by default
    });

    const savedShop = await this.shopRepo.save(shop);

    await this.auditLogRepo.save({
      action: 'SHOP_CREATED',
      entityType: 'Shop',
      entityId: savedShop.id,
      performedBy: userId,
      newState: { name: savedShop.name },
    });

    return savedShop;
  }

  async getMyShops(userId: string): Promise<Shop[]> {
    return this.shopRepo.find({ where: { ownerId: userId } });
  }

  async getShopById(shopId: string): Promise<Shop> {
    const shop = await this.shopRepo.findOne({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  async updateShop(shopId: string, dto: UpdateShopDto): Promise<Shop> {
    const shop = await this.getShopById(shopId);

    if (dto.name !== undefined) shop.name = dto.name;
    if (dto.description !== undefined) shop.description = dto.description;
    if (dto.logo !== undefined) shop.logo = dto.logo;
    if (dto.banner !== undefined) shop.banner = dto.banner;
    if (dto.deliveryRadius !== undefined) shop.deliveryRadius = dto.deliveryRadius;
    if (dto.minimumOrder !== undefined) shop.minimumOrder = dto.minimumOrder;
    if (dto.preparationTime !== undefined) shop.preparationTime = dto.preparationTime;
    
    if (dto.location) {
      shop.location = {
        type: 'Point',
        coordinates: [dto.location.longitude, dto.location.latitude],
      };
    }

    return this.shopRepo.save(shop);
  }

  async updateShopStatus(userId: string, shopId: string, dto: UpdateShopStatusDto): Promise<Shop> {
    const shop = await this.getShopById(shopId);
    
    const oldStatus = shop.status;
    shop.status = dto.status;
    
    if (dto.status === ShopStatus.ACTIVE && !shop.publishedAt) {
      shop.publishedAt = new Date();
    }
    
    const savedShop = await this.shopRepo.save(shop);

    await this.auditLogRepo.save({
      action: 'SHOP_STATUS_CHANGED',
      entityType: 'Shop',
      entityId: shop.id,
      performedBy: userId,
      previousState: { status: oldStatus },
      newState: { status: dto.status },
    });

    return savedShop;
  }

  async getShopHours(shopId: string): Promise<ShopHours[]> {
    return this.shopHoursRepo.find({ where: { shopId }, order: { dayOfWeek: 'ASC', openTime: 'ASC' } });
  }

  async updateShopHours(shopId: string, dto: UpdateShopHoursDto): Promise<ShopHours[]> {
    return this.dataSource.transaction(async (manager) => {
      await manager.delete(ShopHours, { shopId });
      
      const newHours = dto.hours.map(h => manager.create(ShopHours, {
        shopId,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      }));
      
      return manager.save(ShopHours, newHours);
    });
  }

  async getNearbyShops(lat: number, lng: number, radius: number, limit: number, page: number) {
    const skip = (page - 1) * limit;

    const [shops, total] = await this.shopRepo
      .createQueryBuilder('shop')
      .where("shop.status IN (:...statuses)", { statuses: [ShopStatus.ACTIVE, ShopStatus.INACTIVE] })
      .andWhere("ST_DWithin(shop.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, shop.\"deliveryRadius\")")
      .andWhere("ST_DWithin(shop.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)")
      .orderBy("ST_Distance(shop.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)")
      .skip(skip)
      .take(limit)
      .setParameters({ lng, lat, radius })
      .getManyAndCount();

    // Since TypeORM getMany doesn't easily return the ST_Distance in the same object without getRawAndEntities,
    // we can use getRawAndEntities for more complex projections if needed, but getMany is fine if we just want to return the shop.
    return { shops, total };
  }

  private decodeNewNearYouCursor(cursor: string) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const parts = decoded.split('_');
      if (parts.length !== 3) throw new Error();
      const distance = parseFloat(parts[0]);
      if (isNaN(distance)) throw new Error();
      return {
        distance,
        publishedAtEpoch: parseInt(parts[1], 10),
        shopId: parts[2],
      };
    } catch {
      throw new BadRequestException('Invalid cursor format');
    }
  }

  private encodeNewNearYouCursor(distance: number, publishedAtEpoch: number, shopId: string) {
    const raw = `${distance}_${publishedAtEpoch}_${shopId}`;
    return Buffer.from(raw).toString('base64');
  }

  async getNewNearYouShops(lat: number, lng: number, radius: number, limit: number, cursor?: string) {
    if (limit > 50) limit = 50;

    const newBusinessDays = this.configService.get<number>('NEW_BUSINESS_DAYS', 30);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - newBusinessDays);

    const params: any[] = [lng, lat, radius, cutoffDate];
    let paramIndex = 5;
    let cursorCondition = '';

    if (cursor) {
      const { distance, publishedAtEpoch, shopId } = this.decodeNewNearYouCursor(cursor);
      const cursorDate = new Date(publishedAtEpoch).toISOString();
      
      cursorCondition = `
        AND (
          ROUND(ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 2) > $${paramIndex}
          OR (
            ROUND(ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 2) = $${paramIndex}
            AND s."publishedAt" < $${paramIndex + 1}
          )
          OR (
            ROUND(ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 2) = $${paramIndex}
            AND s."publishedAt" = $${paramIndex + 1}
            AND s.id > $${paramIndex + 2}
          )
        )
      `;
      params.push(distance, cursorDate, shopId);
      paramIndex += 3;
    }

    const rawQuery = `
      SELECT 
        s.id,
        s."ownerId",
        s.name,
        s.description,
        s.logo,
        s.banner,
        s."deliveryRadius",
        s."minimumOrder",
        s."preparationTime",
        s.status,
        s."createdAt",
        s."updatedAt",
        s."deletedAt",
        s."publishedAt",
        ST_AsGeoJSON(s.location) as location,
        ROUND(ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 2) as distance
      FROM shops s
      WHERE s.status = '${ShopStatus.ACTIVE}'
        AND s."publishedAt" >= $4
        AND ST_DWithin(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
        ${cursorCondition}
      ORDER BY 
        distance ASC,
        s."publishedAt" DESC,
        s.id ASC
      LIMIT ${limit + 1}
    `;

    const rawResults = await this.dataSource.query(rawQuery, params);
    
    const results = [];
    for (const row of rawResults) {
      if (results.length >= limit) break;
      
      const shop = this.shopRepo.create({
        ...row,
        location: JSON.parse(row.location),
        minimumOrder: Number(row.minimumOrder), // parse numeric types
      });
      // Attach distance property dynamically if needed or just return shop
      (shop as any).distance = Number(row.distance);
      results.push(shop);
    }

    let nextCursor = null;
    if (rawResults.length > limit) {
      const lastItem = results[results.length - 1];
      if (lastItem && lastItem.publishedAt) {
        nextCursor = this.encodeNewNearYouCursor(
          (lastItem as any).distance, 
          lastItem.publishedAt.getTime(), 
          lastItem.id
        );
      }
    }

    return {
      shops: results,
      nextCursor,
    };
  }
}
