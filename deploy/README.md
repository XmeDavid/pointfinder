# PointFinder VPS Deploy

This deploy path borrows Folio's CI flow while keeping PointFinder's existing
project-owned nginx container:

- Runtime files live in `/opt/pointfinder`.
- Backend, frontend, and nginx images are built by GitHub Actions and pushed to
  GHCR with both the commit SHA and `latest`.
- The `nginx` container publishes ports 80/443 and terminates TLS using the
  existing PointFinder certificate volume.

## Domains and Ports

| Host | Target |
| --- | --- |
| Host | Handled by |
| --- | --- |
| `pointfinder.pt` | project nginx container on port 443 |
| `pointfinder.ch` | project nginx container on port 443 |
| `pointfinder.pt/api/*`, `pointfinder.ch/api/*` | nginx container -> backend service |
| `/ws`, `/ws-native` on both domains | nginx container -> backend service |

The backend is also bound to localhost on `BACKEND_PORT` for host-only health
checks/debugging. Public traffic should enter through the nginx container.

## First-Time Server Setup

Create `/opt/pointfinder/.env` from the existing production `.env` or from
`deploy/env.example`, then add real secrets. The workflow runs Compose with
`--project-directory /opt/pointfinder`, so existing relative paths such as
`./data/uploads`, `./certbot/conf`, and `./secrets` keep the same meaning as
they had with the root compose file.

```bash
mkdir -p /opt/pointfinder/data/uploads /opt/pointfinder/secrets /opt/pointfinder/certbot/conf /opt/pointfinder/certbot/www
cp deploy/env.example /opt/pointfinder/.env
```

Optional push-notification files go under `/opt/pointfinder/secrets`:

- `apns-key.p8`
- `firebase-service-account.json`

GitHub Actions needs these repository secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

Deploys run on pushes to `main` and can also be started manually from the
`Deploy` workflow.
