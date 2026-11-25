import type { LiveReplyTarget } from '../services/liveService';

export type LiveOfflineQueueKind = 'guest_message' | 'photo_comment' | 'diary_message';

export interface LiveOfflineQueueItem {
  id: string;
  kind: LiveOfflineQueueKind;
  tripId: string;
  uid: string;
  authorName: string;
  text: string;
  photoId?: string;
  locationName?: string;
  replyTo?: LiveReplyTarget | null;
  createdAt: number;
}

const LIVE_OFFLINE_QUEUE_KEY = 'hounigo_live_offline_queue_v1';
const inFlightFlushes = new Map<string, Promise<number>>();

function notifyQueueChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hounigo_live_offline_queue_changed'));
  }
}

function readAllQueue(): LiveOfflineQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LIVE_OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LiveOfflineQueueItem =>
        Boolean(item && typeof item.id === 'string' && typeof item.tripId === 'string' && typeof item.uid === 'string' && typeof item.text === 'string')
    );
  } catch {
    return [];
  }
}

function writeAllQueue(items: LiveOfflineQueueItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LIVE_OFFLINE_QUEUE_KEY, JSON.stringify(items.slice(-100)));
  } catch {}
  notifyQueueChanged();
}

export function loadLiveOfflineQueue(tripId?: string): LiveOfflineQueueItem[] {
  const all = readAllQueue();
  if (!tripId) return all;
  return all.filter(item => item.tripId === tripId);
}

export function createOfflineMutationId(prefix = 'off'): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${raw}`.slice(0, 48);
}

export function enqueueLiveOfflineItem(
  input: Omit<LiveOfflineQueueItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
): LiveOfflineQueueItem {
  const item: LiveOfflineQueueItem = {
    ...input,
    id: input.id || createOfflineMutationId('off'),
    createdAt: input.createdAt ?? Date.now(),
  };
  const all = readAllQueue();
  if (!all.some(existing => existing.id === item.id)) {
    all.push(item);
    writeAllQueue(all);
  }
  return item;
}

export function removeLiveOfflineItem(id: string): void {
  if (!id) return;
  const all = readAllQueue();
  const next = all.filter(item => item.id !== id);
  if (next.length !== all.length) {
    writeAllQueue(next);
  }
}

export async function flushLiveOfflineQueue(params: {
  tripId: string;
  currentUid: string | null | undefined;
  isOnline: boolean;
  verifyPermission: (tripId: string, uid: string) => Promise<boolean>;
  sendItem: (item: LiveOfflineQueueItem) => Promise<void>;
}): Promise<number> {
  const { tripId, currentUid, isOnline, verifyPermission, sendItem } = params;
  if (!tripId || !currentUid || !isOnline) return 0;

  const existingFlush = inFlightFlushes.get(tripId);
  if (existingFlush) return existingFlush;

  const run = (async () => {
    const pending = loadLiveOfflineQueue(tripId).filter(item => item.uid === currentUid);
    if (pending.length === 0) return 0;

    let allowed = false;
    try {
      allowed = await verifyPermission(tripId, currentUid);
    } catch {
      return 0;
    }

    if (!allowed) {
      // Permessi revocati: rimuovi elementi dell'utente non più autorizzato senza inviarli
      const remaining = readAllQueue().filter(item => !(item.tripId === tripId && item.uid === currentUid));
      writeAllQueue(remaining);
      return 0;
    }

    let sentCount = 0;
    for (const item of pending) {
      // Verifica che l'elemento non sia stato annullato nel frattempo
      const stillPresent = readAllQueue().some(q => q.id === item.id);
      if (!stillPresent) continue;
      try {
        await sendItem(item);
        removeLiveOfflineItem(item.id);
        sentCount += 1;
      } catch {
        // Conserva l'elemento in coda per il prossimo tentativo online
        break;
      }
    }
    return sentCount;
  })().finally(() => {
    inFlightFlushes.delete(tripId);
  });

  inFlightFlushes.set(tripId, run);
  return run;
}
