import dns from 'dns/promises';

let online = true;

export function isOnline(): boolean {
  return online;
}

async function check(): Promise<void> {
  try {
    await dns.lookup('www.youtube.com');
    online = true;
  } catch {
    online = false;
  }
}

/** Periodically probes whether this server can reach the internet at all. */
export function startConnectivityMonitor(): void {
  check();
  setInterval(check, 60_000);
}
