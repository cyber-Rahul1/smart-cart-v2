import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { ShopsService } from './shops.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Shop } from '../entities/shop.entity.js';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { ShopHours } from '../entities/shop-hours.entity.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { DataSource } from 'typeorm';
import { ShopStatus } from '../enums/shop-status.enum.js';

describe('ShopsService', () => {
  let service: ShopsService;
  let mockShopRepository: any;
  let testModule: TestingModule;

  beforeEach(async () => {
    mockShopRepository = {
      findOne: vi.fn(),
      save: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    testModule = await Test.createTestingModule({
      providers: [
        ShopsService,
        {
          provide: getRepositoryToken(Shop),
          useValue: mockShopRepository,
        },
        {
          provide: getRepositoryToken(ShopHours),
          useValue: {},
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: { save: vi.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            query: vi.fn(),
            transaction: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(30),
          },
        },
      ],
    }).compile();

    service = testModule.get<ShopsService>(ShopsService);
  });

  it('should set publishedAt when activating a shop for the first time', async () => {
    const shop = new Shop();
    shop.id = '123';
    shop.status = 'INACTIVE';
    shop.publishedAt = null;

    mockShopRepository.findOne.mockResolvedValue(shop);
    mockShopRepository.save.mockImplementation(async (s) => s);

    const updatedShop = await service.updateShopStatus('owner1', '123', { status: ShopStatus.ACTIVE });
    
    expect(updatedShop.status).toBe('ACTIVE');
    expect(updatedShop.publishedAt).toBeDefined();
    expect(updatedShop.publishedAt).not.toBeNull();
  });

  it('should not override publishedAt if already set', async () => {
    const shop = new Shop();
    shop.id = '123';
    shop.status = 'INACTIVE';
    const pastDate = new Date('2023-01-01');
    shop.publishedAt = pastDate;

    mockShopRepository.findOne.mockResolvedValue(shop);
    mockShopRepository.save.mockImplementation(async (s) => s);

    const updatedShop = await service.updateShopStatus('owner1', '123', { status: ShopStatus.ACTIVE });
    
    expect(updatedShop.status).toBe('ACTIVE');
    expect(updatedShop.publishedAt).toEqual(pastDate);
  });

  describe('getNewNearYouShops', () => {
    it('should query shops using cursor logic correctly', async () => {
      const mockShops = [
        { id: '1', name: 'A', location: '{"type":"Point","coordinates":[0,0]}', minimumOrder: '10', distance: '12.34', publishedAt: new Date() },
      ];
      (mockShopRepository as any).create = vi.fn().mockImplementation((r) => r);
      (testModule.get<DataSource>(DataSource) as any).query.mockResolvedValue(mockShops);

      const res = await service.getNewNearYouShops(0, 0, 10000, 10, 'MTIuMzRfMTcxMDAwMDAwMF8xMjM='); // valid cursor

      expect(res.shops).toHaveLength(1);
      expect((testModule.get<DataSource>(DataSource) as any).query).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid cursor', async () => {
      await expect(service.getNewNearYouShops(0, 0, 10000, 10, 'invalid-cursor')).rejects.toThrow('Invalid cursor format');
    });
  });
});
