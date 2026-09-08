import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { TokenPayload } from '../services/token/token.service.js';
import { UserRole } from '../../users/enums/user-role.enum.js';

export const OWNERSHIP_METADATA_KEY = 'ownership_meta';

export interface OwnershipMetadata {
  entity: Type<any>;
  param: string; // The URL parameter containing the entity ID (e.g., 'id', 'shopId')
  userField?: string; // The field on the entity that points to the user ID. Default: 'userId'
}

export const CheckOwnership = Reflector.createDecorator<OwnershipMetadata>();

/**
 * A foundational guard for Object-Level Authorization.
 * Ensures the authenticated user owns the resource being accessed.
 * Admins can bypass this check.
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector, private dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ownershipMeta = this.reflector.getAllAndOverride<OwnershipMetadata>(CheckOwnership, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!ownershipMeta) {
      // If the route isn't decorated with CheckOwnership, skip check
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: TokenPayload = request.user;
    
    if (!user) {
      return false; // Not authenticated (should be caught by JwtAuthGuard first)
    }

    // SUPER_ADMIN and ADMIN can bypass ownership checks
    if (user.roles.includes(UserRole.SUPER_ADMIN) || user.roles.includes(UserRole.ADMIN)) {
      return true;
    }

    const resourceId = request.params[ownershipMeta.param];
    if (!resourceId) {
      throw new ForbiddenException('Resource ID missing from parameters');
    }

    const userField = ownershipMeta.userField || 'userId';
    
    // Dynamically query the database to check if this entity's userField == current user ID
    const repository = this.dataSource.getRepository(ownershipMeta.entity);
    const count = await repository.count({
      where: {
        id: resourceId,
        [userField]: user.sub,
      },
    });

    if (count === 0) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}
