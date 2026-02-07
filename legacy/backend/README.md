# Backend (Go + Fiber)

## Run locally

- Copy env and set values:
```bash
cp .env.example .env
```

- Start Postgres and API via Docker:
```bash
docker compose up -d --build
```

- Or run locally with your own Postgres:
```bash
make run
```

Migrations are executed automatically on startup from `migrations/*.sql`.

## API

Base URL: `/api`

- POST `/auth/login` ⇒ { token, user }
- GET `/games/:id` (auth)
- POST `/games` (auth)
- GET `/teams` (auth)
- POST `/teams` (auth)
- GET `/progress/teams/:id` (auth)
- GET `/events` (auth)
- POST `/events` (auth)

Auth: `Authorization: Bearer <JWT>` (admin)

## Schema

- `games` (jsonb fields for `bases`, `enigmas`)
- `teams`, `progress`, `events`

## Notes

- This is a starter; tune indices and constraints as needed.
- Add rate limiting and better auth before production.
