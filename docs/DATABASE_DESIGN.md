# Database Design

## Principles
- **Source of Truth**: PostgreSQL
- **Spatial Data**: PostGIS (`geography` type used for realistic distance calculations over the Earth's surface)
- **Integrity**: Strict foreign keys, check constraints, and unique indexes.
- **Auditability**: All critical tables have `createdAt`, `updatedAt`, and `deletedAt` (Soft Deletes where appropriate).
- **Concurrency**: Optimistic locking (version columns) for highly contended rows like Inventory or Order states.

## Core Entities

### 1. User
- **Purpose**: Represents an authenticated individual across the system.
- **Fields**: `id` (UUID, PK), `phoneNumber` (Unique), `roles` (Enum Array: CUSTOMER, SHOPKEEPER, RIDER, ADMIN), `status` (Enum: ACTIVE, SUSPENDED), `createdAt`, `updatedAt`.

### 2. Profile Entities (CustomerProfile, RiderProfile, ShopkeeperProfile)
- **Purpose**: Role-specific data mapped 1:1 to a User.
- **RiderProfile Specifics**: Includes `kycStatus` (PENDING, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, SUSPENDED), `availabilityStatus` (OFFLINE, ONLINE, BUSY, SUSPENDED), `vehicleRegistration`, `licenseNumber`, and `version` (for optimistic locking of availability state).

### 3. Shop
- **Purpose**: Represents a physical store.
- **Fields**: `id` (UUID), `ownerId` (FK to User), `name`, `description`, `location` (PostGIS Geography Point), `status` (Enum), `createdAt`, `updatedAt`.
- **Indexes**: GIST index on `location` for nearby queries.

### 4. ShopHours
- **Purpose**: Operating schedules for shops.

### 5. Product & Category
- **Purpose**: Inventory catalog. Products belong to a Shop and a Category.

### 6. Address
- **Purpose**: Saved user delivery addresses.
- **Fields**: `id`, `userId`, `label`, `addressLine`, `location` (PostGIS Point), `isDefault`.

### 7. Order
- **Purpose**: Central transactional entity.
- **Fields**: `id`, `customerId`, `shopId`, `status` (Enum, see ORDER_STATE_MACHINE), `totalAmount`, `deliveryFee`, `createdAt`, `updatedAt`, `version` (for optimistic locking).

### 8. OrderItem
- **Purpose**: Line items for an Order.

### 9. Delivery
- **Purpose**: Represents the logistics of fulfilling an order.
- **Fields**: `id`, `orderId` (FK), `riderId` (FK, nullable initially), `pickupLocation`, `dropoffLocation`, `deliveryOtp` (Hashed/Encrypted), `status`.

### 10. Payment
- **Purpose**: Financial transaction record.
- **Fields**: `id`, `orderId`, `amount`, `provider` (e.g., 'RAZORPAY'), `providerTransactionId`, `status` (PENDING, SUCCESS, FAILED, REFUNDED).

### 11. RiderLocation (Historical)
- **Purpose**: Periodic snapshots of rider locations for auditing/disputes.
- **Note**: Not for live tracking. High-frequency live tracking stays in Redis. Historic points saved periodically (e.g., every 5 mins or upon key events).

### 12. AuditLog
- **Purpose**: Immutable ledger of critical state changes (e.g., order state changes, admin actions).

## Implementation Notes (Phase 2B)

### 1. Monetary Precision
All monetary columns (prices, totals, fees, taxes, payments, refunds, commissions, payouts) use a strict `numeric(14,2)` precision to ensure consistency and capacity across the platform.

### 2. TypeORM ESM Compatibility
To support Node.js ESM alongside TypeORM's `emitDecoratorMetadata` without triggering `TS1272` or runtime circular dependency (`ReferenceError`) issues, relationships are typed using the official TypeORM `Relation<T>` utility. To comply with TS1272 restrictions on decorated signatures, the `Relation` utility itself is imported as a type (`import { type Relation } from 'typeorm'`). Entity circular references are resolved by passing the target name as a string (`@ManyToOne('Entity')`).
