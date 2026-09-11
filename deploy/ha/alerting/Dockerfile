# Alerting overlay on the monitoring image. Adds one stdlib-only script; the
# Patroni virtualenv's Python is all it needs (no psycopg2, no pgBackRest).
# Build on each database host (image is local, never pushed):
#   docker build -t pointfinder-patroni:16.15-4.1.5-production-alerting-r1 deploy/ha/alerting
FROM pointfinder-patroni:16.15-4.1.5-production-monitor-r1
COPY --chown=root:root alert_pusher.py /opt/pointfinder-alerting/alert_pusher.py
RUN ln -s /opt/pointfinder-alerting/alert_pusher.py /usr/local/bin/pointfinder-alert-pusher \
    && install -d -o postgres -g postgres -m 0700 /state /monitor-state
# The inherited ENTRYPOINT is unchanged; the sidecar service overrides it:
#   entrypoint: ["/opt/patroni/bin/python", "/usr/local/bin/pointfinder-alert-pusher"]
