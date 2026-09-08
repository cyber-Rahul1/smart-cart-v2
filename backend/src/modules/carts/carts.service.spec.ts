import { Test, TestingModule } from '@nestjs/testing';
import { CartsService } from './carts.service.js';

import { getRepositoryToken } from '@nestjs/typeorm';
import { Cart } from './entities/cart.entity.js';
import { CartItem } from './entities/cart-item.entity.js';
import { ShopAvailabilityService } from '../shops/services/shop-availability.service.js';
import { DataSource } from 'typeorm';

describe('CartsService', () => {
  let service: CartsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: getRepositoryToken(Cart), useValue: {} },
        { provide: getRepositoryToken(CartItem), useValue: {} },
        { provide: ShopAvailabilityService, useValue: {} },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<CartsService>(CartsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
