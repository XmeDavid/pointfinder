# Health-gated Cloudflare Tunnel connector.
#
# The cloudflared binary is taken unchanged from the same digest the existing
# ingress stack pins (deploy/ha/cloudflare-tunnel.yml). It is statically linked
# (verified with `file` on the amd64 layer), so it runs on Alpine's musl base.
#
# Digests resolved read-only on 2026-09-09 with `docker buildx imagetools inspect`:
#   cloudflare/cloudflared 2026.8.3  -> sha256:51c9cefcb4569df44e1ad403ab1d3d8065aa8e84339bcfc6aee75502e1140339
#   alpine:3.22 (3.22.5 index)       -> sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce

FROM cloudflare/cloudflared@sha256:51c9cefcb4569df44e1ad403ab1d3d8065aa8e84339bcfc6aee75502e1140339 AS cloudflared

FROM alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce

RUN apk add --no-cache python3 ca-certificates \
    && addgroup -g 65532 -S nonroot \
    && adduser -u 65532 -S -G nonroot -H -s /sbin/nologin nonroot

COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY supervisor.py /opt/pointfinder/supervisor.py

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PF_TUNNEL_TOKEN_FILE=/run/secrets/tunnel_token \
    PF_METRICS_ADDRESS=0.0.0.0:2000

# Same UID/GID the existing tunnel secret is mounted for.
USER 65532:65532

# The supervisor is PID 1: it forwards SIGTERM to cloudflared and waits for it.
ENTRYPOINT ["/usr/bin/python3", "/opt/pointfinder/supervisor.py"]
