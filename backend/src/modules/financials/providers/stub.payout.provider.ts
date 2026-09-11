import { Injectable } from '@nestjs/common';
import { PayoutDispatchStatus } from '../enums/payout-dispatch-status.enum.js';
import { PayoutProviderStatus } from '../enums/payout-provider-status.enum.js';
import {
    IPayoutProvider,
    ParsedPayoutWebhookEvent,
    PayoutDispatchRequest,
    PayoutDispatchResult,
    PayoutStatusResult,
} from '../interfaces/payout-provider.interface.js';

/**
 * Simulation modes for the stub provider. The stub NEVER moves real money —
 * every result is explicitly marked as simulated.
 */
export enum StubPayoutMode {
    /** Simulated synchronous acceptance with a transfer id. */
    ACCEPTED = 'ACCEPTED',
    /** Simulated acceptance still processing (no transfer id yet). */
    PROCESSING = 'PROCESSING',
    /** Simulated definitive rejection (no money moved in simulation). */
    FAILED = 'FAILED',
    /** Simulated ambiguous outcome (timeout-like). */
    UNKNOWN = 'UNKNOWN',
}

export interface StubPayoutOptions {
    /**
     * Default mode applied to every dispatch. Tests may instead script
     * per-key behavior via `scriptedModes`.
     */
    defaultMode?: StubPayoutMode;
    /**
     * Optional per-idempotency-key script. Keys not present fall back to
     * `defaultMode`.
     */
    scriptedModes?: Record<string, StubPayoutMode>;
}

/**
 * SIMULATED payout provider for tests and local development ONLY.
 *
 * Safety guarantees:
 * - Performs no network I/O and no external calls of any kind.
 * - Refuses to instantiate when NODE_ENV is 'production' (belt-and-braces
 *   beyond the Joi env validation, which already rejects 'stub' there).
 * - All transfer ids are prefixed `stub_transfer_` and results carry
 *   `simulated: true` so they can never be mistaken for real transfers.
 * - Has no webhook contract: verifyWebhook() always returns false and
 *   parseWebhookEvent() always throws.
 */
@Injectable()
export class StubPayoutProvider implements IPayoutProvider {
    private readonly defaultMode: StubPayoutMode;
    private readonly scriptedModes: Record<string, StubPayoutMode>;
    private readonly statusByTransferId = new Map<string, PayoutProviderStatus>();

    constructor(options: StubPayoutOptions = {}) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'StubPayoutProvider is forbidden in production. Set PAYOUT_PROVIDER to a real provider or "none".',
            );
        }
        this.defaultMode = options.defaultMode ?? StubPayoutMode.ACCEPTED;
        this.scriptedModes = options.scriptedModes ?? {};
    }

    async dispatchPayout(req: PayoutDispatchRequest): Promise<PayoutDispatchResult> {
        const mode = this.scriptedModes[req.providerIdempotencyKey] ?? this.defaultMode;

        switch (mode) {
            case StubPayoutMode.ACCEPTED: {
                const transferId = `stub_transfer_${req.providerIdempotencyKey}`;
                this.statusByTransferId.set(transferId, PayoutProviderStatus.COMPLETED);
                return {
                    providerTransferId: transferId,
                    status: PayoutDispatchStatus.ACCEPTED,
                    errorCode: null,
                    errorDetails: { simulated: true },
                };
            }
            case StubPayoutMode.PROCESSING: {
                const transferId = `stub_transfer_${req.providerIdempotencyKey}`;
                this.statusByTransferId.set(transferId, PayoutProviderStatus.PROCESSING);
                return {
                    providerTransferId: transferId,
                    status: PayoutDispatchStatus.PROCESSING,
                    errorCode: null,
                    errorDetails: { simulated: true },
                };
            }
            case StubPayoutMode.FAILED:
                return {
                    providerTransferId: null,
                    status: PayoutDispatchStatus.FAILED,
                    errorCode: 'STUB_REJECTED',
                    errorDetails: { simulated: true, reason: 'Scripted rejection (no money moved in simulation)' },
                };
            case StubPayoutMode.UNKNOWN:
            default:
                return {
                    providerTransferId: null,
                    status: PayoutDispatchStatus.UNKNOWN,
                    errorCode: 'STUB_TIMEOUT',
                    errorDetails: { simulated: true, reason: 'Scripted ambiguous outcome' },
                };
        }
    }

    async getPayoutStatus(providerTransferId: string): Promise<PayoutStatusResult> {
        const status = this.statusByTransferId.get(providerTransferId);
        return {
            providerTransferId,
            status: status ?? PayoutProviderStatus.NOT_FOUND,
            providerResponse: { simulated: true },
        };
    }

    verifyWebhook(_signature: string, _rawBody: Buffer): boolean {
        // The stub has no webhook contract and must never pretend otherwise.
        return false;
    }

    parseWebhookEvent(_payload: unknown): ParsedPayoutWebhookEvent {
        throw new Error('StubPayoutProvider has no webhook contract; parseWebhookEvent is not supported.');
    }
}