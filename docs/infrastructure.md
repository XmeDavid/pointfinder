# Infrastructure Guide

**Platform:** PointFinder NFC Gaming Platform
**Last updated:** 2026-03-21

---

## 1. Docker Services

Seven services compose the production stack. Start order is enforced via `depends_on`.

| Service | Container | Image / Build | Purpose |
|---------|-----------|---------------|---------|
| `postgres` | `pointfinder-db` | `postgres:16` | Primary database — internal only, no published ports |
| `backend` | `pointfinder-api` | `./backend` (multi-stage JDK → JRE) | Spring Boot API on port 8080 (internal) |
| `frontend` | `pointfinder-web` | `./web-admin` (multi-stage Node → Alpine) | Builds Vite SPA into `frontend_dist` volume, then idles |
| `nginx` | `pointfinder-nginx` | `./nginx` (nginx:alpine) | Reverse proxy; only container with published ports 80/443 |
| `certbot` | `pointfinder-certbot` | `certbot/certbot` | Let's Encrypt certificate renewal loop |
| `prometheus` | — | `prom/prometheus:v2.53.0` | Metrics collection, port 127.0.0.1:9090 (host-only) |
| `grafana` | — | `grafana/grafana:11.1.0` | Metrics dashboard, port 3000 (internal) |

### Startup order

```
postgres (healthy) → backend (started)
frontend (healthy) ─┬─→ nginx
                    └─→ (nginx also waits for backend started)
```

1. `postgres` must pass its health check before `backend` starts.
2. `frontend` must produce `dist/index.html` before `nginx` starts.
3. `nginx` starts once `backend` is running (any state) and `frontend` is healthy.
4. `certbot` starts independently with no dependencies.

### Health checks

| Service | Check command | Interval | Retries |
|---------|---------------|----------|---------|
| `postgres` | `pg_isready -U scout -d pointfinder` | 5s | 5 (fail after ~25s) |
| `frontend` | `test -f /app/dist/index.html` | 2s | 30 (fail after ~60s) |

---

## 2. Environment Variables

Copy `.env.example` to `.env` and populate required values before starting the stack.

### Required Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | — (required) | PostgreSQL password for user `scout` |
| `JWT_SECRET` | — (required) | JWT signing key — must be 256+ bits |

### Push Notifications (APNs — Apple)

Enable by setting `APNS_ENABLED=true` and providing the key file at `./secrets/AuthKey_<KEY_ID>.p8`.

| Variable | Default | Description |
|----------|---------|-------------|
| `APNS_ENABLED` | `false` | Master toggle for APNs push |
| `APPLE_PROD_APNS_KEY` | `""` | APNs key ID (e.g. `G9D86M2578`); also used to locate the `.p8` file |
| `APNS_TEAM_ID` | `""` | Apple Developer Team ID (e.g. `ABC123DEFG`) |
| `APNS_BUNDLE_ID` | `com.prayer.pointfinder` | App bundle identifier |
| `APNS_PRODUCTION` | `false` | `true` = production APNs gateway; `false` = sandbox |
| `APNS_KEY_PATH` | `file:/app/config/apns-key.p8` | Path inside container (do not change unless remounting) |

### Push Notifications (FCM — Android)

Enable by setting `FCM_ENABLED=true` and placing `firebase-service-account.json` in `./secrets/`.

| Variable | Default | Description |
|----------|---------|-------------|
| `FCM_ENABLED` | `false` | Master toggle for FCM push |
| `FCM_PROJECT_ID` | `""` | Firebase project ID |
| `FCM_CREDENTIALS_PATH` | `file:/app/config/firebase-service-account.json` | Path inside container |

### Email (Resend SMTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIL_ENABLED` | `false` | Master toggle for outbound email |
| `MAIL_PASSWORD` | `""` | Resend API key used as SMTP password |
| `MAIL_HOST` | `smtp.resend.com` | SMTP host (hardcoded in compose) |
| `MAIL_FROM` | `info@pointfinder.pt` | Sender address (hardcoded in compose) |

### File Uploads

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOADS_PATH` | `./data/uploads` | Host path bind-mounted into backend and nginx |
| `APP_UPLOADS_MAX_FILE_SIZE_BYTES` | `2147483648` (2 GB) | Maximum size for a single upload |
| `APP_UPLOADS_CHUNK_ENABLED` | `true` | Enable chunked/resumable uploads |
| `APP_UPLOADS_CHUNK_DEFAULT_SIZE_BYTES` | `8388608` (8 MB) | Default chunk size |
| `APP_UPLOADS_CHUNK_MAX_SIZE_BYTES` | `16777216` (16 MB) | Maximum chunk size |
| `APP_UPLOADS_CHUNK_SESSION_TTL_SECONDS` | `172800` (48 h) | Incomplete upload session TTL |
| `APP_UPLOADS_MAX_ACTIVE_SESSIONS_PER_PLAYER` | `3` | Concurrent upload sessions per player |
| `APP_UPLOADS_MAX_ACTIVE_BYTES_PER_GAME` | `17179869184` (16 GB) | Total in-flight upload bytes per game |

### Other

| Variable | Default | Description |
|----------|---------|-------------|
| `PGDATA_PATH` | `./data/pgdata` | Host path for PostgreSQL data directory |
| `SPRING_PROFILES_ACTIVE` | `prod` | Spring active profile |

---

## 3. Nginx Configuration

Source: `nginx/nginx.conf`

### Rate limiting

Four limit zones are defined in `http {}`:

| Zone | Limit | Memory | Applied to |
|------|-------|--------|------------|
| `api_limit` | 30 req/s per IP | 10 MB | All `/api/` endpoints (`burst=20`) |
| `auth_limit` | 20 req/min per IP | 10 MB | `/api/auth/` endpoints (`burst=5`, overrides api_limit) |
| `player_join_limit` | 5 req/min per IP | 10 MB | `/api/auth/player/join` (`burst=2`, brute-force protection) |
| `broadcast_limit` | 10 req/min per IP | 10 MB | `/api/broadcast/` endpoints (`burst=5`) |

### Key location blocks

| Pattern | Purpose | Notes |
|---------|---------|-------|
| `^~ /api/auth/player/join` | Player join | `player_join_limit burst=2`; brute-force protection on join codes |
| `^~ /api/auth/` | Auth endpoints | `auth_limit burst=5`; takes precedence over `/api/` |
| `^~ /api/broadcast/` | Broadcast endpoints | `broadcast_limit burst=5`; public spectator rate limit |
| `^~ /api/` | All other API routes | `api_limit burst=20`; proxied to `backend:8080` |
| `/ws/` | WebSocket upgrades | No rate limit; 24-hour read/send timeouts |
| `/.well-known/apple-app-site-association` | iOS Universal Links | Served as static JSON |
| `/.well-known/assetlinks.json` | Android App Links | Served as static JSON |
| `/tag/` | NFC tag landing page | Static HTML |
| `/health` | Upstream health check | Proxied to `backend:8080`; access log disabled |
| `/actuator/` | Spring Boot Actuator | **Blocked** — `deny all`, returns 404 |
| `~* \.(js\|css\|png\|...)$` | Static assets | 1-year `Cache-Control: immutable` |
| `/` | SPA fallback | `try_files $uri $uri/ /__spa.html` for client-side routing |

### Security headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains  (HSTS, 1 year)
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: detailed CSP with script/style/img/connect-src directives
```

The CSP includes SHA256 hashes for inline scripts, map tile sources (OpenStreetMap, CartoDB, Swisstopo), and WebSocket connections to `pointfinder.pt` / `pointfinder.ch`. See `nginx/security-headers.conf` for the full policy.

### WebSocket proxy

```nginx
location /ws/ {
    proxy_pass http://backend:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;   # 24 hours
    proxy_send_timeout 86400s;
}
```

### Static asset caching

JS, CSS, images, fonts, and media files receive a 1-year cache with `immutable`:

```nginx
Cache-Control: public, max-age=31536000, immutable
```

### Worker connections

```nginx
worker_connections 1024;
```

---

## 4. SSL/TLS

### Certificates

Let's Encrypt certificates are stored on the host at `./certbot/conf/` and bind-mounted into both `nginx` and `certbot` containers.

Domains: `pointfinder.pt`, `pointfinder.ch`

### Protocols

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
```

### Auto-renewal cycle

Two overlapping loops handle rotation without manual intervention:

| Container | Loop | Action |
|-----------|------|--------|
| `certbot` | Every 12 hours | Runs `certbot renew` — replaces certificate files if within renewal window |
| `nginx` | Every 6 hours | Runs `nginx -s reload` — picks up any newly written certificate files |

The nginx reload interval (6h) is shorter than certbot's check interval (12h), so a renewed certificate is always loaded within one reload cycle.

### Initial certificate setup

Before first `docker-compose up`, obtain certificates with certbot in standalone mode or via the ACME webroot challenge. The `./certbot/www/` directory is served by nginx at `/.well-known/acme-challenge/` for domain validation.

---

## 5. CI/CD Pipeline

Source: `.github/workflows/ci.yml`
Triggers: push to `main`, pull request targeting `main`

### Jobs

Four jobs run in parallel; E2E waits on Backend and Frontend.

```
Backend ──┬──→ E2E Smoke
Frontend ─┘
Android    (independent)
```

| Job | Runner | Key steps |
|-----|--------|-----------|
| **Backend** | ubuntu-latest, Java 21 | `./gradlew test` |
| **Frontend** | ubuntu-latest, Node 22 | `npm ci && npm run lint && npm run test` |
| **Android** | ubuntu-latest, Java 21 | `./gradlew test && ./gradlew :app:assembleDebug` |
| **E2E Smoke** | ubuntu-latest | Full local stack → setup → API smoke → Web smoke → cleanup → stack down |

### E2E local stack

E2E smoke uses `docker-compose.e2e-local.yml` (see section 6). Credentials are hard-coded for local use; push notifications are disabled; nginx uses self-signed certificates.

---

## 6. Docker Compose Files

| File | Purpose | When to use |
|------|---------|-------------|
| `docker-compose.yml` | Production stack | Live deployments on `pointfinder.pt` / `pointfinder.ch` |
| `docker-compose.test.yml` | Isolated unit tests | `make test-docker` — no database, no nginx, just backend and frontend test runners |
| `docker-compose.e2e-local.yml` | Full local stack for E2E | CI E2E job and local E2E development; hard-coded secrets, self-signed certs, relaxed rate limits |

### docker-compose.test.yml services

| Service | Image | Command |
|---------|-------|---------|
| `backend-test` | `eclipse-temurin:21-jdk` | `./gradlew test --no-daemon` |
| `frontend-test` | `node:22-alpine` | `npm ci && npm run test` |

Uses named volumes `gradle-cache` and `npm-cache` to avoid re-downloading dependencies on repeated runs.

---

## 7. Volumes & Persistence

| Volume | Type | Mounted path | Backup priority | Notes |
|--------|------|--------------|-----------------|-------|
| `pgdata` | Named | `/var/lib/postgresql/data` | **Critical** — backup with `pg_dump` | All game data, users, submissions |
| `uploads` (bind) | Bind | Host: `$UPLOADS_PATH` → container: `/uploads` | **Critical** — backup host directory | User-submitted photos, videos, files |
| `certbot/conf` | Bind | `./certbot/conf:/etc/letsencrypt` | Important | Auto-renewed; back up Let's Encrypt account key |
| `certbot/www` | Bind | `./certbot/www:/var/www/certbot` | Not needed | Transient ACME challenge files |
| `frontend_dist` | Named | `/app/dist` (frontend) → `/usr/share/nginx/html/app` (nginx) | Regeneratable | Rebuilt on each deploy; safe to delete |
| `secrets/` | Bind (RO) | `./secrets/` → `/app/config/` | Important | APNs `.p8` key and FCM JSON credentials; store securely |

### Backup recommendations

```bash
# PostgreSQL — dump to compressed file
docker exec pointfinder-db pg_dump -U scout pointfinder | gzip > backup-$(date +%Y%m%d).sql.gz

# Uploads — rsync to remote storage
rsync -az ./data/uploads/ remote:/backups/uploads/
```

---

## 8. Scheduled Background Tasks

The backend runs several scheduled maintenance tasks:

| Task | Interval | Description |
|------|----------|-------------|
| Auto-end games | 60 seconds | Ends games past their `endDate` |
| Purge expired refresh tokens | 1 hour | Removes expired refresh tokens from DB |
| Purge password reset tokens | 1 hour | Removes expired password reset tokens |
| Expire stale upload sessions | 15 minutes | Cleans up upload sessions past TTL |
| Cleanup login attempt records | 30 minutes | Purges expired brute-force lockout entries |
| Cleanup stale WebSocket sessions | 60 seconds | Removes disconnected mobile WebSocket sessions |

Source: `GameSchedulerService.java`, `LoginAttemptService.java`, `MobileRealtimeHub.java`

---

## 9. Performance Tuning

### JVM heap (backend)

```
JAVA_OPTS=-Xms256m -Xmx1200m
```

Minimum 256 MB on startup; maximum 1.2 GB. Adjust `Xmx` if the host has more RAM available and the application handles large concurrent upload sessions.

### Upload limits

| Setting | Value | Env variable |
|---------|-------|--------------|
| Max file size | 2 GB | `APP_UPLOADS_MAX_FILE_SIZE_BYTES` |
| Default chunk size | 8 MB | `APP_UPLOADS_CHUNK_DEFAULT_SIZE_BYTES` |
| Max chunk size | 16 MB | `APP_UPLOADS_CHUNK_MAX_SIZE_BYTES` |
| Session TTL | 48 hours | `APP_UPLOADS_CHUNK_SESSION_TTL_SECONDS` |
| Max bytes in-flight per game | 16 GB | `APP_UPLOADS_MAX_ACTIVE_BYTES_PER_GAME` |

Spring Boot's multipart limits must be set in `application.yml` to match or exceed `APP_UPLOADS_MAX_FILE_SIZE_BYTES`.

### Nginx worker connections

```nginx
events {
    worker_connections 1024;
}
```

Supports up to 1024 simultaneous connections per worker process. Increase if nginx becomes the bottleneck under high load (`worker_processes` defaults to `auto`).

### Network isolation

Only nginx is reachable from outside the Docker network. Backend (8080) and PostgreSQL (5432) are internal-only. This limits attack surface without requiring an external firewall rule beyond opening 80 and 443.
