"""Apply one reviewed host Compose through Dokploy; keep private rollback metadata."""
import datetime
import json
import os
from pathlib import Path
import sys
from dokploy_api import call

host = sys.argv[1]
targets = {'hetzner': ('ACeC7DfXK2PRHryUCOaCr', None, 'pointfinder-pg-hetzner-vv3yw0'),
           'rainer': ('c7lBmLSFdmFxVhKdweTNN', 'ZVwJvhxUQkLeUVeo8HhtN', 'pointfinder-pg-rainer-0u6pju')}
cid, server, app = targets[host]
before = call('GET', 'compose.one?composeId=' + cid)
assert before['serverId'] == server and before['appName'] == app
assert before['sourceType'] == 'raw'
source = Path(__file__).with_name('patroni-production-' + host + '.yml').read_text()
assert 'pointfinder-patroni:16.15-4.1.5-production-pgbackrest-r2' in source
assert '/dev/watchdog0:/dev/watchdog' in source
os.umask(0o077)
directory = Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
with (directory / ('before-pgbackrest-compose-' + host + '-' + stamp + '.json')).open('x') as stream:
    json.dump(before, stream)
call('POST', 'compose.update', {'composeId': cid, 'composeFile': source})
after = call('GET', 'compose.one?composeId=' + cid)
assert after['composeFile'] == source
call('POST', 'compose.deploy', {'composeId': cid, 'title': 'PostgreSQL backup integration - ' + host})
print('Dokploy deployment requested for ' + host + '; rollback metadata retained privately.')
