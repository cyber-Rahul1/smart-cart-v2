import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Request body for POST .../ledger/confirm (customer early-confirmation).
 *
 * Only expectedVersion is accepted; the service enforces customer-only access.
 */
export class ConfirmLedgerBodyDto {
  @ApiProperty({
    description:
      'Optimistic-locking version number. Must match the current persisted version; if not, a 409 Conflict is returned.',
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  expectedVersion: number;
}
