"""Run inside the alert image with only the email secret mounted.

Sends two explicitly labelled synthetic test emails; never reads/writes the
production monitor state or database. Uses an isolated temporary state folder.
"""
import datetime
import json
import pathlib
import sys
import tempfile
sys.path.insert(0, '/opt/pointfinder-alerting')
from alert_pusher import Pusher, Settings

with tempfile.TemporaryDirectory(prefix='pointfinder-alert-test-') as directory:
    root = pathlib.Path(directory)
    monitor = root / 'monitor'
    monitor.mkdir()
    settings = Settings({'PATRONI_NAME': 'synthetic-email-check',
        'POINTFINDER_ALERT_SUBJECT_PREFIX': '[PointFinder TEST - no incident]',
        'POINTFINDER_ALERT_MONITOR_STATE_DIR': str(monitor),
        'POINTFINDER_ALERT_STATE_DIR': str(root / 'state')})
    pusher = Pusher(settings)
    def report(status):
        (monitor / 'health.json').write_text(json.dumps({
            'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'node': 'synthetic-email-check', 'status': status,
            'checks': {'installation_test': {'status': status,
                'reason': 'Synthetic installation test. Production is unaffected.'}}}))
    report('critical')
    pusher.tick()
    assert pusher.state.delivered and pusher.state.delivered['kind'] == 'alert'
    first_id = pusher.state.delivered['id']
    pusher = Pusher(settings)
    pusher.tick()
    assert pusher.state.delivered['id'] == first_id
    assert len(pusher.state.recent_sends) == 1, 'Duplicate alert after restart'
    report('ok')
    pusher.tick()
    assert pusher.state.delivered['kind'] == 'recovery'
    assert len(pusher.state.recent_sends) == 2
    print('Synthetic alert and recovery accepted; restart deduplication passed.')
