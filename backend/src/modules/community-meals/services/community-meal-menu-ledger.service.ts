import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { MealMenuLedger } from '../entities/meal-menu-ledger.entity.js';
import { MealAllocation } from '../entities/meal-allocation.entity.js';
import { MealConversation } from '../entities/meal-conversation.entity.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { MealMenuLedgerStatus } from '../enums/meal-menu-ledger-status.enum.js';
import { LedgerEventPublisher } from '../events/ledger-event.publisher.js';
import { LedgerLockSchedulerService } from './ledger-lock-scheduler.service.js';
import { LockResult } from '../enums/lock-result.enum.js';

@Injectable()
export class CommunityMealMenuLedgerService {
  constructor(
    @InjectRepository(MealMenuLedger)
    private readonly ledgerRepo: Repository<MealMenuLedger>,
    @InjectRepository(MealAllocation)
    private readonly allocationRepo: Repository<MealAllocation>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly eventPublisher: LedgerEventPublisher,
    private readonly scheduler: LedgerLockSchedulerService,
  ) {}

  async getLedger(allocationId: string, userId: string): Promise<MealMenuLedger> {
    const allocation = await this.allocationRepo.findOne({
      where: { id: allocationId },
      relations: { offer: { shop: true } } as any,
    });

    if (!allocation) {
      throw new NotFoundException('Allocation not found');
    }

    const isCustomer = userId === allocation.userId;
    const isShopkeeper = userId === allocation.offer.shop.ownerId;

    if (!isCustomer && !isShopkeeper) {
      throw new ForbiddenException('Unauthorized to access this ledger');
    }

    const ledger = await this.ledgerRepo.findOne({ where: { allocationId } });
    if (!ledger) {
      throw new NotFoundException('Ledger not found');
    }
    return ledger;
  }

  async kitchenUpdate(allocationId: string, userId: string, updateData: Partial<MealMenuLedger>, expectedVersion: number): Promise<MealMenuLedger> {
    const allocation = await this.allocationRepo.findOne({
      where: { id: allocationId },
      relations: { offer: { shop: true } } as any,
    });

    if (!allocation) {
      throw new NotFoundException('Allocation not found');
    }

    if (userId !== allocation.offer.shop.ownerId) {
      throw new ForbiddenException('Only the shopkeeper can update the ledger');
    }

    const ledger = await this.ledgerRepo.findOne({ where: { allocationId } });
    if (!ledger) {
      throw new NotFoundException('Ledger not found');
    }

    if (ledger.status !== MealMenuLedgerStatus.DRAFT) {
      throw new ConflictException('Ledger is already locked');
    }

    // Validate structured fields exist conceptually (ignoring deep validation for now as per minimal approach)
    if (updateData.allergens && typeof updateData.allergens !== 'object') {
      throw new BadRequestException('Invalid allergens format');
    }
    
    const finalLedger = await this.dataSource.transaction(async (manager) => {
      // Use explicit conditional update to enforce invariant
      const updateResult = await manager.createQueryBuilder()
        .update(MealMenuLedger)
        .set({
          ...updateData,
          version: () => 'version + 1'
        })
        .where('id = :id', { id: ledger.id })
        .andWhere('status = :status', { status: MealMenuLedgerStatus.DRAFT })
        .andWhere('version = :expectedVersion', { expectedVersion })
        .andWhere('("menuLockAt" IS NULL OR "menuLockAt" > NOW())')
        .execute();

      if (updateResult.affected === 0) {
        throw new ConflictException('Update failed: Ledger may be locked, expired, or version conflict');
      }

      const updatedLedger = await manager.findOne(MealMenuLedger, { where: { id: ledger.id } });
      
      const audit = manager.create(AuditLog, {
        entityName: 'MealMenuLedger',
        entityId: ledger.id,
        action: 'UPDATE',
        actorId: userId,
        oldValues: ledger,
        newValues: updatedLedger,
      });
      await manager.save(audit);

      return updatedLedger as MealMenuLedger;
    });

    if (finalLedger.menuLockAt) {
      await this.scheduler.scheduleLock(finalLedger.id, finalLedger.version, finalLedger.menuLockAt);
    }
    await this.eventPublisher.publishEvent('ledger_updated', allocationId, finalLedger);

    return finalLedger;
  }

  async confirmLedger(allocationId: string, userId: string, expectedVersion: number): Promise<void> {
    const allocation = await this.allocationRepo.findOne({
      where: { id: allocationId },
      relations: { offer: { shop: true } } as any,
    });

    if (!allocation) {
      throw new NotFoundException('Allocation not found');
    }

    if (userId !== allocation.userId) {
      throw new ForbiddenException('Only the customer can confirm the ledger');
    }

    const ledger = await this.ledgerRepo.findOne({ where: { allocationId } });
    if (!ledger) {
      throw new NotFoundException('Ledger not found');
    }

    await this.dataSource.transaction(async (manager) => {
      const updateResult = await manager.createQueryBuilder()
        .update(MealMenuLedger)
        .set({
          status: MealMenuLedgerStatus.LOCKED,
          finalizedAt: () => 'NOW()',
          menuLockAt: () => 'NOW()',
          version: () => 'version + 1'
        })
        .where('id = :id', { id: ledger.id })
        .andWhere('status = :status', { status: MealMenuLedgerStatus.DRAFT })
        .andWhere('version = :expectedVersion', { expectedVersion })
        .andWhere('("menuLockAt" IS NULL OR "menuLockAt" > NOW())')
        .execute();

      if (updateResult.affected === 0) {
        throw new ConflictException('Confirmation failed: Ledger may be locked, expired, or version conflict');
      }

      const updatedLedger = await manager.findOne(MealMenuLedger, { where: { id: ledger.id } });

      await manager.createQueryBuilder()
        .update(MealConversation)
        .set({ status: 'READ_ONLY' })
        .where('allocationId = :allocationId', { allocationId })
        .execute();

      const audit = manager.create(AuditLog, {
        entityName: 'MealMenuLedger',
        entityId: ledger.id,
        action: 'EARLY_CONFIRM',
        actorId: userId,
        oldValues: ledger,
        newValues: updatedLedger,
      });
      await manager.save(audit);
    });

    const finalLedger = await this.ledgerRepo.findOne({ where: { id: ledger.id } });
    if (finalLedger) {
      await this.eventPublisher.publishEvent('ledger_updated', allocationId, finalLedger);
    }
  }

  async getLedgerInternal(ledgerId: string): Promise<MealMenuLedger | null> {
    return this.ledgerRepo.findOne({ where: { id: ledgerId } });
  }

  async autoLock(ledgerId: string, expectedVersion: number): Promise<LockResult> {
    const ledger = await this.ledgerRepo.findOne({ where: { id: ledgerId } });
    if (!ledger) {
      return LockResult.NOT_FOUND;
    }

    if (ledger.status === MealMenuLedgerStatus.LOCKED) {
      return LockResult.ALREADY_LOCKED;
    }

    if (ledger.status !== MealMenuLedgerStatus.DRAFT) {
      return LockResult.ALREADY_FINALIZED;
    }

    if (ledger.version !== expectedVersion) {
      return LockResult.STALE_JOB;
    }

    if (ledger.menuLockAt && ledger.menuLockAt > new Date()) {
      return LockResult.TOO_EARLY;
    }

    try {
      let finalLedger: MealMenuLedger | undefined;
      await this.dataSource.transaction(async (manager) => {
        const updateResult = await manager.createQueryBuilder()
          .update(MealMenuLedger)
          .set({
            status: MealMenuLedgerStatus.LOCKED,
            finalizedAt: () => 'NOW()',
            version: () => 'version + 1'
          })
          .where('id = :id', { id: ledger.id })
          .andWhere('status = :status', { status: MealMenuLedgerStatus.DRAFT })
          .andWhere('version = :expectedVersion', { expectedVersion })
          .andWhere('"menuLockAt" <= NOW()')
          .execute();

        if ((updateResult.affected ?? 0) > 0) {
          const updatedLedger = await manager.findOne(MealMenuLedger, { where: { id: ledger.id } });
          finalLedger = updatedLedger as MealMenuLedger;

          await manager.createQueryBuilder()
            .update(MealConversation)
            .set({ status: 'READ_ONLY' })
            .where('allocationId = :allocationId', { allocationId: ledger.allocationId })
            .execute();

          const audit = manager.create(AuditLog, {
            entityName: 'MealMenuLedger',
            entityId: ledger.id,
            action: 'TIMED_LOCK',
            actorId: 'SYSTEM',
            oldValues: ledger,
            newValues: updatedLedger,
          });
          await manager.save(audit);
        }
      });

      if (finalLedger) {
        await this.eventPublisher.publishEvent('ledger_locked', finalLedger.allocationId, finalLedger);
        return LockResult.LOCK_SUCCESS;
      } else {
        // If 0 rows affected despite pre-checks, it means race condition modified it
        const currentLedger = await this.ledgerRepo.findOne({ where: { id: ledger.id } });
        if (currentLedger?.status === MealMenuLedgerStatus.LOCKED) return LockResult.ALREADY_LOCKED;
        if (currentLedger?.status !== MealMenuLedgerStatus.DRAFT) return LockResult.ALREADY_FINALIZED;
        if (currentLedger?.version !== expectedVersion) return LockResult.STALE_JOB;
        return LockResult.TOO_EARLY; // fallback
      }
    } catch (e) {
      return LockResult.RETRYABLE_FAILURE;
    }
  }
}
