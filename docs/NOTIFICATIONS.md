# Notifications Architecture

## Categories & Priorities
Notifications are categorized to apply different rules:
1. **Operational/Transactional**: High priority. Timely delivery required. Includes rider dispatch offers, and customer order milestones (`PLACED`, `PREPARING`, `RIDER_ASSIGNED`, `PICKED_UP`, `OUT_FOR_DELIVERY`, `ARRIVING`, `DELIVERED`).
2. **Marketing/Promotional**: Low priority. Subject to strict throttling, grouping, and frequency caps.

## Rules & Event Ordering
- **Notification Event Model**: To ensure safe event processing (especially during retries and out-of-order queue delivery), events pushed to BullMQ MUST include at minimum: `unique event ID`, `event type`, `entity/order ID`, `event creation timestamp`, and a `monotonic sequence/order version`.
- **Deduplication**: Duplicate events are safely discarded by checking the unique event ID and idempotency keys.
- **Stale Event Suppression**: Obsolete events are suppressed by comparing the event's creation timestamp and monotonic sequence against the current entity version. We do NOT rely solely on reading the current order state. Meaningful lifecycle ordering is preserved.
- **Marketing Grouping**: Promotional messages are grouped and throttled to prevent spamming.

## Infrastructure
- **Message Queue**: BullMQ (Redis-backed) with separate queues/priorities for operational vs marketing.
- **Online WebSocket vs Push**: 
  - If the user is actively connected via WebSocket, in-app messaging handles state updates seamlessly (avoiding disruptive push banners while the app is open).
  - Push Notifications (FCM/APNs) act as the delivery mechanism when the user is backgrounded or disconnected.

## Device Token Management
- `Device` table tracks `fcmToken`, `osType`, `appVersion`, mapped to `userId`.
- Tokens are updated on app launch and login.
- Inactive tokens are purged upon receiving `UNREGISTERED` errors from FCM/APNs.
