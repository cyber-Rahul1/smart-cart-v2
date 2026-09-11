import { describe, it, expect } from 'vitest';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import {
    ALLOWED_SETTLEMENT_TRANSITIONS,
    canTransition,
} from '../utils/settlement-status.transition.js';

const S = SettlementInstructionStatus;

describe('Settlement payout state machine (structural legality only)', () => {
    it('allows exactly the seven approved structural edges', () => {
        const legal: Array<[SettlementInstructionStatus, SettlementInstructionStatus]> = [
            [S.PENDING, S.PROCESSING],
            [S.PENDING, S.FAILED_RETRY],
            [S.PENDING, S.FAILED],
            [S.PROCESSING, S.COMPLETED],
            [S.PROCESSING, S.FAILED_RETRY],
            [S.PROCESSING, S.FAILED], // structurally legal; contextual no-money-moved guard belongs to Inc 2
            [S.FAILED_RETRY, S.PROCESSING],
        ];
        for (const [from, to] of legal) {
            expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
        }
    });

    it('treats COMPLETED and FAILED as terminal (no outgoing edges)', () => {
        for (const terminal of [S.COMPLETED, S.FAILED] as const) {
            for (const to of Object.values(S)) {
                expect(canTransition(terminal, to), `${terminal} -> ${to}`).toBe(false);
            }
        }
        expect(ALLOWED_SETTLEMENT_TRANSITIONS[S.COMPLETED]).toHaveLength(0);
        expect(ALLOWED_SETTLEMENT_TRANSITIONS[S.FAILED]).toHaveLength(0);
    });

    it('rejects skips and downgrades', () => {
        const illegal: Array<[SettlementInstructionStatus, SettlementInstructionStatus]> = [
            [S.PENDING, S.COMPLETED],
            [S.FAILED_RETRY, S.COMPLETED],
            [S.FAILED_RETRY, S.FAILED],
            [S.FAILED_RETRY, S.FAILED_RETRY],
            [S.COMPLETED, S.PROCESSING],
            [S.COMPLETED, S.FAILED_RETRY],
            [S.COMPLETED, S.FAILED],
            [S.FAILED, S.PROCESSING],
            [S.FAILED, S.FAILED_RETRY],
            [S.FAILED, S.COMPLETED],
            [S.PROCESSING, S.PENDING],
            [S.PROCESSING, S.PROCESSING],
            [S.PENDING, S.PENDING],
        ];
        for (const [from, to] of illegal) {
            expect(canTransition(from, to), `${from} -> ${to} must be illegal`).toBe(false);
        }
    });

    it('maps every enum status in the transition table (no missing keys)', () => {
        for (const status of Object.values(S)) {
            expect(Array.isArray(ALLOWED_SETTLEMENT_TRANSITIONS[status])).toBe(true);
        }
    });

    it('performs no state changes (pure helper)', () => {
        const before = JSON.stringify(ALLOWED_SETTLEMENT_TRANSITIONS);
        canTransition(S.PENDING, S.PROCESSING);
        canTransition(S.PROCESSING, S.FAILED);
        expect(JSON.stringify(ALLOWED_SETTLEMENT_TRANSITIONS)).toBe(before);
    });
});