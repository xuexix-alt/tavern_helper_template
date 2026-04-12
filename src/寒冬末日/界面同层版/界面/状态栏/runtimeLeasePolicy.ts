export const SAME_LAYER_RUNTIME_LEASE_PATH = 'stream_demo.runtime_lease';
export const SAME_LAYER_RUNTIME_LEASE_VERSION = 1;

// Keep the heartbeat short so a healthy same-layer session refreshes often.
export const SAME_LAYER_LEASE_HEARTBEAT_MS = 2_000;

// pagehide / quick iframe rebuilds may briefly suspend without restoring host visibility.
export const SAME_LAYER_LEASE_SUSPEND_GRACE_MS = 8_000;

// Beyond this point, the lease is considered stale and a later bootstrap may recover safely.
export const SAME_LAYER_LEASE_STALE_MS = 20_000;
