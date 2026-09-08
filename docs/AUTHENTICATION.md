# Authentication & Security

## Strategy
## Phase 3A Final Implementation Details

- **Device Entity**: The `Device` entity explicitly models both a physical device and an authentication session. A single User can have multiple Devices (Sessions).
- **Rate Limiting**: OTP send and verify requests are protected by a custom `PhoneThrottlerGuard` configured to a maximum of 5 requests per 15 minutes, specifically keyed by the `phoneNumber` in the request body to prevent IP rotation bypasses.
- **Refresh Token Concurrency**: The `Device` entity utilizes TypeORM's `@VersionColumn()` to enforce Optimistic Locking. This prevents concurrent refresh token requests from creating a race condition that would accidentally leave two tokens valid or improperly overwrite a session.
- **Object Ownership**: The system implements an `OwnershipGuard` foundational pattern, mapping URLs to entities and verifying `entity.userId === currentUser.id`. It automatically allows `SUPER_ADMIN` and `ADMIN` to bypass this check.
- **Role Changes**: Currently, access tokens hold the roles for 15 minutes. To immediately reflect a role change (e.g. suspending a user or stripping admin privileges), the `AuthService` must revoke the `Device` session, forcing the client to re-authenticate or refresh (which will fail if suspended).

## Passwordless Authentication Flowusing Phone Numbers and One-Time Passwords (OTP).

## Providers
- **OTP Delivery**: Twilio Verify API.
- **Tokens**: JSON Web Tokens (JWT) for stateless backend verification.

## Token Lifecycle
1. **Access Token**: Short-lived (e.g., 15 minutes). Contains `userId` and `roles`.
2. **Refresh Token**: Long-lived (e.g., 30 days). Stored securely (HttpOnly cookie for Web Admin, Encrypted SharedPreferences/Keychain for Mobile).
3. **Rotation**: Using a refresh token issues a new access token and a new refresh token. The old refresh token is invalidated to detect replay attacks.

## Role-Based Access Control (RBAC)
- Identity is established strictly via the JWT payload, never by trusting a `userId` in the request body.
- Endpoints are protected by Guards that enforce required roles (`CUSTOMER`, `SHOPKEEPER`, `RIDER`, `ADMIN`, `SUPER_ADMIN`).
- **Object-Level Authorization**: Even if a user is a `CUSTOMER`, the backend must verify that the Order ID they are requesting actually belongs to them.

## Delivery OTP
- Independent of login OTP.
- Generated securely by the backend when an order transitions to `OUT_FOR_DELIVERY`.
- Visible only to the Customer.
- Rider inputs it to the backend to complete delivery.

## Security Measures
- **Rate Limiting**: Strict limits on `/send-otp` to prevent SMS pumping fraud.
- **Request Validation**: All incoming payloads strictly validated using DTOs (class-validator).
