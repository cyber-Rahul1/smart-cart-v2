import { IsInt, IsPositive, IsOptional, IsArray, IsString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request body for PUT .../ledger (kitchen update).
 *
 * Only the mutable content fields and the optimistic-locking version are accepted.
 * Forbidden client fields: status, version (auto-incremented), menuLockAt, finalizedAt,
 * allocationId, id, createdAt, updatedAt, and any audit fields.
 * The service remains authoritative for all of those.
 */
export class UpdateLedgerBodyDto {
  @ApiProperty({
    description:
      'Optimistic-locking version number. Must match the current persisted version; if not, a 409 Conflict is returned.',
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  expectedVersion: number;

  @ApiPropertyOptional({
    description: 'Updated list of allergens (JSONB array of strings).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @ApiPropertyOptional({
    description: 'Updated list of ingredients (JSONB array of strings).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ingredients?: string[];

  @ApiPropertyOptional({
    description: 'Updated substitutions map (JSONB object: { original → substitute }).',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  substitutions?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Spice level description.',
    example: 'medium',
  })
  @IsOptional()
  @IsString()
  spiceLevel?: string;
}
