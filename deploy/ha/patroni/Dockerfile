FROM postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv \
    && python3 -m venv /opt/patroni \
    && /opt/patroni/bin/pip install --no-cache-dir 'patroni[etcd3]==4.1.5' 'psycopg2-binary==2.9.10' \
    && rm -rf /var/lib/apt/lists/*
COPY entrypoint.py /usr/local/bin/pointfinder-patroni
ENTRYPOINT ["/opt/patroni/bin/python", "/usr/local/bin/pointfinder-patroni"]
