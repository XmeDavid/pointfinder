"""Hetzner-only, temporary peer partition with pre-armed automatic rollback.

Blocks only traffic to/from the two Mac Tailscale addresses. Leaves public SSH
and internet access intact. Never flushes an existing firewall chain.
"""
import json
from pathlib import Path
import re
import socket
import subprocess
import sys

assert socket.gethostname()=='davidsbatista'
operation, chain=sys.argv[1:]
assert operation in {'apply','rollback'} and re.fullmatch(r'PFHA_[a-f0-9]{12}',chain)
peers=['100.107.153.73','100.75.57.44']
def ip(*args,check=True):
    return subprocess.run(['iptables','-w','5',*args],capture_output=True,text=True,check=check)
if operation=='rollback':
    for parent in ['INPUT','OUTPUT','FORWARD']:
        while ip('-C',parent,'-j',chain,check=False).returncode==0:
            ip('-D',parent,'-j',chain)
    if ip('-S',chain,check=False).returncode==0:
        ip('-F',chain)
        ip('-X',chain)
    print(json.dumps({'partition':chain,'state':'removed'}))
else:
    assert ip('-S',chain,check=False).returncode!=0,'Partition chain already exists'
    script=Path(__file__).resolve()
    assert script==Path('/run/pointfinder-partition-control.py')
    # Arm first; rollback needs no network and the rules also disappear on reboot.
    subprocess.run(['systemd-run','--unit=pointfinder-partition-'+chain,
        '--on-active=150s','--timer-property=AccuracySec=1s',
        '/usr/bin/python3',str(script),'rollback',chain],check=True,capture_output=True)
    try:
        ip('-N',chain)
        for peer in peers:
            ip('-A',chain,'-s',peer,'-j','DROP')
            ip('-A',chain,'-d',peer,'-j','DROP')
        ip('-A',chain,'-j','RETURN')
        for parent in ['INPUT','OUTPUT','FORWARD']: ip('-I',parent,'1','-j',chain)
    except Exception:
        subprocess.run(['python3',str(script),'rollback',chain],capture_output=True)
        raise
    print(json.dumps({'partition':chain,'state':'active','automatic_rollback_seconds':150}))
