# Architecture Decision Records (ADR)

This file tracks significant technical and business decisions.

## Template

### [Decision Title]
- **Status**: [PROPOSED | CONFIRMED | OPEN]
- **Date**: YYYY-MM-DD
- **Decision**: What was decided.
- **Reason**: Why it was decided (context and drivers).
- **Alternatives**: What else was considered.
- **Consequences**: Trade-offs, impact on the system.

---

## 1. Modular Monolith over Microservices
- **Status**: CONFIRMED
- **Date**: 2026-09-05
- **Decision**: Start with a modular monolith NestJS backend instead of microservices.
- **Reason**: Premature microservices introduce network boundaries, distributed transactions, and deployment complexity before the domain is fully understood.
- **Alternatives**: Domain-driven microservices.
- **Consequences**: Easier local development, single deployment artifact. Requires strict module boundary discipline to prevent spaghetti code.

## 2. KMP over Flutter/React Native
- **Status**: CONFIRMED
- **Date**: 2026-09-05
- **Decision**: Use Kotlin Multiplatform for shared logic, with native UI.
- **Reason**: Mandated by architecture. Maximizes performance and platform-specific UX (Compose/SwiftUI) while reusing networking and state logic.
- **Alternatives**: Flutter, React Native.
- **Consequences**: Requires native UI expertise on both platforms.

## 3. Rider Location Retention Strategy
- **Status**: CONFIRMED
- **Date**: 2026-09-05
- **Decision**: Implement a 3-layer location retention strategy: 1) Redis for high-frequency live state only, 2) PostgreSQL for sampled historical tracking (every 15-30s) persisted via an asynchronous queue (BullMQ), retained for 30 days (configurable), 3) Permanent storage for key delivery lifecycle events (ASSIGNED, DELIVERED, etc.). Redis is NOT the source of truth for history.
- **Reason**: High-frequency GPS updates would overwhelm the primary DB. Most fine-grained location data is useless after a short period. Redis TTL expiration should not cause historical data loss.
- **Alternatives**: Store all points permanently, or discard all points immediately, or rely on a cron job reading Redis.
- **Consequences**: Keeps DB size manageable and respects rider privacy while providing resilient asynchronous persistence for history.

## 4. Payment Provider Abstraction & Webhook Resilience
- **Status**: CONFIRMED
- **Date**: 2026-09-05
- **Decision**: Introduce an abstract `PaymentProvider` interface. Webhooks must be verified server-side and handled idempotently as the primary mechanism. Additionally, implement a server-side reconciliation job to safely check provider status for delayed/missed webhooks.
- **Reason**: To allow replacing Razorpay with Stripe or other providers in the future without rewriting core business logic. Reconciliation ensures payments aren't stuck in `PAYMENT_PENDING` indefinitely if a webhook is missed.
- **Alternatives**: Rely exclusively on webhooks or exclusively on polling.
- **Consequences**: Requires careful concurrency control to safely handle simultaneous webhook and reconciliation processing.

## 5. Push Notification Event Ordering
- **Status**: CONFIRMED
- **Date**: 2026-09-05
- **Decision**: Define a robust notification event model using unique event ID, event type, entity ID, creation timestamp, and monotonic sequence/order version. Transactional notifications (e.g., order milestones, rider dispatch) are delivered immediately, deduplicated, and obsolete events are safely suppressed based on this model, not just current state. Marketing notifications have separate throttling rules.
- **Reason**: Safely handles retries and out-of-order queue delivery, ensuring meaningful lifecycle ordering and preventing spam.
- **Alternatives**: Rely strictly on the current DB state to infer event relevance.
- **Consequences**: Requires a strictly defined event schema for all BullMQ notification payloads.
