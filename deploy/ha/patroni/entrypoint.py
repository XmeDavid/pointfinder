"""Rehearsal-only launcher. Secrets never appear in arguments or logs."""
import json
import os
import pathlib
import pwd

data = pathlib.Path('/var/lib/postgresql/data')
if os.environ.get('ADOPT_ONLY') == 'true' and not (data / 'PG_VERSION').is_file():
    raise SystemExit('Refusing adoption: existing PG_VERSION is missing')
auth = json.loads(pathlib.Path('/run/secrets/patroni_auth').read_text())
name = os.environ['PATRONI_NAME']
address = os.environ['PATRONI_ADDRESS']
watchdog_mode = os.environ.get('POINTFINDER_WATCHDOG_MODE', 'off')
assert watchdog_mode in ('off', 'required')
config = {
    'scope': 'pointfinder-rehearsal',
    'namespace': '/pointfinder-ha/',
    'name': name,
    'restapi': {
        'listen': '0.0.0.0:8008',
        'connect_address': os.environ.get('POINTFINDER_API_ADDRESS', address + ':8008'),
        'authentication': {'username': 'operator', 'password': auth['api']},
    },
    'etcd3': {'hosts': ['etcd-hetzner:2379', 'etcd-arthur:2379', 'etcd-rainer:2379']},
    'bootstrap': {
        # Never silently initialize an empty cluster if the DCS/data is wrong.
        'method': 'reject_empty', 'reject_empty': {'command': '/bin/false'},
        'dcs': {
            'ttl': 60, 'loop_wait': 10, 'retry_timeout': 10,
            'maximum_lag_on_failover': 1048576, 'check_timeline': True,
            'postgresql': {'use_pg_rewind': True, 'use_slots': True, 'parameters': {
                'wal_level': 'replica', 'wal_log_hints': 'on',
                'max_wal_senders': 10, 'max_replication_slots': 10,
                'max_slot_wal_keep_size': '2GB', 'shared_buffers': '64MB',
                'max_connections': 30, 'password_encryption': 'scram-sha-256',
            }},
        },
    },
    'postgresql': {
        'listen': '0.0.0.0:5432', 'connect_address': address + ':5432',
        'data_dir': str(data), 'bin_dir': '/usr/lib/postgresql/16/bin',
        'pgpass': '/run/patroni/pgpass',
        'authentication': {
            'superuser': {'username': 'postgres', 'password': auth['superuser']},
            'replication': {'username': 'replicator', 'password': auth['replication']},
        },
        'pg_hba': ['local all all trust', 'host replication replicator all scram-sha-256',
                   'host all postgres all scram-sha-256'],
        'remove_data_directory_on_rewind_failure': False,
        'remove_data_directory_on_diverged_timelines': False,
    },
    # Required only on a host whose reset path and device permissions were tested.
    'watchdog': {'mode': watchdog_mode, 'device': '/dev/watchdog', 'safety_margin': -1},
}
account = pwd.getpwnam('postgres')
dcs_auth_path = pathlib.Path('/run/secrets/etcd_auth')
if dcs_auth_path.exists():
    dcs_auth = json.loads(dcs_auth_path.read_text())
    config['etcd3'].update(username=dcs_auth['username'], password=dcs_auth['password'])
data.mkdir(parents=True, exist_ok=True)
os.chown(data, account.pw_uid, account.pw_gid)
os.chmod(data, 0o700)
runtime = pathlib.Path('/run/patroni')
runtime.mkdir(mode=0o700, exist_ok=True)
os.chown(runtime, account.pw_uid, account.pw_gid)
path = runtime / 'patroni.json'
os.umask(0o077)
path.write_text(json.dumps(config))
os.chown(path, account.pw_uid, account.pw_gid)
os.execv('/usr/local/bin/gosu', ['gosu', 'postgres', '/opt/patroni/bin/patroni', str(path)])
