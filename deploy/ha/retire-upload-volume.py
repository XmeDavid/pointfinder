"""Retire only audited Hetzner volume 104744479. Never touches PG volume.

Requires final media audit and SHA-identical retirement archive on both hosts.
Run only with explicit authorization to permanently delete the upload volume.
"""
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import time
from importlib.util import spec_from_file_location, module_from_spec

spec=spec_from_file_location('audit',Path(__file__).with_name('audit-legacy-volume.py'))
audit=module_from_spec(spec);spec.loader.exec_module(audit)
MAIN,MAC=audit.MAIN,audit.MAC
ARCHIVE='upload-volume-104744479-final.tar.gz'
SRC='/var/backups/pointfinder-ha/storage-retirement/'+ARCHIVE
DST='/srv/pointfinder-s3/storage-retirement/'+ARCHIVE
EVIDENCE=Path('/Users/xmedavid/.codex/pointfinder-ha-recovery')

def ssh(host,command):
    result=subprocess.run(host+[command],capture_output=True,text=True)
    if result.returncode:raise RuntimeError('Remote operation failed; details withheld')
    return result.stdout

def api(method,path):
    token=None
    for line in Path('/Users/xmedavid/.env').read_text().splitlines():
        k,s,v=line.partition('=')
        if s and k.strip()=='HETZNER_API_KEY':token=v.strip().strip('\"\'')
    assert token and all(c.isalnum() or c in '_-' for c in token)
    cfg='url = "https://api.hetzner.cloud/v1'+path+'"\nrequest = "'+method+'"\nheader = "Authorization: Bearer '+token+'"\n'
    p=subprocess.run(['curl','--silent','--show-error','--max-time','30','--config','-','--write-out','\n%{http_code}'],input=cfg,capture_output=True,text=True)
    assert p.returncode==0,'Hetzner network error'
    body,_,code=p.stdout.rpartition('\n')
    if code=='404':return None
    assert code.startswith('2'),'Hetzner request failed'
    return json.loads(body) if body else {}

def main():
    os.umask(0o077)
    data=json.loads((EVIDENCE/'legacy-volume-final-audit.json').read_text())
    assert data['verified'] and len(data['files'])==314 and data['bytes']==2108158576
    assert time.time()-(EVIDENCE/'legacy-volume-final-audit.json').stat().st_mtime<3600,'Audit stale'
    v=api('GET','/volumes/104744479')['volume']
    pg=api('GET','/volumes/105155434')['volume']
    assert v['name']=='upload_volume' and v['size']==30 and v['server']==114836804
    assert pg['name']=='pg_volume' and pg['server']==114836804
    a=ssh(MAIN,'sha256sum '+SRC).split()[0]
    b=ssh(MAC,'sudo sha256sum '+DST).split()[0]
    assert len(a)==64 and a==b,'Retirement copies differ'
    ssh(MAIN,'tar -tzf '+SRC+' >/dev/null')
    ssh(MAC,'sudo tar -tzf '+DST+' >/dev/null')
    (EVIDENCE/'retired-upload-volume-metadata.json').write_text(json.dumps({'volume':v,'archive':ARCHIVE,'sha256':a,'main':SRC,'mac':DST,'verified_at':time.time()}))
    # Exact fstab entry removal with a protected recovery copy; no force/lazy unmount.
    remote=r'''
import pathlib,subprocess,shutil,json
target='/mnt/HC_Volume_104744479'
assert pathlib.Path(target).is_mount()
assert subprocess.run(['fuser','-m',target],capture_output=True).returncode==1,'Volume busy'
for kind in ('container','service','volume'):
 ids=subprocess.check_output(['docker',kind,'ls','-q'],text=True).split()
 for item in json.loads(subprocess.check_output(['docker',kind,'inspect',*ids])) if ids else []:
  fields=[item.get('Mounts',[]),item.get('Options',{}),item.get('Spec',{}).get('TaskTemplate',{}).get('ContainerSpec',{}).get('Mounts',[])]
  assert '104744479' not in json.dumps(fields) and 'upload_volume' not in json.dumps(fields),'Docker reference remains'
p=pathlib.Path('/etc/fstab');old=p.read_text();lines=old.splitlines(keepends=True)
matches=[l for l in lines if l.strip() and not l.lstrip().startswith('#') and len(l.split())>1 and l.split()[1]==target]
assert len(matches)==1,'Unexpected fstab entry count'
backup=pathlib.Path('/var/backups/pointfinder-ha/storage-retirement/fstab-before-retirement')
assert not backup.exists(),'Retirement already started'
shutil.copy2(p,backup);backup.chmod(0o600)
subprocess.run(['umount',target],check=True)
assert not pathlib.Path(target).is_mount()
p.write_text(''.join(l for l in lines if l not in matches))
subprocess.run(['systemctl','daemon-reload'],check=True)
assert pathlib.Path('/mnt/HC_Volume_105155434').is_mount(),'Live PG mount missing'
'''
    ssh(MAIN,'python3 -c '+shlex.quote(remote))
    action=api('POST','/volumes/104744479/actions/detach')['action']['id']
    for _ in range(30):
        state=api('GET','/actions/'+str(action))['action']['status']
        if state=='success':break
        assert state!='error','Detach failed'
        time.sleep(1)
    else:raise RuntimeError('Detach pending; no delete attempted')
    assert api('GET','/volumes/104744479')['volume']['server'] is None
    api('DELETE','/volumes/104744479')
    assert api('GET','/volumes/104744479') is None
    assert api('GET','/volumes/105155434')['volume']['server']==114836804
    print('Deleted upload_volume 104744479 (30GB). PG volume untouched. Recovery archives retained on both hosts.')

if __name__=='__main__':main()
