import { Module } from '@nestjs/common';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';
import { ShopsModule } from '../shops/shops.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [ShopsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
