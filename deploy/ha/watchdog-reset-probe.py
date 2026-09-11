"""One-shot destructive-to-uptime test for VM 102 ONLY; never auto-restart.

Run only after moving the rehearsal primary away and checking remaining quorum.
The caller must map the hardware watchdog, mount its sysfs identity read-only,
and explicitly set POINTFINDER_RESET_TEST=vm102-approved. This resets the VM.
"""
import array
import fcntl
import os
import pathlib
import time

assert os.environ.get('POINTFINDER_RESET_TEST') == 'vm102-approved'
assert '6300' in pathlib.Path('/watchdog-identity').read_text()
assert os.geteuid() == 999
device = os.open('/dev/watchdog', os.O_WRONLY)
timeout = array.array('i', [15])
# Linux WDIOC_SETTIMEOUT = _IOWR('W', 6, int).
fcntl.ioctl(device, 0xC0045706, timeout, True)
print('Hardware watchdog armed for %s seconds; deliberately withholding keepalive' % timeout[0], flush=True)
time.sleep(timeout[0] + 30)
# If fencing failed, disarm before reporting failure. Never leave an armed test.
os.write(device, b'V')
os.close(device)
raise SystemExit('FAIL: watchdog did not reset VM within the observation window')
