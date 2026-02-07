# DBV NFC Games Backend (Java/Spring Boot)

Location-based team gaming platform backend built with **Java 21** and **Spring Boot 3.4**.

## Technology Stack

- **Java 21** (LTS with virtual threads)
- **Spring Boot 3.4.0**
- **Spring Security** (JWT authentication)
- **Spring Data JPA** (with Hibernate)
- **PostgreSQL 15+** (with JSONB support)
- **Flyway** (database migrations)
- **STOMP over WebSocket** (real-time features)
- **Bucket4j** (rate limiting)
- **JJWT 0.12.5** (JWT tokens)

## Prerequisites

- **Java 21** or higher
- **Maven 3.9+**
- **PostgreSQL 15+**
- **Docker** and **Docker Compose** (for containerized deployment)

## Quick Start

### Option 1: Using Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   cd /Users/xmedavid/dev/dbvnfc
   ```

2. **Create `.env` file from example**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` and set your environment variables**
   - `JWT_SECRET`: Secure random string (min 256 bits)
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: Admin credentials
   - `SMTP_USER` and `SMTP_PASS`: Email credentials (optional)

4. **Start all services**
   ```bash
   docker-compose up -d
   ```

5. **Check service health**
   ```bash
   curl http://localhost:4000/health
   ```

### Option 2: Local Development

1. **Start PostgreSQL**
   ```bash
   docker run -d \
     --name dbvnfc-postgres \
     -e POSTGRES_DB=app \
     -e POSTGRES_USER=app \
     -e POSTGRES_PASSWORD=password \
     -p 5432:5432 \
     postgres:15-alpine
   ```

2. **Set environment variables**
   ```bash
   export DATABASE_URL=jdbc:postgresql://localhost:5432/app
   export DATABASE_USERNAME=app
   export DATABASE_PASSWORD=password
   export JWT_SECRET=your-secret-key
   export ADMIN_EMAIL=admin@example.com
   export ADMIN_PASSWORD=admin123
   ```

3. **Build the project**
   ```bash
   cd backend-java
   mvn clean install
   ```

4. **Run the application**
   ```bash
   mvn spring-boot:run
   ```

5. **Or run the JAR**
   ```bash
   java -jar target/dbv-nfc-backend-1.0.0.jar
   ```

## API Documentation

### Base URL
```
http://localhost:4000/api
```

### Health Check
```
GET /health
```

### Authentication Endpoints

- `POST /api/auth/admin/login` - Admin login
- `POST /api/auth/operators/login` - Operator login
- `POST /api/auth/operators/register` - Register via invite
- `POST /api/auth/team/join` - Team member join
- `POST /api/auth/refresh` - Refresh access token

### Game Management (Admin)

- `GET /api/games` - List all games
- `GET /api/games/{id}` - Get game details
- `POST /api/games` - Create game
- `PATCH /api/games/{id}` - Update game

### Operator APIs

- `GET /api/operator/games` - List operator's games
- `POST /api/operator/games` - Create game
- `PUT /api/operator/games/{id}` - Update game
- `POST /api/operator/games/{id}/status` - Change game status
- `POST /api/operator/games/{id}/bases/{baseId}/link` - Link NFC tag

### Team APIs (Mobile)

- `GET /api/team/me/state` - Get team state
- `GET /api/team/bases/{baseId}/enigma` - Get enigma for base
- `POST /api/team/enigma/solve` - Submit enigma answer (leader only)
- `POST /api/team/base/checkin` - NFC check-in (leader only)
- `POST /api/team/base/complete` - NFC complete (leader only)
- `POST /api/team/location` - Update location

### WebSocket

- `WS /ws/monitor/{gameId}` - Real-time monitoring (STOMP)

## Database Migrations

Flyway migrations are automatically applied on startup.

### Manual Migration

```bash
mvn flyway:migrate
```

### Migration Info

```bash
mvn flyway:info
```

### Migration Files Location

```
src/main/resources/db/migration/
├── V1__init.sql
├── V2__teams_game_invite.sql
├── V3__operators_and_game_enhancements.sql
├── V4__add_operator_status.sql
├── V5__fix_data_integrity.sql
├── V6__add_nfc_tags_table.sql
├── V7__remove_operator_roles.sql
├── V8__fix_phase1_issues.sql
├── V9__add_enigma_assignments.sql
└── V10__fix_constraint_conflicts.sql
```

## Testing

### Run All Tests

```bash
mvn test
```

### Run Integration Tests

```bash
mvn verify
```

### Run with TestContainers

Integration tests use TestContainers for PostgreSQL, which requires Docker.

## Configuration

### Application Profiles

- **default**: Development mode
- **prod**: Production mode

### Key Configuration Properties

See `src/main/resources/application.yml` for all configuration options.

#### JWT Token Expiration

- Admin access: 15 minutes
- Admin refresh: 7 days
- Operator access: 24 hours
- Operator refresh: 7 days
- Team access: 60 minutes

#### Rate Limiting

- Auth endpoints: 5 requests/minute per IP
- General endpoints: 100 requests/minute per IP

#### Connection Pool (HikariCP)

- Maximum pool size: 30
- Minimum idle: 5
- Connection timeout: 30 seconds
- Max lifetime: 30 minutes

## Docker Commands

### Build Image

```bash
docker build -t dbvnfc-backend:latest backend-java/
```

### Run Container

```bash
docker run -d \
  -p 4000:4000 \
  -e DATABASE_URL=jdbc:postgresql://host.docker.internal:5432/app \
  -e JWT_SECRET=your-secret \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=admin123 \
  dbvnfc-backend:latest
```

### View Logs

```bash
docker-compose logs -f backend
```

### Stop Services

```bash
docker-compose down
```

### Remove Volumes

```bash
docker-compose down -v
```

## Project Structure

```
backend-java/
├── src/main/java/com/dbvnfc/
│   ├── DbvNfcApplication.java
│   ├── config/               # Spring configuration
│   ├── security/             # JWT, CSRF, rate limiting
│   ├── controller/           # REST controllers
│   ├── service/              # Business logic
│   ├── repository/           # Data access
│   ├── model/
│   │   ├── entity/          # JPA entities
│   │   ├── dto/             # Request/response DTOs
│   │   ├── enums/           # Enums
│   │   └── jsonb/           # JSONB classes
│   ├── websocket/           # WebSocket handlers
│   ├── validation/          # Validators
│   ├── exception/           # Exception handlers
│   └── util/                # Utilities
└── src/main/resources/
    ├── application.yml       # Configuration
    └── db/migration/        # Flyway migrations
```

## Monitoring

### Actuator Endpoints

- `GET /actuator/health` - Health check
- `GET /actuator/info` - Application info
- `GET /actuator/metrics` - Metrics

### Health Check

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "UP",
  "message": "Service is healthy",
  "timestamp": "2025-01-04T12:00:00Z",
  "version": "1.0.0"
}
```

## Troubleshooting

### Database Connection Issues

1. Verify PostgreSQL is running
   ```bash
   docker ps | grep postgres
   ```

2. Check connection
   ```bash
   psql -h localhost -U app -d app
   ```

3. Verify DATABASE_URL format
   ```
   jdbc:postgresql://localhost:5432/app
   ```

### Migration Failures

1. Check migration status
   ```bash
   mvn flyway:info
   ```

2. Repair if needed
   ```bash
   mvn flyway:repair
   ```

### JWT Token Issues

1. Ensure JWT_SECRET is at least 256 bits
2. Check token expiration times in application.yml
3. Verify HMAC-SHA256 signing algorithm

## License

Proprietary - DBV NFC Games

## Support

For issues, please contact the development team.
