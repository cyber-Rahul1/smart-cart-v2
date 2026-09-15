import { Controller, Get, Post, Param, Query, UseGuards, ParseUUIDPipe, ConflictException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { UserRole } from '../../users/enums/user-role.enum.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { TokenPayload } from '../../auth/services/token/token.service.js';
import { AuditLog } from '../../audit/entities/audit-log.entity.js';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { GetSettlementsDto, AdminSettlementResponseDto } from '../dto/admin-settlements.dto.js';
import { PayoutDispatchService } from '../services/payout-dispatch.service.js';
import { PayoutReconciliationService } from '../services/payout-reconciliation.service.js';

@ApiTags('Admin Settlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/settlements')
export class AdminSettlementsController {
  constructor(
    @InjectRepository(SettlementInstruction)
    private readonly instructionRepo: Repository<SettlementInstruction>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly dispatchService: PayoutDispatchService,
    private readonly reconciliationService: PayoutReconciliationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List settlements with safe filters' })
  @ApiResponse({ status: 200, description: 'Returns a list of settlements', type: [AdminSettlementResponseDto] })
  async listSettlements(@Query() query: GetSettlementsDto) {
    const qb = this.instructionRepo.createQueryBuilder('instruction');

    if (query.status) {
      qb.andWhere('instruction.status = :status', { status: query.status });
    }
    if (query.providerAccountId) {
      qb.andWhere('instruction.providerAccountId = :providerAccountId', { providerAccountId: query.providerAccountId });
    }
    if (query.orderId) {
      qb.andWhere('instruction.orderId = :orderId', { orderId: query.orderId });
    }
    if (query.providerTransferId) {
      qb.andWhere('instruction.providerTransferId = :providerTransferId', { providerTransferId: query.providerTransferId });
    }
    if (query.createdAtStart) {
      qb.andWhere('instruction.createdAt >= :createdAtStart', { createdAtStart: query.createdAtStart });
    }
    if (query.createdAtEnd) {
      qb.andWhere('instruction.createdAt <= :createdAtEnd', { createdAtEnd: query.createdAtEnd });
    }
    if (query.updatedAtStart) {
      qb.andWhere('instruction.updatedAt >= :updatedAtStart', { updatedAtStart: query.updatedAtStart });
    }
    if (query.updatedAtEnd) {
      qb.andWhere('instruction.updatedAt <= :updatedAtEnd', { updatedAtEnd: query.updatedAtEnd });
    }

    qb.orderBy('instruction.createdAt', 'DESC');
    qb.limit(query.limit);
    qb.offset(query.offset);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map(item => new AdminSettlementResponseDto(item)),
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get safe settlement detail' })
  @ApiResponse({ status: 200, description: 'Returns settlement detail', type: AdminSettlementResponseDto })
  async getSettlement(@Param('id', ParseUUIDPipe) id: string) {
    const instruction = await this.instructionRepo.findOneBy({ id });
    if (!instruction) {
      throw new NotFoundException(`Settlement instruction ${id} not found`);
    }
    return new AdminSettlementResponseDto(instruction);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Manual retry for FAILED_RETRY settlement' })
  async retrySettlement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const instruction = await this.instructionRepo.findOneBy({ id });
    if (!instruction) {
      throw new NotFoundException(`Settlement instruction ${id} not found`);
    }
    
    // Explicitly reject PENDING, PROCESSING, COMPLETED, FAILED. Only FAILED_RETRY is eligible.
    if (instruction.status !== SettlementInstructionStatus.FAILED_RETRY) {
      throw new ConflictException(`Cannot manually retry instruction in status ${instruction.status}. Only FAILED_RETRY is supported.`);
    }

    await this.auditRepo.save(this.auditRepo.create({
      entityType: 'SettlementInstruction',
      entityId: id,
      action: 'MANUAL_RETRY_REQUESTED',
      performedBy: user.sub,
    }));

    await this.dispatchService.dispatch(id);
    return { success: true };
  }

  @Post(':id/reconcile')
  @ApiOperation({ summary: 'Manual reconciliation for PROCESSING settlement' })
  async reconcileSettlement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: TokenPayload,
  ) {
    const instruction = await this.instructionRepo.findOneBy({ id });
    if (!instruction) {
      throw new NotFoundException(`Settlement instruction ${id} not found`);
    }

    if (instruction.status !== SettlementInstructionStatus.PROCESSING) {
      throw new ConflictException(`Cannot reconcile instruction in status ${instruction.status}. Only PROCESSING is supported.`);
    }

    await this.auditRepo.save(this.auditRepo.create({
      entityType: 'SettlementInstruction',
      entityId: id,
      action: 'MANUAL_RECONCILIATION_REQUESTED',
      performedBy: user.sub,
    }));

    await this.reconciliationService.reconcileSingleInstruction(id);
    return { success: true };
  }
}
