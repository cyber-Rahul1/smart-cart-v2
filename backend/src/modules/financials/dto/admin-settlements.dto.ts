import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import type { SettlementInstruction } from '../entities/settlement-instruction.entity.js';

export class GetSettlementsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(SettlementInstructionStatus)
  status?: SettlementInstructionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  providerAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerTransferId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdAtStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdAtEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  updatedAtStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  updatedAtEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class AdminSettlementResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  orderId: string | null;

  @ApiProperty()
  providerAccountId: string;

  @ApiProperty()
  customerGrossAmount: number;

  @ApiProperty()
  providerGrossAmount: number;

  @ApiProperty()
  platformCommission: number;

  @ApiProperty()
  paymentGatewayFees: number;

  @ApiProperty()
  discounts: number;

  @ApiProperty()
  refunds: number;

  @ApiProperty()
  adjustments: number;

  @ApiProperty()
  providerNetSettlement: number;

  @ApiProperty({ enum: SettlementInstructionStatus })
  status: SettlementInstructionStatus;

  @ApiPropertyOptional()
  providerTransferId: string | null;

  @ApiProperty()
  idempotencyKey: string;

  @ApiPropertyOptional()
  completedAt: Date | null;

  @ApiPropertyOptional()
  failedAt: Date | null;

  @ApiPropertyOptional()
  errorCode: string | null;

  @ApiProperty()
  retryCount: number;

  @ApiPropertyOptional()
  lastAttemptAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(instruction: SettlementInstruction) {
    this.id = instruction.id;
    this.orderId = instruction.orderId || null;
    this.providerAccountId = instruction.providerAccountId;
    this.customerGrossAmount = Number(instruction.customerGrossAmount);
    this.providerGrossAmount = Number(instruction.providerGrossAmount);
    this.platformCommission = Number(instruction.platformCommission);
    this.paymentGatewayFees = Number(instruction.paymentGatewayFees);
    this.discounts = Number(instruction.discounts);
    this.refunds = Number(instruction.refunds);
    this.adjustments = Number(instruction.adjustments);
    this.providerNetSettlement = Number(instruction.providerNetSettlement);
    this.status = instruction.status;
    this.providerTransferId = instruction.providerTransferId || null;
    this.idempotencyKey = instruction.idempotencyKey;
    this.completedAt = instruction.completedAt;
    this.failedAt = instruction.failedAt;
    this.errorCode = instruction.errorCode;
    this.retryCount = instruction.retryCount;
    this.lastAttemptAt = instruction.lastAttemptAt;
    this.createdAt = instruction.createdAt;
    this.updatedAt = instruction.updatedAt;
    
    // Explicitly do NOT map providerResponse or errorDetails.
  }
}
