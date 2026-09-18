"""Deploy only reviewed monitor/pusher changes through Dokploy.

Requires the authenticated local SSH forward used by dokploy_api.py. Secrets
remain in memory or in the mode-0600 private rollback record, never in output.
This rejects changes to Patroni, backup, networking, volumes, and all unrelated
service settings. Build the new immutable local image tags on the host first.
"""
import copy
import datetime
import json
import os
from pathlib import Path
import sys

import yaml
from dokploy_api import call

TARGETS = {
    'hetzner': ('ACeC7DfXK2PRHryUCOaCr', None, 'pointfinder-pg-hetzner-vv3yw0'),
    'rainer': ('c7lBmLSFdmFxVhKdweTNN', 'ZVwJvhxUQkLeUVeo8HhtN', 'pointfinder-pg-rainer-0u6pju'),
}
PREFIX = 'pointfinder-patroni:16.15-4.1.5-production-'


def validate_change(old_source, new_source):
    old, new = yaml.safe_load(old_source), yaml.safe_load(new_source)
    normalized = copy.deepcopy(new)
    for service, component in [('monitor', 'monitor'), ('alert-pusher', 'alerting')]:
        previous = old['services'][service]
        desired = new['services'][service]
        assert previous['image'] in {PREFIX + component + '-r1', PREFIX + component + '-r2'}
        assert desired['image'] == PREFIX + component + '-r2'
        normalized['services'][service]['image'] = previous['image']
        old_env = previous.get('environment', {})
        new_env = desired.get('environment', {})
        # Only the explicit expected-member list is new; no credential, SQL,
        # transport or service-role changes are allowed through this helper.
        if service == 'monitor':
            assert new_env['POINTFINDER_MONITOR_EXPECTED_STANDBYS'] == 'production-hetzner,production-rainer'
            normalized['services'][service]['environment'] = {
                k: v for k, v in new_env.items() if k != 'POINTFINDER_MONITOR_EXPECTED_STANDBYS'}
            if 'POINTFINDER_MONITOR_EXPECTED_STANDBYS' in old_env:
                normalized['services'][service]['environment']['POINTFINDER_MONITOR_EXPECTED_STANDBYS'] = old_env['POINTFINDER_MONITOR_EXPECTED_STANDBYS']
    assert normalized == old, 'Changes extend beyond approved monitor/pusher fields'


def main():
    host = sys.argv[1]
    operation = sys.argv[2] if len(sys.argv) > 2 else 'check'
    assert operation in {'check', 'deploy'}
    cid, server, app = TARGETS[host]
    before = call('GET', 'compose.one?composeId=' + cid)
    assert before['serverId'] == server and before['appName'] == app
    assert before['sourceType'] == 'raw' and before['composeStatus'] == 'done'
    assert before['composeType'] == 'docker-compose' and not before.get('command')
    source = Path(__file__).with_name('patroni-production-' + host + '.yml').read_text()
    validate_change(before['composeFile'], source)
    if operation == 'check':
        print(host + ': only approved monitor/pusher fields differ')
        return
    if source == before['composeFile']:
        print(host + ': configuration already matches; no deployment requested')
        return
    os.umask(0o077)
    directory = Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    with (directory / ('before-monitor-repair-' + host + '-' + stamp + '.json')).open('x') as stream:
        json.dump(before, stream)
    call('POST', 'compose.update', {'composeId': cid, 'composeFile': source})
    after = call('GET', 'compose.one?composeId=' + cid)
    assert after['composeFile'] == source
    call('POST', 'compose.deploy', {'composeId': cid,
        'title': 'Replication monitoring hardening - ' + host})
    print(host + ': Dokploy deployment requested; private rollback metadata retained')


if __name__ == '__main__':
    main()
