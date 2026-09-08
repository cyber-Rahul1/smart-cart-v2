# Development Rules

1. **Thin Controllers**: Controllers are only responsible for HTTP request/response mapping and DTO validation. Absolutely no business logic in controllers.
2. **Repository Pattern**: Database access must go through dedicated repositories or TypeORM Data Access layers. Services should not write raw SQL unless optimized PostGIS queries are required.
3. **Identity Trust**: The authenticated user's ID is derived from the Request Context (JWT Guard), NEVER from the request body.
4. **State Machines Server-Side**: All state transitions (Orders, Deliveries) are validated server-side.
5. **Transactions**: Use database transactions whenever modifying multiple tables (e.g., deducting inventory and creating an order).
6. **Abstraction**: External services (Twilio, Razorpay, Google Maps) must be abstracted behind application-specific interfaces.
7. **Secrets**: No hardcoded secrets. Use environment variables and configuration management (`@nestjs/config`).
8. **Structured Logging**: Use JSON structured logging (e.g., Pino) for backend services.
9. **No Silent Overrides**: Do not attempt to bypass app store review with executable code replacement. Use Firebase Remote Config only for configuration data and feature flags.
