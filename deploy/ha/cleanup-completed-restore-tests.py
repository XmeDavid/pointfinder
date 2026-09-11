"""Remove exact completed rehearsal containers/volumes, after backup checks.

No prune, wildcards, live services, production mounts or backup repositories.
"""
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess

spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-legacy-volume.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
TARGETS={
 'main':(['pf-s3-restore-d93d8b686b','pf-s3-restore-d93d8b686b-files',
          'pf-pitr-test-3ad204a8-verify','pf-pitr-test-3ad204a8-restore','pf-pitr-test-3ad204a8-source'],
         ['pf-s3-restore-d93d8b686b-data','pf-pitr-test-3ad204a8-repo','pf-pitr-test-3ad204a8-restored','pf-pitr-test-3ad204a8-pgdata']),
 'mac':(['pf-s3-restore-c7cea6263c','pf-s3-restore-c7cea6263c-files'],['pf-s3-restore-c7cea6263c-data'])}
REMOTE=r'''
import json,pathlib,subprocess,sys,time,os
os.umask(0o077)
c=json.load(sys.stdin); names=set(c['containers']); volumes=set(c['volumes'])
monitor='pointfinder-pg-'+('hetzner-vv3yw0' if c['host']=='main' else 'rainer-0u6pju')+'-monitor-1'
subprocess.run(['docker','exec',monitor,'/opt/patroni/bin/python','/usr/local/bin/pointfinder-monitor','--healthcheck'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
ids=subprocess.check_output(['docker','ps','-aq'],text=True).split()
allc=json.loads(subprocess.check_output(['docker','inspect',*ids]))
found={x['Name'].lstrip('/'):x for x in allc if x['Name'].lstrip('/') in names}
assert set(found)==names,'Target missing; review prior partial run'
for name,x in found.items():
 assert x['State']['Status']=='exited' and x['State']['ExitCode']==0,'Not a successful stopped test'
 assert all(m.get('Name') in volumes for m in x['Mounts'] if m['Type']=='volume'),'Unexpected volume'
for x in allc:
 if x['Name'].lstrip('/') not in names:
  assert not any(m.get('Name') in volumes for m in x['Mounts']),'Shared volume'
ids=subprocess.check_output(['docker','service','ls','-q'],text=True).split()
for x in json.loads(subprocess.check_output(['docker','service','inspect',*ids])) if ids else []:
 for m in x['Spec']['TaskTemplate'].get('ContainerSpec',{}).get('Mounts',[]):
  assert m.get('Source') not in volumes,'Swarm reference'
evidence=pathlib.Path('/var/backups/pointfinder-ha/completed-restore-tests-'+c['host']+'.json')
assert not evidence.exists(),'Cleanup already started'
evidence.parent.mkdir(parents=True,exist_ok=True)
evidence.write_text(json.dumps({'removed_at':time.time(),'containers':list(found.values()),'volumes':sorted(volumes)}))
subprocess.run(['docker','container','rm',*sorted(names)],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['docker','volume','rm',*sorted(volumes)],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'host':c['host'],'removed_containers':len(names),'removed_test_volumes':len(volumes),'production_untouched':True}))
'''
for host,(containers,volumes) in TARGETS.items():
 command=('sudo ' if host=='mac' else '')+'python3 -c '+shlex.quote(REMOTE)
 p=subprocess.run((audit.MAIN if host=='main' else audit.MAC)+[command],input=json.dumps({'host':host,'containers':containers,'volumes':volumes}),text=True,capture_output=True)
 if p.returncode:raise SystemExit('Cleanup gate failed on '+host+'; output withheld. Inspect exact targets before retrying.')
 print(p.stdout.strip())
