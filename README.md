# Performance Tracker Server

Backend API for the Performance Tracker fitness application, built with NestJS and PostgreSQL.

## Features

### Workout Management
- **Workouts**: CRUD operations for workout templates (strength, cardio, hybrid)
- **Exercises**: Exercise library with muscle group mapping
- **Workout Executions**: Track completed workouts with sets, reps, metrics
- **Workout Plans**: Multi-week training programs
- **Workout Schedules**: Calendar-based workout scheduling

### Cardio & Metrics
- **File Imports**: Parse FIT, GPX, and TCX files from fitness devices
- **Cardio Metrics**: Heart rate, pace, power, cadence, elevation tracking
- **Advanced Metrics**: Running dynamics, power zones, training load
- **Route Data**: GPS coordinates, splits, elevation profiles
- **Weather Integration**: Open-Meteo API for workout weather conditions

### Analytics
- **Workout Analytics**: Performance summaries, personal records
- **Training Load**: TRIMP, TSS, and load modeling
- **Race Predictions**: Estimated race times based on training data

### Health & Recovery
- **Sleep Logging**: Track sleep duration and quality
- **Recovery Journal**: Daily readiness and recovery notes
- **Pain Logs**: Track injuries and pain points

### Coaching
- **Coach-Athlete Relationships**: Multi-athlete management
- **Athlete Profiles**: Intake forms, goals, preferences
- **Notifications**: Push notifications via Firebase
- **Messaging**: In-app communication

### Integrations
- **Wearables**: Garmin, Polar, Wahoo data sync
- **OpenWearables**: Open wearable data standard support
- **Data Export**: CSV, JSON export functionality
- **Firebase Auth**: Authentication and push notifications
- **AWS S3**: Media storage with CloudFront CDN
- **AWS MediaConvert**: Video processing

### Additional
- **Voice Commands**: OpenAI-powered voice control
- **Personal Records**: Automatic PR detection and tracking

## Tech Stack

- **Framework**: NestJS 11
- **Language**: TypeScript
- **Database**: PostgreSQL with Kysely ORM
- **Auth**: Firebase Admin SDK + JWT
- **Storage**: AWS S3 + CloudFront
- **API Docs**: Swagger/OpenAPI
- **Testing**: Jest + Supertest
- **Scheduling**: @nestjs/schedule for cron jobs

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Yarn

### Installation

```bash
# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
yarn migrate:latest

# (Optional) Seed database
yarn seed

# Start development server
yarn dev
```

### Available Scripts

```bash
yarn dev              # Start with hot reload + debugging
yarn build            # Build for production
yarn start:build      # Run production build

yarn lint             # Run ESLint
yarn format           # Fix lint issues
yarn typecheck        # TypeScript type checking

yarn test             # Run unit tests
yarn test:watch       # Watch mode
yarn test:cov         # Coverage report
yarn test:e2e         # End-to-end tests

yarn migrate:latest   # Run all pending migrations
yarn migrate:up       # Run next migration
yarn migrate:down     # Rollback last migration
yarn migrate:make     # Create new migration
yarn migrate:list     # List migration status

yarn seed             # Run database seeds
yarn cli              # Run CLI commands
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for JWT signing |
| `FIREBASE_*` | Firebase Admin SDK credentials |
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `AWS_S3_BUCKET` | S3 bucket name |
| `AWS_CLOUDFRONT_DOMAIN` | CloudFront distribution |
| `OPENAI_API_KEY` | OpenAI API for voice features |
| `OPEN_METEO_API_URL` | Weather API endpoint |

## Project Structure

```
src/
├── modules/
│   ├── api/v1/           # REST API endpoints
│   │   ├── workouts/     # Workout CRUD
│   │   ├── exercises/    # Exercise library
│   │   ├── analytics/    # Performance analytics
│   │   ├── coaching/     # Coach features
│   │   └── ...
│   ├── auth/             # Authentication
│   ├── database/         # Database module
│   ├── firebase/         # Firebase integration
│   ├── s3/               # AWS S3 service
│   ├── weather/          # Weather API
│   └── cron/             # Scheduled jobs
├── database/
│   ├── migrations/       # Kysely migrations
│   ├── seeds/            # Database seeds
│   └── interfaces/       # Table type definitions
├── repositories/         # Data access layer
├── lib/                  # Shared utilities
└── main.ts               # Application entry
```

## API Documentation

Swagger UI available at `/api/docs` when running the server.

## Docker

```bash
# Build image
docker build -t performance-tracker-server .

# Run with docker-compose
docker-compose up
```

## License

Private project.
