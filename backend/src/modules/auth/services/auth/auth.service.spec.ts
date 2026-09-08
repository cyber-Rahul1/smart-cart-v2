import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';

import { TokenService } from '../token/token.service.js';
import { DataSource } from 'typeorm';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'PHONE_VERIFICATION_PROVIDER', useValue: {} },
        { provide: TokenService, useValue: {} },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
