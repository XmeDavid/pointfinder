# PointFinder - NFC Gaming Platform

A comprehensive NFC-based gaming platform designed for scouting organizations (Pathfinders/Desbravadores). The system enables interactive, location-based games using NFC technology, real-time monitoring, and comprehensive game management.

## 🎯 Overview

PointFinder is a multi-platform system that combines:
- **NFC-enabled mobile gameplay** for participants
- **Web-based administration** for game organizers
- **Real-time monitoring and tracking** for supervisors
- **Location-based challenges** integrated with mapping

The platform is specifically designed for scouting events, camps, and educational activities where teams compete in various challenges distributed across different physical locations.

## 🏗️ Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   iOS Mobile    │    │   Web Admin     │    │     Backend     │
│   (Swift/NFC)   │◄──►│ (React/TypeScript)──►│  (Spring Boot)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     nginx       │    │   Let's Encrypt │    │   PostgreSQL    │
│ (Reverse Proxy) │    │      (SSL)      │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

**Backend (Java/Spring Boot)**
- Spring Boot 3.4.1 with Java 21
- PostgreSQL database with Flyway migrations
- JWT authentication & authorization
- WebSocket for real-time updates
- Email notifications via Resend
- RESTful API design

**Web Admin (React/TypeScript)**
- React 19 with TypeScript
- Vite build system
- Tailwind CSS for styling
- Zustand for state management
- React Query for data fetching
- Leaflet for interactive maps
- Multi-language support (EN/PT)

**Mobile App (iOS/Swift)**
- Native iOS app with Swift
- NFC reading/writing capabilities
- Core Location for GPS tracking
- Real-time API integration
- Offline-first caching strategy

**Infrastructure**
- Docker containerization
- nginx reverse proxy
- Let's Encrypt SSL certificates
- Automated SSL renewal

## 🚀 Features

### Core Gameplay
- **NFC-Based Interactions**: Players scan NFC tags at physical bases to unlock challenges
- **Team-Based Competition**: Multiple teams compete simultaneously
- **Location Tracking**: GPS-based team monitoring and base verification
- **Real-time Updates**: Live leaderboards and activity feeds
- **Challenge Variety**: Support for different challenge types and answer formats

### Administration
- **Game Management**: Create, configure, and monitor games
- **Base Management**: Define physical locations with NFC tags
- **Challenge Creation**: Rich text editor for challenge content
- **Team Organization**: Player registration and team assignments
- **Operator Invites**: Role-based access for game operators
- **Live Monitoring**: Real-time dashboard with team locations and progress

### Technical Features
- **Multi-language Support**: English and Portuguese localization
- **Responsive Design**: Mobile-friendly web interface
- **Real-time Communication**: WebSocket-based live updates
- **Secure Authentication**: JWT-based security with refresh tokens
- **Email Notifications**: Automated communication system
- **Map Integration**: Interactive maps for base placement and team tracking

## 📱 Current State

### Deployment Status
- **Production URLs**: https://pointfinder.pt and https://pointfinder.ch
- **SSL**: Automated Let's Encrypt certificates
- **Database**: PostgreSQL with migrations
- **Email**: Configured with Resend SMTP

### Component Status

#### ✅ Backend (Complete)
- Full REST API implementation
- Authentication & authorization
- Database schema and migrations
- WebSocket real-time communication
- Email service integration
- Docker containerization

#### ✅ Web Admin (Complete)
- Game creation and management
- Base and challenge management
- Team administration
- Real-time monitoring dashboard
- Operator invitation system
- Multi-language support
- Responsive design

#### ✅ iOS App (Complete)
- NFC reading/writing functionality
- Player and operator modes
- Real-time API integration
- Location services
- Offline capabilities
- Authentication flow

#### ✅ Infrastructure (Complete)
- Docker compose configuration
- nginx reverse proxy setup
- SSL certificate automation
- Database persistence

### Key Entities

**Game**: Central entity containing bases, challenges, teams, and operators
**Base**: Physical locations with NFC tags where challenges are accessed
**Challenge**: Tasks/questions that teams must complete
**Team**: Groups of players competing together
**Player**: Individual participants in games
**Submission**: Team responses to challenges
**User**: System users (admins, operators)

## 🛠️ Development Setup

### Prerequisites
- Docker and Docker Compose
- Java 21 (for local backend development)
- Node.js 18+ (for local frontend development)
- Xcode (for iOS development)

### Quick Start

1. **Clone the repository**
```bash
git clone <repository-url>
cd dbvnfc
```

2. **Start the full stack**
```bash
docker-compose up -d
```

3. **Access the application**
- Web Admin: http://localhost (redirects to https)
- API: http://localhost/api
- Database: localhost:5432

### Development Mode

**Backend Development**
```bash
cd backend
./gradlew bootRun
```

**Frontend Development**
```bash
cd web-admin
npm install
npm run dev
```

**iOS Development**
```bash
cd ios-app
open dbv-nfc-games.xcodeproj
```

## 📋 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/player/join` - Player game join

### Game Management
- `GET/POST /api/games` - List/create games
- `GET/PUT/DELETE /api/games/{id}` - Game CRUD operations
- `GET /api/games/{id}/teams` - Game teams
- `GET /api/games/{id}/leaderboard` - Game leaderboard

### Base & Challenge Management
- `GET/POST /api/games/{gameId}/bases` - Base management
- `GET/POST /api/games/{gameId}/challenges` - Challenge management
- `GET/POST /api/games/{gameId}/assignments` - Base-challenge assignments

### Team Operations
- `POST /api/teams/{teamId}/submissions` - Submit challenge response
- `GET /api/teams/{teamId}/location` - Team location tracking
- `POST /api/teams/{teamId}/checkin` - Base check-in

### Monitoring
- `GET /api/monitoring/dashboard/{gameId}` - Dashboard data
- `GET /api/monitoring/activity/{gameId}` - Activity feed
- `WebSocket /ws` - Real-time updates

## 🔧 Configuration

### Environment Variables

**Backend**
- `SPRING_DATASOURCE_URL`: PostgreSQL connection string
- `SPRING_PROFILES_ACTIVE`: Active Spring profile (dev/prod)
- `CORS_ORIGINS`: Allowed CORS origins
- `MAIL_HOST/USERNAME/PASSWORD`: Email configuration
- `FRONTEND_URL`: Frontend URL for email links

**Frontend**
- `VITE_API_URL`: Backend API URL
- `VITE_WS_URL`: WebSocket URL

### Database
The application uses PostgreSQL with Flyway migrations. Database schema is automatically created and updated on startup.

## 📦 Deployment

### Production Deployment
1. Configure environment variables in `docker-compose.yml`
2. Confirm domains in `init-letsencrypt.sh` (`pointfinder.pt`, `pointfinder.ch`)
3. Run SSL setup: `./init-letsencrypt.sh`
4. Start services: `docker-compose up -d`

### SSL Certificate Setup
The project includes automated Let's Encrypt certificate generation and renewal:
```bash
./init-letsencrypt.sh
```

### NFC Domain Migration
When changing production domains, rewrite physical NFC tags using:
- `docs/nfc-tag-rewrite-runbook.md`

## 🧪 Testing

Use the root `Makefile` to run all suites from one place.

**Dockerized Tests (Backend + Web Admin)**
```bash
make test-docker
```

**Run Suites Individually**
```bash
make test-backend-docker
make test-frontend-docker
```

**iOS Tests (macOS Host)**
```bash
make test-ios
```

**Run Everything**
```bash
make test-all
```

Notes:
- `test-docker` uses `docker-compose.test.yml` and runs backend + frontend tests in containers.
- `test-ios` runs via `xcodebuild` on the host machine (requires macOS + Xcode).
- You can override iOS defaults, for example:
  - `make test-ios IOS_DESTINATION="platform=iOS Simulator,name=iPhone 15"`

## 📝 Legacy Components

The project includes legacy implementations in the `legacy/` directory for reference, including previous versions of the backend and frontend components.

## 🤝 Contributing

This is a private project for scouting organizations. For contributions or questions, please contact the project maintainer.

## 📄 License

Private project - All rights reserved.

---

**Live Application**: https://pointfinder.pt and https://pointfinder.ch
**Project Status**: Production Ready ✅
**Last Updated**: February 2026