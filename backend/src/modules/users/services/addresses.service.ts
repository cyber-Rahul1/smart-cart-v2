import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Address } from '../entities/address.entity.js';
import { CreateAddressDto, UpdateAddressDto } from '../dto/users.dto.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import type { Point } from 'geojson';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    private readonly dataSource: DataSource,
  ) {}

  private mapDtoToLocation(latitude?: number, longitude?: number): Point | undefined {
    if (latitude !== undefined && longitude !== undefined) {
      return {
        type: 'Point',
        coordinates: [longitude, latitude], // GeoJSON is [longitude, latitude]
      };
    }
    return undefined;
  }

  async getAddresses(userId: string) {
    const addresses = await this.addressRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });

    return addresses.map(addr => ({
      id: addr.id,
      label: addr.label,
      addressLine: addr.addressLine,
      latitude: addr.location?.coordinates?.[1],
      longitude: addr.location?.coordinates?.[0],
      isDefault: addr.isDefault,
    }));
  }

  async getAddress(userId: string, addressId: string) {
    const addr = await this.addressRepository.findOne({
      where: { id: addressId },
    });

    if (!addr) {
      throw new NotFoundException('Address not found');
    }

    if (addr.userId !== userId) {
      throw new ForbiddenException("Cannot access another user's address");
    }

    return {
      id: addr.id,
      label: addr.label,
      addressLine: addr.addressLine,
      latitude: addr.location?.coordinates?.[1],
      longitude: addr.location?.coordinates?.[0],
      isDefault: addr.isDefault,
    };
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      // Check if user already has a default address
      const count = await manager.count(Address, { where: { userId } });
      const isDefault = count === 0; // Make first address default

      const address = manager.create(Address, {
        userId,
        label: dto.label,
        addressLine: dto.addressLine,
        location: this.mapDtoToLocation(dto.latitude, dto.longitude),
        isDefault,
      });

      await manager.save(Address, address);

      await manager.save(AuditLog, {
        action: 'ADDRESS_CREATED',
        entityType: 'Address',
        entityId: address.id,
        performedBy: userId,
      });

      return {
        id: address.id,
        label: address.label,
        addressLine: address.addressLine,
        latitude: address.location?.coordinates?.[1],
        longitude: address.location?.coordinates?.[0],
        isDefault: address.isDefault,
      };
    });
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const address = await manager.findOne(Address, { where: { id: addressId } });

      if (!address) {
        throw new NotFoundException('Address not found');
      }

      if (address.userId !== userId) {
        throw new ForbiddenException("Cannot modify another user's address");
      }

      if (dto.label !== undefined) address.label = dto.label;
      if (dto.addressLine !== undefined) address.addressLine = dto.addressLine;
      
      const newLocation = this.mapDtoToLocation(dto.latitude, dto.longitude);
      if (newLocation) {
        address.location = newLocation;
      }

      await manager.save(Address, address);

      await manager.save(AuditLog, {
        action: 'ADDRESS_UPDATED',
        entityType: 'Address',
        entityId: address.id,
        performedBy: userId,
      });

      return {
        id: address.id,
        label: address.label,
        addressLine: address.addressLine,
        latitude: address.location?.coordinates?.[1],
        longitude: address.location?.coordinates?.[0],
        isDefault: address.isDefault,
      };
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const address = await manager.findOne(Address, { where: { id: addressId } });

      if (!address) {
        throw new NotFoundException('Address not found');
      }

      if (address.userId !== userId) {
        throw new ForbiddenException("Cannot delete another user's address");
      }

      await manager.softRemove(Address, address);

      await manager.save(AuditLog, {
        action: 'ADDRESS_DELETED',
        entityType: 'Address',
        entityId: address.id,
        performedBy: userId,
      });
    });
  }

  async setDefaultAddress(userId: string, addressId: string) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const address = await manager.findOne(Address, { where: { id: addressId } });

      if (!address) {
        throw new NotFoundException('Address not found');
      }

      if (address.userId !== userId) {
        throw new ForbiddenException("Cannot modify another user's address");
      }

      if (address.isDefault) {
        return; // Already default
      }

      // Unset previous defaults
      await manager.update(Address, { userId, isDefault: true }, { isDefault: false });
      
      // Set new default
      address.isDefault = true;
      await manager.save(Address, address);

      await manager.save(AuditLog, {
        action: 'ADDRESS_DEFAULT_CHANGED',
        entityType: 'Address',
        entityId: address.id,
        performedBy: userId,
      });
    });
  }
}
