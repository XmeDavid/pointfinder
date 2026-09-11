"""Remove the first-release Flyway override only after CI and migrations pass."""
import datetime
import json
import os
import pathlib
import subprocess
from dokploy_api import call

RUN='34454464035'
result=json.loads(subprocess.check_output(['gh','run','view',RUN,'--repo','XmeDavid/pointfinder',
    '--json','status,conclusion,headSha']))
assert result['status']=='completed' and result['conclusion']=='success'
subprocess.run(['python3',str(pathlib.Path(__file__).with_name('verify-release-runtime.py'))],check=True)
ssh=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-i',
     '/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com']
query="docker exec pointfinder-pg-hetzner-vv3yw0-patroni-hetzner-1 psql -U scout -d pointfinder -Atc \"select count(*) from flyway_schema_history where version in ('66','67') and success\""
assert subprocess.check_output(ssh+[query]).strip()==b'2'
aid='NTaYSoOkFkXakwG13jeAY'
app=call('GET','application.one?applicationId='+aid)
assert 'SPRING_FLYWAY_OUT_OF_ORDER=true' in app['env'].splitlines()
os.umask(0o077)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
root=pathlib.Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')
(root/('after-first-ci-release-'+stamp+'.json')).write_text(json.dumps(app))
env='\n'.join(x for x in app['env'].splitlines() if not x.startswith('SPRING_FLYWAY_OUT_OF_ORDER='))+'\n'
call('POST','application.update',{'applicationId':aid,'env':env})
assert call('GET','application.one?applicationId='+aid)['env']==env
call('POST','application.deploy',{'applicationId':aid,'title':'Verify default Flyway after V66/V67 migration',
    'description':'Same CI-verified immutable image; remove temporary out-of-order override only.'})
print('Default-Flyway verification rollout requested; image unchanged.')
