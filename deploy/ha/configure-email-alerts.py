"""Configure approved recipient using existing runtime mail credentials; never log secrets."""
import json
import subprocess
import sys
from dokploy_api import call

MAIN = ['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-i',
        '/Users/xmedavid/.ssh/id_ed25519', 'root@internal.davidsbatista.com']
MAC = ['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-i',
       '/Users/xmedavid/.ssh/vectr', 'debian@192.168.0.236']
NAME = 'PointFinder infrastructure email'
TO = ['mail@davidsbatista.com']

def main():
    raw = subprocess.check_output(MAIN + [
        'docker service inspect pointfinder-backend-v4djml'], stderr=subprocess.DEVNULL)
    service = json.loads(raw)[0]
    env = dict(item.split('=', 1) for item in service['Spec']['TaskTemplate']['ContainerSpec']['Env'])
    key = env.get('MAIL_PASSWORD', '')
    assert key.startswith('re_') and '${' not in key, 'Runtime Resend credential unavailable'
    sender = env.get('MAIL_FROM', 'info@pointfinder.pt')
    payload = {'apiKey': key, 'fromAddress': sender, 'toAddresses': TO}
    if sys.argv[1] == 'test':
        result = call('POST', 'notification.testResendConnection', payload)
        if isinstance(result, bool):
            print('Dokploy test accepted:', result)
            assert result, 'Mail provider rejected test'
        else:
            print('Dokploy test request completed; response type:', type(result).__name__)
        # Only expose known boolean outcome fields, never provider messages.
        if isinstance(result, dict):
            print({k: v for k, v in result.items() if k in ('success',) and isinstance(v, bool)})
        return
    assert sys.argv[1] == 'configure'
    existing = [n for n in call('GET', 'notification.all') if n.get('name') == NAME]
    assert len(existing) <= 1, 'Duplicate notification names require review'
    settings = dict(payload, name=NAME, appBuildError=True, appDeploy=False,
                    databaseBackup=True, dockerCleanup=False, dokployBackup=True,
                    dokployRestart=True, serverThreshold=True, volumeBackup=True)
    if existing:
        n = call('GET', 'notification.one?notificationId=' + existing[0]['notificationId'])
        resend = n.get('resend') or {}
        assert resend.get('resendId'), 'Existing notification is not Resend'
        call('POST', 'notification.updateResend', dict(settings,
            notificationId=n['notificationId'], resendId=resend['resendId']))
    else:
        call('POST', 'notification.createResend', settings)
    found = [n for n in call('GET', 'notification.all') if n.get('name') == NAME]
    assert len(found) == 1
    record = call('GET', 'notification.one?notificationId=' + found[0]['notificationId'])
    assert record['resend']['toAddresses'] == TO
    print('Dokploy Resend notification configured:', found[0]['notificationId'])
    # Secret travels only over SSH stdin, not process arguments or tool output.
    secret = json.dumps({'api_key': key, 'from': sender, 'to': TO}).encode()
    installer = "import os,sys; from pathlib import Path; os.umask(0o077); p=Path('/etc/dokploy/pointfinder/ha-secrets/alert-email.json'); b=sys.stdin.buffer.read(); p.write_bytes(b); os.chown(p,999,999); os.chmod(p,0o400)"
    import shlex
    for ssh, prefix in ((MAIN, ''), (MAC, 'sudo ')):
        subprocess.run(ssh + [prefix + 'python3 -c ' + shlex.quote(installer)],
                       input=secret, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('Protected email secret installed on both database hosts; no application redeployment.')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Email setup failed:', type(exc).__name__, file=sys.stderr)
        raise SystemExit(1)
