import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';

/**
 * Phase 12B-8 settlement payout state machine — STRUCTURAL legality only.
 *
 * Semantics (see docs/DECISIONS.md and the Phase 12B-8 plan):
 * - PENDING:      eligible settlement waiting for payout dispatch.
 * - PROCESSING:   provider dispatch accepted OR outcome ambiguous.
 * - COMPLETED:    provider confirms success. TERMINAL.
 * - FAILED_RETRY: recoverable failure (compliance block, transient rejection).
 * - FAILED:       terminal failure requiring manual intervention. TERMINAL.
 *
 * IMPORTANT: this helper encodes STRUCTURAL transition legality only.
 * Contextual business guards — e.g. "PROCESSING -> FAILED requires the
 * provider contract to confirm no money moved" — are the responsibility of
 * Increment 2 dispatch/reconciliation logic, which must enforce them in
 * addition to calling canTransition().
 */
export const ALLOWED_SETTLEMENT_TRANSITIONS: Readonly<
    Record<SettlementInstructionStatus, readonly SettlementInstructionStatus[]>
> = {
    [SettlementInstructionStatus.PENDING]: [
        SettlementInstructionStatus.PROCESSING,
        SettlementInstructionStatus.FAILED_RETRY,
        SettlementInstructionStatus.FAILED,
    ],
    [SettlementInstructionStatus.PROCESSING]: [
        SettlementInstructionStatus.COMPLETED,
        SettlementInstructionStatus.FAILED_RETRY,
        SettlementInstructionStatus.FAILED,
    ],
    [SettlementInstructionStatus.FAILED_RETRY]: [
        SettlementInstructionStatus.PROCESSING,
    ],
    // Terminal states: no outgoing transitions.
    [SettlementInstructionStatus.COMPLETED]: [],
    [SettlementInstructionStatus.FAILED]: [],
};

/**
 * Returns whether a direct transition from `from` to `to` is structurally
 * legal. Pure function — performs no I/O and no state changes.
 */
export function canTransition(
    from: SettlementInstructionStatus,
    to: SettlementInstructionStatus,
): boolean {
    return ALLOWED_SETTLEMENT_TRANSITIONS[from].includes(to);
}