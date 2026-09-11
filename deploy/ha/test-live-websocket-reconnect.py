"""Use the protected synthetic fixture for live STOMP reconnect verification.

Only forces a rolling restart of the existing pinned two-replica backend.
Secrets flow directly from SSH stdout into Node stdin, never logs or files.
"""
import json
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

assert sys.argv[1:]==['--execute']
ssh=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=5',
     '-i','/Users/xmedavid/.ssh/id_ed25519','root@internal.davidsbatista.com']
def remote(command,timeout=20):
    p=subprocess.run(ssh+[command],capture_output=True,text=True,timeout=timeout)
    if p.returncode:raise RuntimeError('Remote operation failed; output suppressed')
    return p.stdout.strip()
raw=remote('cat /var/backups/pointfinder-ha/production-adoption/upload-smoke.json')
state=json.loads(raw)
assert not state.get('cleaned')
spec=json.loads(remote('docker service inspect pointfinder-backend-v4djml'))[0]['Spec']
assert spec['TaskTemplate']['ContainerSpec']['Image'].endswith('@sha256:8158617142bb81e38936730abbd6dd81fca5efa1e37a627d86faf3174a8b665a')
assert spec['Mode']['Replicated']['Replicas']==2 and spec['UpdateConfig']['Order']=='stop-first'
child=subprocess.Popen(['node',str(Path(__file__).with_name('live-websocket-reconnect.mjs'))],
    stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
child.stdin.write(json.dumps({'game':state['game'],'token':state['operatorToken']})+'\n');child.stdin.flush()
del raw,state,spec
output=queue.Queue()
def read_output():
    for line in child.stdout:output.put(line)
    output.put(None)
threading.Thread(target=read_output,daemon=True).start()
deadline=time.monotonic()+420
forced=False;finished=False;passed=False;next_check=0
try:
    while time.monotonic()<deadline:
        try:line=output.get(timeout=2)
        except queue.Empty:line=''
        if line:
            result=json.loads(line)
            # Child output is deliberately limited to safe counts/statuses.
            print(json.dumps(result),flush=True)
            if result.get('ready') and not forced:
                remote('docker service update --detach=true --force pointfinder-backend-v4djml')
                forced=True
                print('Pinned backend rolling restart requested.',flush=True)
            if result.get('result')=='passed':passed=True
        if child.poll() is not None:break
        if forced and not finished and time.monotonic()>=next_check:
            status=remote("docker service inspect --format '{{.UpdateStatus.State}}' pointfinder-backend-v4djml")
            next_check=time.monotonic()+5
            if status=='completed':
                child.stdin.write('{"finish":true}\n');child.stdin.flush();finished=True
            elif status not in {'updating','completed'}:raise RuntimeError('Backend update did not complete normally')
    if child.poll() is None:raise RuntimeError('WebSocket test deadline exceeded')
    assert child.returncode==0 and passed
finally:
    if child.poll() is None:child.terminate();child.wait(timeout=10)
