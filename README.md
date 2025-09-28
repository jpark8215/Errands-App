# ErrandsBuddy - Peer-to-Peer Task Marketplace

A comprehensive mobile-first platform that connects task requesters with nearby Taskers for immediate, non-food-related tasks. Built with a microservices architecture and AI-powered matching algorithms.

## Architecture

- **Backend**: Node.js/TypeScript with Express.js and GraphQL
- **Database**: PostgreSQL with PostGIS for geospatial queries
- **Caching**: Redis for real-time data and session management
- **Search**: Elasticsearch for task search and analytics
- **Message Queue**: Apache Kafka for event streaming
- **Mobile**: Swift/SwiftUI (iOS), Kotlin/Jetpack Compose (Android)
- **Infrastructure**: Docker with Kubernetes orchestration

## Monorepo Structure

```
ErrandsBuddy/
├── packages/
│   ├── shared-types/          # Shared TypeScript types and interfaces
│   ├── auth-service/          # Authentication and user management
│   ├── user-service/          # User profile and availability management
│   ├── task-service/          # Task creation and lifecycle management
│   ├── matching-service/      # AI-powered task matching and routing
│   ├── payment-service/       # Payment processing and escrow
│   ├── notification-service/  # Push notifications and messaging
│   ├── location-service/      # Real-time location tracking
│   └── api-gateway/           # API Gateway and routing
├── apps/
│   ├── ios/                   # iOS mobile application
│   ├── android/               # Android mobile application
│   └── web/                   # Web dashboard
└── scripts/                   # Database initialization and utilities
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
  - Windows/macOS: Install from https://nodejs.org (includes npm). After install, restart your terminal/IDE and verify with `node -v` and `npm -v`.
- Docker and Docker Compose
- PostgreSQL 15+ with PostGIS extension
- Redis 7+

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ErrandsBuddy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development environment**
   ```bash
   # Start all services with Docker Compose
   npm run docker:up
   
   # Or start individual services
   npm run dev
   
   # Run a command for a single workspace (example: task-service)
   npm run build -w @errands-buddy/task-service
   npm run dev -w @errands-buddy/task-service
   npm run test -w @errands-buddy/task-service
   ```

4. **Access services**
   - API Gateway: http://localhost:3000
   - Auth Service: http://localhost:3001
   - User Service: http://localhost:3002
   - Task Service: http://localhost:3003
   - Matching Service: http://localhost:3004
   - Payment Service: http://localhost:3005
   - Notification Service: http://localhost:3006
   - Location Service: http://localhost:3007

## Development Commands

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start development servers
npm run dev

# Run tests
npm run test

# Run linting
npm run lint

# Format code
npm run format

# Type checking
npm run type-check

# Clean build artifacts
npm run clean

# Docker commands
npm run docker:up      # Start all services
npm run docker:down    # Stop all services
npm run docker:build   # Build Docker images

# Run commands for a specific workspace (examples)
npm run build -w @errands-buddy/shared-types
npm run test -w @errands-buddy/task-service
npm run type-check -w @errands-buddy/task-service

# Location service specific commands
npm run dev -w @errands-buddy/location-service
npm run test:integration -w @errands-buddy/location-service
npm run test:security -w @errands-buddy/location-service
```

## Testing

We use Jest (with `ts-jest`) for TypeScript unit tests across services.

- **Run all tests** (monorepo):
  ```bash
  npm run test
  ```
- **Run tests for a single workspace** (example: task-service):
  ```bash
  npm run test -w @errands-buddy/task-service
  ```
- **Coverage**: Where defined in a workspace, use `npm run test:coverage -w <workspace>`.

Notes:
- `jest.config.js` uses `moduleNameMapper` to map `@errands-buddy/*` to `packages/*/src` so tests can import local sources without building first.
- TypeScript path aliases are defined in the root `tsconfig.json` (`baseUrl` + `paths`). Package `tsconfig.json` files (e.g., `packages/task-service/tsconfig.json`) extend from the root so editors and type-checking resolve aliases consistently.

## Configuration

### Environment Variables

Create `.env` files in each service directory:

```bash
# Database
DATABASE_URL=postgresql://errands_user:errands_password@localhost:5432/errands_buddy
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key

# Location Service
LOCATION_ENCRYPTION_SECRET=your-location-encryption-secret
LOCATION_ANONYMIZATION_SALT=your-anonymization-salt
DEFAULT_LOCATION_TTL=3600
DEFAULT_SEARCH_RADIUS=5000
DEFAULT_PRECISION_LEVEL=approximate
GEOFENCE_TTL=86400

# External Services
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
STRIPE_SECRET_KEY=your-stripe-secret-key
FIREBASE_SERVER_KEY=your-firebase-server-key
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
```

## Key Features

### Core Functionality
- **User Registration**: Multi-step verification with phone and identity verification
- **Task Management**: Create, assign, and track tasks with real-time updates
- **AI Matching**: Geospatial matching with R-tree indexing and multi-criteria analysis
- **Payment Processing**: Secure payments with Stripe integration and escrow
- **Real-time Communication**: WebSocket-based messaging and location tracking
- **Location Tracking**: Real-time GPS tracking with geofencing and privacy controls

### Safety & Trust
- **Background Checks**: Comprehensive verification for all Taskers
- **Mutual Rating System**: 1-5 star ratings and reviews
- **Emergency Features**: Emergency contact button and safety check-ins
- **Location Privacy**: Configurable location sharing controls with encryption
- **Geofencing**: Dynamic task boundaries with real-time event detection
- **Emergency Access**: Secure emergency location access with audit logging

### Performance
- **Sub-second Response Times**: Critical matching operations
- **Horizontal Scalability**: Kubernetes orchestration
- **Geospatial Optimization**: PostGIS for efficient location queries with spatial indexing
- **Caching Strategy**: Redis for real-time data, session management, and geospatial queries
- **Real-time Updates**: WebSocket connections for instant location and task updates

### Location Service Features

The location service provides comprehensive real-time location tracking capabilities:

#### Real-time Tracking
- **WebSocket Communication**: Instant location updates via Socket.IO
- **Route Tracking**: Complete route history during task execution
- **Nearby Discovery**: Find available taskers within configurable radius
- **Live Updates**: Real-time location sharing between task participants

#### Geofencing System
- **Dynamic Geofences**: Automatic creation for pickup, delivery, and service areas
- **Event Detection**: Real-time enter, exit, and dwell event notifications
- **Task Boundaries**: Configurable boundaries for different task types
- **Safety Zones**: Emergency geofences for enhanced security

#### Privacy & Security
- **Data Encryption**: AES-256-GCM encryption for sensitive location data
- **Precision Controls**: Configurable sharing levels (exact, approximate, city, disabled)
- **Access Controls**: Granular permissions for different user types
- **Data Retention**: Automatic cleanup based on user preferences
- **Emergency Access**: Secure emergency location access with full audit trails

#### Performance & Scalability
- **Redis Caching**: High-performance location caching with TTL management
- **Spatial Indexing**: PostGIS spatial indexes for efficient geospatial queries
- **Rate Limiting**: 60 location updates per minute per user
- **Horizontal Scaling**: Stateless design for easy scaling

## Location Service Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mobile Apps   │    │   Web Client    │    │   API Gateway   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌────────────┴───────────┐
                    │   Location Service     │
                    │   (Port 3007)          │
                    └────────────┬───────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────┴─────┐         ┌──────┴──────┐        ┌──────┴──────┐
    │   Redis   │         │ PostgreSQL  │        │  WebSocket  │
    │  (Cache)  │         │  (PostGIS)  │        │   Server    │
    └───────────┘         └─────────────┘        └─────────────┘
```

## Location Service API Reference

### Location Updates
- `POST /api/location/update` - Update user location
- `GET /api/location/current/:userId?` - Get current location
- `GET /api/location/nearby` - Find nearby users

### Tracking
- `POST /api/location/tracking/start` - Start location tracking
- `POST /api/location/tracking/stop` - Stop location tracking
- `GET /api/location/tracking/route/:taskId/:userId?` - Get route data

### Privacy
- `GET /api/location/privacy/settings` - Get privacy settings
- `PUT /api/location/privacy/settings` - Update privacy settings

### Geofencing
- `POST /api/location/geofence/create` - Create geofence
- `GET /api/location/geofence/task/:taskId` - Get task geofences
- `GET /api/location/geofence/events/:taskId` - Get geofence events

### Emergency
- `POST /api/location/emergency/locate` - Emergency location access

## WebSocket Events

### Client → Server
- `location:update` - Send location update
- `location:start-tracking` - Start tracking session
- `location:stop-tracking` - Stop tracking session
- `location:privacy-update` - Update privacy settings
- `location:subscribe-geofence` - Subscribe to geofence events

### Server → Client
- `location:update-success` - Location update confirmation
- `location:updated` - Location update from other users
- `location:tracking-started` - Tracking session started
- `location:tracking-stopped` - Tracking session stopped
- `geofence:event` - Geofence event notification
- `location:nearby-update` - Nearby user location update
- `location:error` - Error notifications

## Database Schema

### Core Tables
- `location_tracking_sessions` - Active tracking sessions
- `route_points` - Location history during tracking
- `geofences` - Geofence definitions
- `geofence_events` - Geofence event history
- `location_privacy_settings` - User privacy preferences
- `location_analytics` - Aggregated analytics data

### Spatial Indexes
- PostGIS spatial indexes for efficient geospatial queries
- R-tree indexing for nearby user searches
- Optimized indexes for time-based queries

## Privacy & Security Features

### Precision Levels
- **Exact**: Full precision coordinates
- **Approximate**: ~100m accuracy radius
- **City**: ~5km accuracy radius
- **Disabled**: No location sharing

### Data Protection
- AES-256-GCM encryption for sensitive location data
- Automatic anonymization after configurable time periods
- Configurable data retention policies
- Emergency access controls with audit logging

### Sharing Controls
- Share with taskers (nearby user discovery)
- Share with clients (task participants)
- Geofence notifications
- Emergency access permissions

### Security Measures
- JWT-based authentication for all endpoints
- WebSocket authentication via handshake
- Role-based access controls
- Encryption at rest for sensitive location data
- TLS encryption for all communications
- Input validation and sanitization
- Rate limiting and DDoS protection

### Privacy Compliance
- GDPR-compliant data handling
- User consent management
- Right to be forgotten implementation
- Data minimization principles

## Deployment

### Location Service Docker Deployment

```bash
# Build location service image
docker build -t errands-buddy/location-service ./packages/location-service

# Run location service container
docker run -p 3007:3007 --env-file .env errands-buddy/location-service

# Development with Docker Compose
cd packages/location-service
docker-compose -f docker-compose.dev.yml up
```

### Staging
```bash
# Deploy to staging
git push origin develop
```

### Production
```bash
# Deploy to production
git push origin main
```

The CI/CD pipeline automatically:
- Runs tests and security scans
- Builds Docker images
- Deploys to staging/production environments
- Monitors service health

## Monitoring

- **Application Metrics**: Request latency, error rates, task completion rates
- **Business Metrics**: Matching efficiency, user retention, revenue per transaction
- **Location Metrics**: Location update frequency, geofence event rates, privacy setting distributions
- **Infrastructure Metrics**: CPU, memory, database performance, Redis cache hit rates
- **Alerting**: Automated alerts for performance thresholds and location service health

## Troubleshooting

- **npm/npx not recognized on Windows**
  - Install Node.js from https://nodejs.org and restart your terminal/IDE. Verify with `node -v` and `npm -v`.

- **Editor shows “Cannot find module '@errands-buddy/shared-types'”**
  - Ensure your editor picks up the root `tsconfig.json` with `paths` mapping. We set `packages/*/tsconfig.json` to `extends` the root so aliases resolve. Restart the TypeScript server (VS Code: Command Palette → “TypeScript: Restart TS server”).

- **Jest cannot resolve `@errands-buddy/*` imports**
  - Confirm `jest.config.js` has `moduleNameMapper`:
    ```js
    moduleNameMapper: {
      '^@errands-buddy/(.*)$': '<rootDir>/packages/$1/src'
    }
    ```
  - This lets tests import from source without building.

- **Types not found after clean clone**
  - Build shared packages like `@errands-buddy/shared-types` if you want `dist/` outputs:
    ```bash
    npm run build -w @errands-buddy/shared-types
    ```

- **Location service WebSocket connection issues**
  - Ensure Redis is running and accessible
  - Check JWT token is valid and not expired
  - Verify CORS settings allow your client origin
  - Check firewall settings for port 3007

- **PostGIS extension not found**
  - Install PostGIS extension in PostgreSQL:
    ```sql
    CREATE EXTENSION IF NOT EXISTS postgis;
    ```
  - Ensure PostgreSQL version supports PostGIS

- **Location updates not persisting**
  - Run database migrations: `npm run migrate -w @errands-buddy/location-service`
  - Check database connection settings
  - Verify user has proper database permissions

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation in the `/docs` directory

---

## Notification Service

Notification and Communication microservice (port 3006).

- Push notifications via Firebase Cloud Messaging (FCM)
- Device token registration and management
- Notification templates (Handlebars) per event type
- User notification preferences stored in Redis
- Real-time in-app messaging using Socket.IO
- Optional AES-256-GCM message encryption for relayed messages
- Emergency alert endpoint with location sharing
- Placeholder integration for masked calling (Twilio Proxy/Voice)

### Environment
Set the following variables (docker-compose already passes placeholders):

- `REDIS_URL`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `JWT_SECRET`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PROXY_SERVICE_SID`
- `PORT`

### REST Endpoints

- `GET /health` – service status
- `POST /devices/register` – register a device token `{ userId: uuid, token: string }`
- `POST /devices/unregister` – unregister a device token `{ userId: uuid, token: string }`
- `POST /notifications/send` – send a push `{ userId, eventType, data? }`
- `GET /preferences/:userId` – fetch notification prefs
- `PUT /preferences/:userId` – update prefs `{ push?, email?, sms? }`
- `POST /emergency/alert` – broadcast emergency alert `{ userId, userName, lat, lng, taskId?, notifyUserIds[] }`
- `POST /calls/masked` – create masked calling session (placeholder)

### WebSocket

- Namespace: `/messaging`
- Auth: `handshake.auth.token` must be a JWT `{ userId }` signed with `JWT_SECRET`
- Events:
  - `join_task` with `{ taskId }`
  - `message` with `{ taskId, toUserId?, text }` (optionally AES-256-GCM encrypted server-side if `MSG_ENCRYPTION_KEY_BASE64` is set)
