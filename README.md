# Smart Cart 2.0

Smart Cart 2.0 is a modern, mobile-first e-commerce and logistics platform supporting Customers, Shopkeepers, and Delivery Riders. 

This repository contains the complete ecosystem for the platform, rebuilt from the ground up for scalability, type safety, and clear domain boundaries.

## Ecosystem
- **Backend**: NestJS Modular Monolith, PostgreSQL (PostGIS), Redis, BullMQ.
- **Mobile**: Kotlin Multiplatform (KMP) sharing networking and state, with Jetpack Compose (Android) and SwiftUI (iOS).
- **Admin**: Next.js web application.

## Current Project Phase
**Phase 2B (Database and PostGIS Implementation)** has been completed.
- Top-level directories established (`backend/`, `mobile/`, `admin/`, `infrastructure/`).
- NestJS backend scaffolded with core infrastructure modules (Config, Database, Redis, BullMQ, WebSocket, Health).
- Development Docker Compose created for Postgres+PostGIS and Redis.
- TypeORM Domain Entities and initial Schema Migrations generated.
- *Note: Business logic, controllers, and integrations have NOT been implemented yet.*

## Prerequisites
- Node.js (v20+ recommended)
- Docker Desktop
- npm (or yarn/pnpm)

## Setup Instructions
1. Navigate to the `infrastructure/` directory and start the services:
   ```bash
   cd infrastructure
   docker compose up -d
   ```
2. Navigate to the `backend/` directory, copy the environment file, and install dependencies:
   ```bash
   cd backend
   cp .env.example .env
   npm install
   ```
3. Start the NestJS backend in development mode:
   ```bash
   npm run start:dev
   ```
4. Access the API health check at `http://localhost:3000/api/v1/health` and the Swagger UI at `http://localhost:3000/api/v1/docs`.

## Documentation
Please refer to the `docs/` directory for detailed architectural guidelines before contributing:
- [Architecture](docs/ARCHITECTURE.md)
- [Database Design](docs/DATABASE_DESIGN.md)
- [API Specification](docs/API_SPECIFICATION.md)
- [Order State Machine](docs/ORDER_STATE_MACHINE.md)
- [Location & Tracking](docs/LOCATION_TRACKING.md)
- [Authentication](docs/AUTHENTICATION.md)
- [Payments](docs/PAYMENTS.md)
- [Development Rules](docs/DEVELOPMENT_RULES.md)
