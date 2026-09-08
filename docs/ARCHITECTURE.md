# Smart Cart 2.0 Architecture

## Overview
Smart Cart 2.0 is a mobile-first e-commerce and delivery platform designed for scale. It serves multiple user types (Customers, Shopkeepers, Riders, Admins) through dedicated applications powered by a single modular monolithic backend.

## Technology Stack

### Mobile Apps (Customer, Shopkeeper, Rider)
- **Core Framework**: Kotlin Multiplatform (KMP) for shared business logic and state management.
- **UI Frameworks**: 
  - Android: Jetpack Compose
  - iOS: SwiftUI
- **Shared Networking**: Ktor Client
- **Serialization**: kotlinx.serialization
- **Concurrency**: Kotlin Coroutines
- **Dependency Injection**: Koin
- **Local Storage**: SQLDelight
- **Date/Time**: kotlinx.datetime

### Backend API
- **Framework**: NestJS (TypeScript)
- **Architecture Style**: Modular Monolith, REST API (Primary) + WebSockets
- **Primary Database**: PostgreSQL (Source of truth)
- **Spatial Queries**: PostGIS
- **Caching & Live State**: Redis
- **Background Jobs**: BullMQ
- **ORM**: TypeORM
- **Documentation**: Swagger/OpenAPI

### Admin Panel
- **Framework**: Next.js + React
- **Integration**: Communicates with the NestJS REST API

### External Services
- **Location & Routing**: Google Maps Platform, Google Routes API, Navigation SDK
- **Authentication**: Twilio Verify (Phone OTP)
- **Payments**: Razorpay (Abstracted to allow future providers like Stripe)
- **Push Notifications**: Firebase Cloud Messaging (FCM) for Android, APNs for iOS
- **Media Storage**: Cloudinary
- **Analytics & Crash Reporting**: Firebase Analytics, Firebase Crashlytics
- **Remote Configuration**: Firebase Remote Config

## Core Architectural Principles

1. **Modular Monolith**: Start with a well-structured monolith. Business domains (Orders, Users, Inventory, Locations) are strictly separated into NestJS modules to allow easy microservice extraction later if necessary.
2. **API First**: RESTful APIs drive all client interactions.
3. **Event-Driven Asynchrony**: Heavy operations and side effects (like sending notifications) are offloaded to BullMQ.
4. **Stateless APIs**: The API servers are stateless. All transient state (like active WebSockets and live rider locations) is managed via Redis.
5. **Mobile-First Design**: API payloads are optimized for mobile consumption.
6. **Server-Authoritative Pricing**: Clients cannot be trusted for pricing, distance, or delivery fee logic. The backend recalculates everything (using PostGIS for distance) at the time of checkout.
7. **Exact Monetary Calculations**: To avoid floating-point math errors, all monetary amounts are manipulated as integer minor units (paise/cents) internally, converting back to decimals for final storage or DTO representations.
8. **Ephemeral Checkout Quotes**: Checkout preview quotes (`/checkout/preview`) are ephemeral. They do not persist to a database or lock prices. Ultimate order creation re-verifies these constraints.
