"""Enable the verified CI path, preserving private rollback configuration."""
import datetime
import json
import os
import pathlib
import subprocess
from dokploy_api import call

os.umask(0o077)
root=pathlib.Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')
state=json.loads((root/'release-activation.json').read_text())
ds=call('GET','deployment.all?applicationId='+state['canaryId'])
assert any(d['title'].endswith(state['releaseId']) and d['status']=='done' for d in ds)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
for aid in ['NTaYSoOkFkXakwG13jeAY','MhafmNK8-0-WsWqR-0IF5']:
    app=call('GET','application.one?applicationId='+aid)
    assert app['sourceType']=='docker' and app['replicas']==2
    (root/('before-ci-release-'+aid+'-'+stamp+'.json')).write_text(json.dumps(app))
    if aid=='NTaYSoOkFkXakwG13jeAY':
        lines=[line for line in app['env'].splitlines() if not line.startswith('SPRING_FLYWAY_OUT_OF_ORDER=')]
        env='\n'.join(lines+['SPRING_FLYWAY_OUT_OF_ORDER=true'])+'\n'
        call('POST','application.update',{'applicationId':aid,'env':env,'autoDeploy':False})
        assert call('GET','application.one?applicationId='+aid)['env']==env
relay=call('GET','application.one?applicationId=QEhQLas-iMl1aksHLb3pt')
env=dict(x.split('=',1) for x in relay['env'].splitlines() if '=' in x)
assert env['RELEASE_ENABLED']=='true'
subprocess.run(['gh','secret','set','DOKPLOY_RELAY_TOKEN','--repo','XmeDavid/pointfinder'],
    input=env['RELAY_TOKEN'].strip().strip('\"\'').encode(),check=True,stdout=subprocess.DEVNULL)
subprocess.run(['gh','variable','set','DOKPLOY_DEPLOY_WITH_FAILED_CI','--repo','XmeDavid/pointfinder','--body','false'],check=True)
subprocess.run(['gh','variable','set','POINTFINDER_DEPLOY_ENABLED','--repo','XmeDavid/pointfinder','--body','true'],check=True)
subprocess.run(['gh','workflow','run','ci.yml','--repo','XmeDavid/pointfinder','--ref','master'],check=True)
print('Full master CI dispatched with gated releases enabled; failed-CI bypass remains disabled.')
