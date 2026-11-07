/**
 * features/push/pendingDeletion.ts — the offline-logout ledger (frozen
 * matrix "Shared phone": "offline logout: deletion retried on next start").
 *
 * An explicit logout must never block on the network, so the backend
 * DELETE for the device token is fire-and-forget — and when it fails
 * (offline, timeout), one slot in MMKV remembers { token, bearer } so the
 * NEXT app start retries it before any new token is registered. The bearer
 * is captured at logout time (the session is about to be cleared — the
 * next start has no session to authenticate the DELETE with, and the
 * endpoint requires the registering user's JWT).
 *
 * Single slot on purpose: a token that never gets its DELETE through is
 * superseded by the next logout attempt on the same device, and any
 * still-lingering row ages out via the backend's 90-day `last_seen_at`
 * prune. The bearer is a session secret, but it is dead by the time it is
 * stored (logout just invalidated it server-side) — it exists only so the
 * retry can authenticate the delete of THIS user's row.
 */
import { storage } from '../../services/storage';

const KEY = 'fenzit.push.pendingTokenDeletion';

interface PendingDeletion {
  token: string;
  bearer: string;
}

/** Remembers a failed logout deletion (overwrites any older one). */
export function savePendingDeletion(token: string, bearer: string): void {
  storage.set(KEY, JSON.stringify({ token, bearer } satisfies PendingDeletion));
}

/** The pending deletion is resolved (or superseded) — drop it. */
export function clearPendingDeletion(): void {
  storage.remove(KEY);
}

/** The remembered deletion, or null when none is pending / it is malformed. */
export function readPendingDeletion(): PendingDeletion | null {
  const raw = storage.getString(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingDeletion>;
    if (typeof parsed.token === 'string' && typeof parsed.bearer === 'string') {
      return { token: parsed.token, bearer: parsed.bearer };
    }
  } catch (err) {
    console.warn('[push] unreadable pending deletion — dropping:', err);
  }
  clearPendingDeletion();
  return null;
}
