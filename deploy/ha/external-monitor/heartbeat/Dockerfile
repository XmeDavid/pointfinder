# Heartbeat runner image: official slim Python, one stdlib-only script,
# unprivileged uid/gid 999 from the start. Build on each Dokploy host (local
# image, never pushed):
#   docker build -t pointfinder-heartbeat:1 deploy/ha/external-monitor/heartbeat
FROM python:3.12-slim
RUN groupadd --gid 999 heartbeat \
    && useradd --uid 999 --gid 999 --no-create-home --shell /usr/sbin/nologin heartbeat \
    && install -d -o 999 -g 999 -m 0700 /state
COPY --chown=root:root --chmod=0644 heartbeat.py /opt/pointfinder/heartbeat.py
RUN chmod 0755 /opt /opt/pointfinder
USER 999:999
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python3", "/opt/pointfinder/heartbeat.py"]
