# Location & Live Tracking Architecture

## 1. Static Locations (PostGIS)
- **Use Case**: Shop locations, Customer Addresses, Delivery Geofences.
- **Storage**: PostgreSQL `geography` type.
- **Indexes**: GIST indexes for fast `ST_DWithin` (radius) queries.

## 2. Live Rider Tracking (Redis & WebSockets)
Redis is the high-frequency live-state/cache layer only. It is **NOT** the source of truth for historical persistence.

### Architecture Flow
1. **Rider App** uses native location APIs to get GPS coordinates.
2. Depending on Rider State (`OFF_DUTY`, `ONLINE`, `DELIVERY_ACTIVE`), the app adjusts tracking intensity (e.g., 30s vs 5s intervals).
3. App sends location payload over active **WebSocket** (or HTTP fallback) to the backend Location Service.
4. Backend updates the Rider's current location in **Redis**.
   - **Key Structure**: `rider:{riderId}:location`
   - **TTL**: Short TTL so stale locations expire if the rider goes offline. Expiration does **not** imply intentional loss of historical data.
5. If the Rider is on an active delivery, the backend publishes the location over a Redis Pub/Sub channel to the Customer App.

## 3. Historical Retention (PostgreSQL & Async Pipeline)
PostgreSQL is the historical source of truth. We use a sampled retention strategy:
- The Location Service pushes eligible sampled locations (approx. every 15-30 seconds) into an **asynchronous persistence pipeline/queue (BullMQ)** while a delivery is active.
- A BullMQ worker consumes this queue and persists the points to PostgreSQL (`RiderLocation` table).
- **Idempotency & Resilience**: The persistence mechanism relies on the queue's retry behavior for failure handling. If Redis is temporarily unavailable, live tracking degrades but historical persistence directly from the Location Service to the queue still functions. If PostgreSQL is temporarily unavailable, BullMQ safely queues and retries the persistence.
- **Retention Policy**: Detailed historical points are retained for 30 days (configurable via env vars) and then cleaned up by a cron job.
- **Privacy**: Location is not tracked or persisted when the rider is `OFF_DUTY`. When `ONLINE` but not on an active delivery, coarse location may be used for dispatch but not heavily persisted.

## 4. Permanent Delivery Audit
- Key delivery lifecycle events are permanently persisted with the relevant order/delivery record, independent of GPS trace retention.
- **Events**: `ASSIGNED`, `RIDER_ACCEPTED`, `ARRIVED_AT_PICKUP`, `PICKED_UP`, `OUT_FOR_DELIVERY`, `ARRIVING`, `DELIVERED`, `DELIVERY_FAILED`.
- Geofence decisions (e.g., "Rider claimed ARRIVED while 50m from destination") are recorded in this audit trail with the relevant timestamp and metadata.

## 5. Geofencing
- **Pickup**: Rider must be within X meters of the Shop location to trigger the `PICKED_UP` state.
- **Delivery**: Rider must be within Y meters of the Customer address to trigger `ARRIVING` and accept the Delivery OTP.
- Geofence calculations are validated **Server-Side**. The API contract allows the mobile app to submit coordinates, but the backend decides if they satisfy the geofence. This prevents client-side tampering.
