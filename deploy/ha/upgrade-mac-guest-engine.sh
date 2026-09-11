#!/bin/sh
# Run on one verified guest at a time, with other two managers/quorum voters healthy.
# Move the rehearsal primary away from this guest before running.
set -eu
umask 077
case "$(hostname)" in
    arthur) suffix='ubuntu.26.04~resolute' ;;
    pointfinder-ha) suffix='debian.12~bookworm' ;;
    *) printf 'Unexpected host; refusing upgrade\n' >&2; exit 1 ;;
esac
backup=/var/backups/pointfinder-ha/engine-29.8.0-$(date -u +%Y%m%dT%H%M%SZ)
[ ! -e "$backup" ]
mkdir -p "$backup/packages"
chmod 700 /var/backups/pointfinder-ha "$backup"
docker service inspect $(docker service ls -q) > "$backup/services.json"
docker inspect $(docker ps -q) > "$backup/containers.json"
cd "$backup/packages"
for package in docker-ce docker-ce-cli containerd.io; do
    version=$(dpkg-query -W -f='${Version}' "$package")
    apt-get download "$package=$version"
done
apt-get install --download-only -y "docker-ce=5:29.8.0-1~$suffix" \
    "docker-ce-cli=5:29.8.0-1~$suffix" "containerd.io=2.3.5-1~$suffix"
restore_units() {
    systemctl unmask --runtime containerd.service docker.service docker.socket
    systemctl daemon-reload
    systemctl start containerd.service docker.service
}
trap restore_units EXIT
printf 'Stopping guest engine for maintenance\n'
systemctl mask --runtime --now docker.service docker.socket
systemctl mask --runtime --now containerd.service
# Image blobs/snapshots remain in place. Capture daemon and containerd metadata.
tar -C / -czf "$backup/engine-metadata.tar.gz" etc/docker var/lib/docker/swarm var/lib/containerd/io.containerd.metadata.v1.bolt
DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y \
    "docker-ce=5:29.8.0-1~$suffix" "docker-ce-cli=5:29.8.0-1~$suffix" \
    "containerd.io=2.3.5-1~$suffix"
restore_units
trap - EXIT
docker version --format '{{.Server.Version}}'
printf 'Engine restarted; verify node, quorum and database recovery before next node\n'
