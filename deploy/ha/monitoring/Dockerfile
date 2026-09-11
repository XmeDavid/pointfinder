# Monitoring overlay on the production pgBackRest image. Adds one script; the
# psycopg2 in the Patroni virtualenv and /usr/bin/pgbackrest are already there.
# Build on each database host (image is local, never pushed):
#   docker build -t pointfinder-patroni:16.15-4.1.5-production-monitor-r1 deploy/ha/monitoring
FROM pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2
COPY --chown=root:root monitor.py /opt/pointfinder-monitor/monitor.py
RUN ln -s /opt/pointfinder-monitor/monitor.py /usr/local/bin/pointfinder-monitor \
    && install -d -o postgres -g postgres -m 0700 /state
# The inherited Patroni ENTRYPOINT is unchanged; the sidecar service overrides it:
#   entrypoint: ["/opt/patroni/bin/python", "/usr/local/bin/pointfinder-monitor"]
