# pgBackRest overlay on the exact production Patroni image.
# The base digest resolves to postgres:16.15-trixie, so the PGDG "trixie-pgdg"
# repository already configured in that image supplies pgBackRest.
# Version verified on 2026-09-10 against apt.postgresql.org (trixie-pgdg).
#
# This image serves both roles without changing the inherited ENTRYPOINT:
#   * as the Patroni container (archive_command / restore_command call
#     /usr/bin/pgbackrest inside it), and
#   * as the backup sidecar, by overriding the entrypoint with the runner
#     (see pgbackrest-sidecar.example.yml).
FROM pointfinder-patroni:16.15-4.1.5-production-r1
RUN apt-get update \
    && apt-get install -y --no-install-recommends pgbackrest=2.59.1-1.pgdg13+1 \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o postgres -g postgres -m 0750 /var/log/pgbackrest /var/spool/pgbackrest /var/lib/pgbackrest-runner \
    && install -d -o postgres -g postgres -m 0700 /run/pgbackrest \
    && rm -f /etc/pgbackrest.conf
COPY --chown=root:root pgbackrest.conf.example /usr/local/share/pointfinder/pgbackrest.conf.example
COPY --chown=root:root runner.py /usr/local/bin/pointfinder-pgbackrest-runner
# The runner is launched by the sidecar service definition, not by default:
#   entrypoint: ["/opt/patroni/bin/python", "/usr/local/bin/pointfinder-pgbackrest-runner"]
# It reuses the Patroni virtualenv for psycopg2; no new Python dependencies.
