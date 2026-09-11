/**
 * Normalized, provider-neutral outcome of a synchronous payout dispatch attempt.
 *
 * ACCEPTED   - Provider synchronously accepted the request and returned a transfer id.
 * PROCESSING - Provider accepted but is still processing; no final outcome yet.
 * COMPLETED  - Provider synchronously confirmed completion (rare; most providers are async).
 * FAILED     - Provider definitively rejected the request. Whether money moved is a
 *              provider-contract question and MUST be verified by Increment 2 dispatch
 *              logic before any PROCESSING -> FAILED transition is written.
 * UNKNOWN    - Ambiguous outcome (timeout, 5xx, connection loss). Money may or may not
 *              have moved. Must be treated as possibly-moved and resolved via
 *              reconciliation/webhook.
 */
export enum PayoutDispatchStatus {
    ACCEPTED = 'ACCEPTED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    UNKNOWN = 'UNKNOWN',
}