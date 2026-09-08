# API Specification & Boundaries

## API Style
- RESTful HTTP APIs.
- JSON payloads.
- Base path: `/api/v1`

## Standard Response Format
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

## Error Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": [...]
  }
}
```

## Module Boundaries

### Auth Module (`/api/v1/auth`)
- `POST /send-otp`
- `POST /verify-otp`
- `POST /refresh`
- `POST /logout`

### Users Module (`/api/v1/users`)
- `GET /me`
- `PATCH /me`
- `GET /me/addresses`
- `POST /me/addresses`
- `GET /me/addresses/:addressId`
- `PATCH /me/addresses/:addressId`
- `DELETE /me/addresses/:addressId`
- `POST /me/addresses/:addressId/default`
- `GET /me/devices`
- `DELETE /me/devices/:deviceId`

### Riders Module (`/api/v1/rider`)
- `GET /me`
- `PATCH /me` (Allowed fields: name, vehicleType, vehicleRegistration)
- `GET /me/status`
- `POST /me/status` (Changes availability. Requires body `{ status, version }`)

### Shops Module (`/api/v1/shops`)
- `GET /` (Query by location radius)
- `GET /:id`
- `GET /:id/products`

### Checkout Module (`/api/v1/checkout`)
- `POST /preview` (Prepare checkout quote)

### Orders Module (`/api/v1/orders`)
- `POST /` (Create Order)
- `GET /:id`
- `PATCH /:id/status` (Internal/Rider/Shopkeeper interactions)

### Deliveries Module (`/api/v1/deliveries`)
- `GET /available` (For riders)
- `POST /:id/accept`
- `POST /:id/verify-otp` (Dropoff confirmation)

### Tracking Module (WebSockets)
- Namespace: `/tracking`
- Events: `location_update`, `order_status_update`
