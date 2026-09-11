#!/bin/sh
# Root on davidsbatista only. Preserve current images first; never deploy app code.
set -eu
umask 077
[ "$(hostname)" = davidsbatista ]
backup=/var/backups/pointfinder-ha/engine-20260909T170552Z
[ -f "$backup/services.json" ]
mkdir -p "$backup/packages"
cd "$backup/packages"
apt-get download docker-ce=5:27.5.1-1~ubuntu.24.04~noble docker-ce-cli=5:27.5.1-1~ubuntu.24.04~noble containerd.io=1.7.25-1
container=$(docker ps -q --filter label=com.docker.swarm.service.name=dokploy-postgres)
[ -n "$container" ]
docker exec "$container" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/dokploy.dump"
docker exec "$container" sh -c 'exec pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$backup/dokploy-globals.sql"
container=$(docker ps -q --filter label=com.docker.swarm.service.name=pointfinder-database-bt29ko)
docker exec "$container" sh -c 'exec pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$backup/pointfinder-globals.sql"
restore_units() {
    systemctl unmask --runtime containerd.service docker.service docker.socket
    systemctl daemon-reload
    systemctl start containerd.service docker.service
}
trap restore_units EXIT
printf 'Stopping Hetzner containers for the engine maintenance window\n'
systemctl mask --runtime --now docker.service docker.socket
systemctl mask --runtime --now containerd.service
tar -C / -czf "$backup/engine-state.tar.gz" etc/docker var/lib/docker/swarm var/lib/containerd
DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y \
    docker-ce=5:29.8.0-1~ubuntu.24.04~noble \
    docker-ce-cli=5:29.8.0-1~ubuntu.24.04~noble \
    containerd.io=2.3.5-1~ubuntu.24.04~noble
restore_units
trap - EXIT
docker version --format '{{.Server.Version}}'
printf 'Engine restarted; application and quorum verification is still required\n'
