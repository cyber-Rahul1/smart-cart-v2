import { PayoutDispatchStatus } from '../enums/payout-dispatch-status.enum.js';
import { PayoutProviderStatus } from '../enums/payout-provider-status.enum.js';

/**
 * Provider-neutral payout dispatch request.
 * The domain layer builds this from the immutable SettlementInstruction
 * financial snapshot. No provider SDK types may appear here.
 */
export interface PayoutDispatchRequest {
    /**
     * Deterministic idempotency key: `payout-<settlementInstructionId>`.
     * MUST be stable across retries, reconciliation, and manual retries.
     * Generated exclusively via buildPayoutIdempotencyKey().
     */
    providerIdempotencyKey: string;
    /** Exact minor units from the stored providerNetSettlement snapshot. */
    amountInMinorUnits: number;
    currency: string;
    /** Provider-neutral beneficiary/payout account reference. */
    beneficiaryRef: string;
    /** Human-readable narration, e.g. `settlement-order-<orderId>`. */
    narration: string;
}

/**
 * Normalized synchronous dispatch outcome.
 * `status` is the single authoritative field — no boolean flags that could
 * contradict it.
 *
 * Interpretation contract:
 * - ACCEPTED / PROCESSING: provider took the request; money movement may be in flight.
 * - FAILED: provider definitively rejected the request. Whether money moved is a
 *   provider-contract question; Increment 2 dispatch logic MUST verify the
 *   provider contract before writing any PROCESSING -> FAILED transition.
 * - UNKNOWN: ambiguous (timeout / 5xx / connection loss). MUST be treated as
 *   possibly-moved and resolved via reconciliation or webhook.
 */
export interface PayoutDispatchResult {
    providerTransferId: string | null;
    status: PayoutDispatchStatus;
    errorCode: string | null;
    /** Sanitized provider error context. Must never contain credentials/PII. */
    errorDetails: unknown;
}

/**
 * Normalized payout status as returned by provider status queries
 * (used by Increment 4 reconciliation).
 */
export interface PayoutStatusResult {
    providerTransferId: string | null;
    status: PayoutProviderStatus;
    /** Sanitized provider response snapshot. Must never contain credentials/PII. */
    providerResponse: unknown;
}

/**
 * Normalized payout webhook event (used by the webhook service).
 *
 * STRICT NORMALIZATION CONTRACT:
 * The webhook service blindly trusts the status returned here. It is the
 * exclusive responsibility of the IPayoutProvider adapter to determine if an
 * event maps to FAILED.
 *
 * The adapter may return PayoutProviderStatus.FAILED ONLY when the provider's
 * webhook semantics definitively establish that the payout was rejected and
 * NO MONEY MOVED.
 *
 * Any ambiguous failure, cancellation, timeout, unknown state, or event where
 * money movement cannot be categorically ruled out MUST be normalized to
 * PayoutProviderStatus.UNKNOWN or PayoutProviderStatus.PROCESSING.
 */
export interface ParsedPayoutWebhookEvent {
    providerEventId: string;
    providerTransferId: string;
    status: PayoutProviderStatus;
}

/**
 * Provider-neutral payout provider contract.
 *
 * The domain layer depends ONLY on this interface (DI token `PAYOUT_PROVIDER`).
 * Provider-specific code is isolated in `financials/providers/<name>.*.provider.ts`
 * and selected via the `PAYOUT_PROVIDER` environment variable.
 *
 * NOTE: This interface intentionally contains NO dispatch orchestration,
 * state transitions, or persistence — those belong to Increment 2+ services.
 */
export interface IPayoutProvider {
    dispatchPayout(req: PayoutDispatchRequest): Promise<PayoutDispatchResult>;
    getPayoutStatus(providerTransferId: string): Promise<PayoutStatusResult>;
    verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): boolean;
    parseWebhookEvent(payload: unknown): ParsedPayoutWebhookEvent;
}