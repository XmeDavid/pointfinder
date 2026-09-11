"""Production-only Patroni launcher; never initializes an empty primary."""
import json
import os
import pathlib
import pwd
import subprocess

SYSTEM_ID = '7605372262247206949'
HOSTS = {'production-hetzner': '100.113.30.54', 'production-rainer': '100.75.57.44'}


def configuration(auth, dcs, name):
    address = HOSTS[name]
    if auth['superuser_username'] != 'scout' or dcs['username'] != 'production':
        raise ValueError('Unexpected production credential identity')
    return {
        'scope': 'pointfinder-production', 'namespace': '/pointfinder-ha/', 'name': name,
        'restapi': {'listen': '0.0.0.0:8008', 'connect_address': address + ':18008',
                    'authentication': {'username': 'operator', 'password': auth['api']}},
        'etcd3': {'hosts': ['etcd-hetzner:2379', 'etcd-arthur:2379', 'etcd-rainer:2379'],
                  'username': dcs['username'], 'password': dcs['password']},
        'bootstrap': {'method': 'reject_empty', 'reject_empty': {'command': '/bin/false'},
            'dcs': {'ttl': 60, 'loop_wait': 10, 'retry_timeout': 10,
                'maximum_lag_on_failover': 1048576, 'check_timeline': True,
                'postgresql': {'use_pg_rewind': True, 'use_slots': True, 'parameters': {
                    'wal_level': 'replica', 'wal_log_hints': 'on',
                    'max_wal_senders': 10, 'max_replication_slots': 10,
                    'max_slot_wal_keep_size': '2GB', 'shared_buffers': '128MB',
                    'max_connections': 100, 'password_encryption': 'scram-sha-256'}}}},
        'postgresql': {'listen': '0.0.0.0:5432', 'connect_address': address + ':15432',
            'data_dir': '/var/lib/postgresql/data', 'bin_dir': '/usr/lib/postgresql/16/bin',
            'pgpass': '/run/patroni/pgpass',
            'authentication': {
                'superuser': {'username': 'scout', 'password': auth['superuser']},
                'replication': {'username': 'pf_replicator', 'password': auth['replication']}},
            'pg_hba': ['local all all trust', 'host all all 127.0.0.1/32 trust',
                'host all all ::1/128 trust', 'local replication all trust',
                'host replication pf_replicator all scram-sha-256',
                'host all all all scram-sha-256'],
            'remove_data_directory_on_rewind_failure': False,
            'remove_data_directory_on_diverged_timelines': False},
        'watchdog': {'mode': 'required', 'device': '/dev/watchdog', 'safety_margin': -1},
    }


def main():
    os.umask(0o077)
    name = os.environ['PATRONI_NAME']
    if name not in HOSTS:
        raise SystemExit('Unexpected production node')
    data = pathlib.Path('/var/lib/postgresql/data')
    if (data / 'PG_VERSION').exists():
        if (data / 'PG_VERSION').read_text().strip() != '16':
            raise SystemExit('Refusing unexpected PostgreSQL major version')
        control = subprocess.check_output(['/usr/lib/postgresql/16/bin/pg_controldata', str(data)],
                                          text=True, env={**os.environ, 'LC_ALL': 'C'})
        actual = next(s.split(':', 1)[1].strip() for s in control.splitlines()
                      if s.startswith('Database system identifier:'))
        if actual != SYSTEM_ID:
            raise SystemExit('Refusing wrong production database system identifier')
    elif name == 'production-hetzner':
        raise SystemExit('Refusing empty production primary')
    auth = json.loads(pathlib.Path('/run/secrets/patroni_auth').read_text())
    dcs = json.loads(pathlib.Path('/run/secrets/etcd_auth').read_text())
    config = configuration(auth, dcs, name)
    account = pwd.getpwnam('postgres')
    data.mkdir(parents=True, exist_ok=True)
    os.chown(data, account.pw_uid, account.pw_gid)
    os.chmod(data, 0o700)
    runtime = pathlib.Path('/run/patroni')
    runtime.mkdir(mode=0o700, exist_ok=True)
    os.chown(runtime, account.pw_uid, account.pw_gid)
    path = runtime / 'patroni.json'
    path.write_text(json.dumps(config))
    os.chown(path, account.pw_uid, account.pw_gid)
    os.execv('/usr/local/bin/gosu', ['gosu', 'postgres', '/opt/patroni/bin/patroni', str(path)])


if __name__ == '__main__':
    main()
