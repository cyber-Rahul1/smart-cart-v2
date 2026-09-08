# Order State Machine

The order lifecycle is strictly controlled by a backend state machine. Clients cannot pass arbitrary states; they request transitions which the backend validates against current state and rules.

## Valid States

### Happy Path Transitions
1. `CREATED`: Initial state when checkout begins.
2. `PAYMENT_PENDING`: Waiting for payment gateway webhook/confirmation.
3. `PLACED`: Payment successful, order is visible to the shop.
4. `SHOP_ACCEPTED`: Shop confirms they can fulfill it.
5. `PREPARING`: Shop is actively preparing the items.
6. `READY_FOR_PICKUP`: Items are packed and waiting for the rider.
7. `RIDER_ASSIGNED`: A rider has accepted the delivery ping.
8. `RIDER_ACCEPTED`: Rider acknowledges.
9. `PICKED_UP`: Rider physically collects the order (geofence + shop confirmation).
10. `OUT_FOR_DELIVERY`: Rider is moving towards the customer.
11. `ARRIVING`: Rider is within the delivery geofence.
12. `DELIVERED`: Delivery OTP is successfully verified by the rider.

### Failure & Exception States
- `PAYMENT_FAILED`: Payment gateway reported failure.
- `REJECTED`: Shop declined the order (e.g., out of stock).
- `CANCELLED`: Customer cancelled (only allowed before `PREPARING`).
- `DELIVERY_FAILED`: Rider could not deliver (e.g., customer unreachable).
- `REFUNDED`: Post-payment refund processed.
- `DISPUTED`: Customer raised an issue post-delivery.

## Rules
- All state transitions must generate an `AuditLog` entry.
- State transitions trigger corresponding Pub/Sub events (BullMQ) to handle side effects (e.g., sending push notifications, alerting riders).
