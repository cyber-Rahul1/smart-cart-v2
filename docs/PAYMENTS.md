# Payments Architecture

## Principles
- **Provider Agnosticism**: The domain modules must NOT depend directly on Razorpay SDK types or provider-specific concepts.
- **Zero Trust**: Client apps initiate payments, but the backend NEVER trusts the client's assertion that a payment succeeded. Payment status changes must be validated server-side.
- **Webhook Driven**: Payment states transition to `SUCCESS` only upon receiving a cryptographically verified webhook from the payment provider.
- **Idempotency**: All payment operations and webhook processing must be idempotent to protect against duplicate delivery.

## Boundary & Abstraction
The boundary between the Order domain, Payment domain, and the specific Payment Provider is strictly defined.

### IPaymentProvider Interface
A provider-neutral interface must be implemented by the specific provider adapter (e.g., RazorpayProvider, StripeProvider):
```typescript
interface IPaymentProvider {
  createPaymentSession(orderId: string, amount: number, currency: string): Promise<PaymentSessionResult>;
  getPaymentStatus(providerTransactionId: string): Promise<PaymentStatus>;
  refundPayment(providerTransactionId: string, amount: number, reason: string): Promise<RefundResult>;
  verifyWebhook(signature: string, payload: any): boolean;
  parseWebhookEvent(payload: any): ParsedWebhookEvent;
}
```

## Flow
1. Customer initiates checkout. Order created as `PAYMENT_PENDING`.
2. Backend calls `createPaymentSession` and returns a provider-agnostic token/ID to the client.
3. Client uses the specific provider SDK (Razorpay) to process payment.
4. Client SDK returns success to the App. App optimistically updates UI, but waits for backend confirmation.
5. Provider sends a Server-to-Server Webhook.
6. Backend validates webhook signature (`verifyWebhook`).
7. Backend parses the event (`parseWebhookEvent`).
8. Backend checks idempotency keys to ignore duplicate webhooks.
9. Backend updates `Payment` and `Order` to `PLACED`.
10. Backend pushes `order_status_update` via WebSocket to Customer App.

## Webhook Resilience & Reconciliation
Webhook processing remains the primary and authoritative mechanism for provider events. However, a reconciliation strategy is required for delayed or missed webhooks:
- A scheduled cron job identifies `PAYMENT_PENDING` orders that have been stuck for an abnormal period.
- The job calls the `getPaymentStatus` method on the `IPaymentProvider` abstraction to fetch the actual status server-side.
- **Concurrency & Safety**: Concurrent webhook processing and reconciliation checks must be safe. Both must use database transactions and optimistic locking to ensure the payment transitions exactly once.
- Reconciliation must never blindly mark payments successful; it strictly syncs the backend state with the authoritative provider status.

## Refunds & Failures
- **Refunds**: Represented as a separate `Refund` entity linked to a `Payment`, tracking the refund amount, reason, and status. Triggered via the `refundPayment` abstraction.
- **Failures & Retries**: Failed payments transition the order state. Retries involve creating a new payment session.
