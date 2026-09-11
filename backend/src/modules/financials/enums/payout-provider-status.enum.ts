/**
 * Normalized, provider-neutral payout status as reported by status queries
 * (reconciliation) and webhooks.
 *
 * PROCESSING - Provider is still moving/processing the payout.
 * COMPLETED  - Provider confirms the payout settled successfully.
 * FAILED     - Provider reports the payout definitively failed. Whether money
 *              moved is a provider-contract question and MUST be verified by
 *              Increment 2 reconciliation logic before any terminal write.
 * NOT_FOUND  - Provider has no record for the given transfer reference.
 * UNKNOWN    - Provider could not be reached or returned an uninterpretable
 *              status. Treat as ambiguous; keep local state unchanged.
 */
export enum PayoutProviderStatus {
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    NOT_FOUND = 'NOT_FOUND',
    UNKNOWN = 'UNKNOWN',
}