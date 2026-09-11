// Fixed configuration for the PointFinder external uptime monitor.
// Nothing here is user input: hosts and probes are a closed list, and the
// Worker never accepts a URL, host name or address from a request.

export const HOSTS = Object.freeze(['hetzner', 'arthur', 'rainer']);

export const PROBES = Object.freeze([
  { id: 'web-ch', url: 'https://pointfinder.ch', kind: 'http' },
  { id: 'web-pt', url: 'https://pointfinder.pt', kind: 'http' },
  { id: 'api-ch', url: 'https://api.pointfinder.ch/actuator/health', kind: 'health' },
  { id: 'api-pt', url: 'https://api.pointfinder.pt/actuator/health', kind: 'health' },
]);

export const MINUTE_MS = 60_000;

export const DEFAULTS = Object.freeze({
  probeTimeoutMs: 8_000,
  probeBodyMaxBytes: 16_384,
  heartbeatMissingMs: 15 * MINUTE_MS,     // client beats every 5 min; 3 misses
  deploymentGraceMs: 15 * MINUTE_MS,      // never-seen hosts alert after this
  probeFailsToAlert: 2,
  probePassesToRecover: 2,
  heartbeatFailsToAlert: 1,               // "missing > 15 min" is already debounced
  heartbeatPassesToRecover: 1,
  minEmailIntervalMs: 5 * MINUTE_MS,      // at most one email per 5 minutes
  leaseMs: 4 * MINUTE_MS,                 // shorter than the 5-minute cron
  mailTimeoutMs: 15_000,
  eventsKeep: 200,
  maxTokenBytes: 512,
});

export const MAIL_ENDPOINT = 'https://api.resend.com/emails';
export const USER_AGENT = 'pointfinder-uptime-monitor/1';
export const SUBJECT_PREFIX = '[PointFinder uptime]';

export function checkIds() {
  return [
    ...PROBES.map((probe) => `probe:${probe.id}`),
    ...HOSTS.map((host) => `host:${host}`),
  ];
}
