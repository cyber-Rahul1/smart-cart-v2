/**
 * DI token for the provider-neutral payout provider.
 * The domain layer injects this token only; concrete providers are resolved
 * by payout-provider.factory.ts based on the PAYOUT_PROVIDER env variable.
 */
export const PAYOUT_PROVIDER = 'PAYOUT_PROVIDER';

/** Env variable selecting the payout provider implementation. */
export const PAYOUT_PROVIDER_ENV = 'PAYOUT_PROVIDER';

/** Config value: payouts disabled (production-safe default until a provider is selected). */
export const PAYOUT_PROVIDER_NONE = 'none';

/** Config value: simulated stub provider (non-production only). */
export const PAYOUT_PROVIDER_STUB = 'stub';

/**
 * Builds the deterministic provider idempotency key for a settlement
 * instruction's payout.
 *
 * The key MUST remain stable across automatic retries, reconciliation, and
 * manual retries so that the provider collapses duplicate dispatch attempts
 * into a single money movement. Never generate a per-attempt key.
 */
export function buildPayoutIdempotencyKey(settlementInstructionId: string): string {
    return `payout-${settlementInstructionId}`;
}