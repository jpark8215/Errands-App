# ErrandsBuddy - Peer-to-Peer Task Marketplace

A comprehensive mobile-first platform that connects task requesters with nearby Taskers for immediate, non-food-related tasks. Built with a microservices architecture and AI-powered matching algorithms.

## 🏗️ Architecture

- **Backend**: Node.js/TypeScript with Express.js and GraphQL
- **Database**: PostgreSQL with PostGIS for geospatial queries
- **Caching**: Redis for real-time data and session management
- **Search**: Elasticsearch for task search and analytics
- **Message Queue**: Apache Kafka for event streaming
- **Mobile**: Swift/SwiftUI (iOS), Kotlin/Jetpack Compose (Android)
- **Infrastructure**: Docker with Kubernetes orchestration

## 📦 Monorepo Structure

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

## 🚀 Quick Start

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

## 🛠️ Development Commands

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
```

## 🧪 Testing

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

## 🔧 Configuration

### Environment Variables

Create `.env` files in each service directory:

```bash
# Database
DATABASE_URL=postgresql://errands_user:errands_password@localhost:5432/errands_buddy
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key

# External Services
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
STRIPE_SECRET_KEY=your-stripe-secret-key
FIREBASE_SERVER_KEY=your-firebase-server-key
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
```

## 📊 Key Features

### Core Functionality
- **User Registration**: Multi-step verification with phone and identity verification
- **Task Management**: Create, assign, and track tasks with real-time updates
- **AI Matching**: Geospatial matching with R-tree indexing and multi-criteria analysis
- **Payment Processing**: Secure payments with Stripe integration and escrow
- **Real-time Communication**: WebSocket-based messaging and location tracking

### Safety & Trust
- **Background Checks**: Comprehensive verification for all Taskers
- **Mutual Rating System**: 1-5 star ratings and reviews
- **Emergency Features**: Emergency contact button and safety check-ins
- **Location Privacy**: Configurable location sharing controls

### Performance
- **Sub-second Response Times**: Critical matching operations
- **Horizontal Scalability**: Kubernetes orchestration
- **Geospatial Optimization**: PostGIS for efficient location queries
- **Caching Strategy**: Redis for real-time data and session management

## 🚀 Deployment

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

## 📈 Monitoring

- **Application Metrics**: Request latency, error rates, task completion rates
- **Business Metrics**: Matching efficiency, user retention, revenue per transaction
- **Infrastructure Metrics**: CPU, memory, database performance
- **Alerting**: Automated alerts for performance thresholds

## 🛟 Troubleshooting

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

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation in the `/docs` directory

---
