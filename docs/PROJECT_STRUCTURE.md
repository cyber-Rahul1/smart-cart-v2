# Project Structure

```text
smart-cart-v2/
├── docs/                     # Architecture, DB design, ADRs
├── backend/                  # NestJS Monolith
│   ├── src/
│   │   ├── core/             # Auth, Config, Database, Logging
│   │   ├── modules/          # Domain Modules (Users, Orders, Shops, Tracking)
│   │   ├── providers/        # External integrations (Twilio, Razorpay)
│   │   └── main.ts
│   ├── package.json
│   └── docker-compose.yml    # Local Redis, Postgres+PostGIS
├── mobile/                   # KMP Project
│   ├── shared/               # KMP shared business logic, networking, DB
│   ├── androidApp/           # Jetpack Compose application
│   └── iosApp/               # SwiftUI application
├── admin/                    # Next.js React Admin Panel
│   ├── src/
│   ├── package.json
│   └── next.config.js
├── infrastructure/           # Terraform/Pulumi, CI/CD pipelines
└── README.md
```
