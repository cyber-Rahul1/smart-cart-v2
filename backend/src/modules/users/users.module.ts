import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { CustomerProfile } from './entities/customer-profile.entity.js';
import { RiderProfile } from './entities/rider-profile.entity.js';
import { ShopkeeperProfile } from './entities/shopkeeper-profile.entity.js';
import { Address } from './entities/address.entity.js';
import { Device } from './entities/device.entity.js';
import { UsersService } from './services/users.service.js';
import { AddressesService } from './services/addresses.service.js';
import { UsersController } from './controllers/users.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, 
      CustomerProfile, 
      RiderProfile, 
      ShopkeeperProfile, 
      Address, 
      Device
    ])
  ],
  controllers: [UsersController],
  providers: [UsersService, AddressesService],
  exports: [UsersService], // Exported in case AuthModule or other modules need to fetch user profiles
})
export class UsersModule {}
