#!/bin/sh
# Run on the existing database host as root. No credentials are printed.
set -eu
umask 077
backup_dir=/var/backups/pointfinder-ha
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
container=$(docker ps -q --filter label=com.docker.swarm.service.name=pointfinder-database-bt29ko)
production=false
if [ -z "$container" ]; then
    case "$(hostname)" in
        davidsbatista) project=pointfinder-pg-hetzner-vv3yw0; production_service=patroni-hetzner ;;
        pointfinder-ha) project=pointfinder-pg-rainer-0u6pju; production_service=patroni-rainer ;;
        *) printf 'Unknown database host\n' >&2; exit 1 ;;
    esac
    container=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$production_service")
    production=true
fi
[ -n "$container" ]
[ "$(printf '%s\n' "$container" | wc -l)" -eq 1 ]
backup_file="$backup_dir/pointfinder-$(date -u +%Y%m%dT%H%M%SZ).dump"
if [ "$production" = true ]; then
    system_id=$(docker exec -u postgres "$container" psql -U scout -d pointfinder -Atc 'SELECT system_identifier FROM pg_control_system()')
    [ "$system_id" = 7605372262247206949 ]
    # pg_dump supports a consistent snapshot on either primary or physical standby.
    # A recovery conflict can cancel a standby dump; its non-zero exit is not hidden.
    docker exec -u postgres "$container" pg_dump -U scout -d pointfinder --format=custom --no-owner --no-acl > "$backup_file.partial"
else
    docker exec "$container" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$backup_file.partial"
fi
docker exec -i "$container" pg_restore --list < "$backup_file.partial" >/dev/null
mv "$backup_file.partial" "$backup_file"
sha256sum "$backup_file"
