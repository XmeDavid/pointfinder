# Control-plane backup runner image. Build on the Dokploy host (local image,
# never pushed):
#   docker build -t pointfinder-control-plane-backup:r1 deploy/ha/control-plane-backup
#
# Same pinned Alpine base as Dockerfile.s3-recovery. The Docker CLI is copied
# from the official docker:29-cli image so its API version matches the
# production Docker 29.x engine (Debian bookworm's packaged docker.io CLI is
# too old for the engine's minimum API); the stdlib runner never needs
# PostgreSQL client tools because pg_dump/pg_restore run inside the Dokploy
# database container. py3-boto3 is only used by the optional s3_upload hook.
FROM docker:29-cli AS docker-cli

FROM alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce
RUN apk add --no-cache python3 py3-boto3 openssl ca-certificates tzdata
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY backup_runner.py s3_upload.py /opt/control-plane-backup/
RUN install -d -m 0700 /state /backups /tmp/control-plane-stage \
    && chmod 0755 /opt/control-plane-backup/backup_runner.py \
    && /usr/local/bin/docker --version \
    && python3 -c "import boto3, botocore; import sys; sys.path.insert(0, '/opt/control-plane-backup'); import backup_runner, s3_upload"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    CPB_DEST_DIR=/backups CPB_STATE_DIR=/state CPB_STAGE_DIR=/tmp/control-plane-stage \
    CPB_DOKPLOY_ETC=/host/etc/dokploy CPB_PASSPHRASE_FILE=/run/secrets/control-plane-passphrase
HEALTHCHECK --interval=60s --timeout=10s --retries=3 --start-period=5m \
    CMD ["python3", "/opt/control-plane-backup/backup_runner.py", "healthcheck"]
ENTRYPOINT ["python3", "/opt/control-plane-backup/backup_runner.py"]
CMD ["run"]
