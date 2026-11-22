/**
 * HOUNIGO Shopping — bozza esclusivamente locale e opt-in dal form.
 * Non scrive Firestore, IndexedDB di dominio, SyncService o code di mutazione.
 * Non segnala mai una conferma cloud.
 */

export interface ShoppingDraftFields {
  sottocategoria: string;
  nome: string;
  scopo: string;
  data: string;
  orario: string;
  timeStatus: 'indicativo' | 'confermato';
  indirizzo: string;
  budget: string;
  link: string;
  noteCopilota: string;
  copilota: boolean;
}

export interface ShoppingDraftScope {
  tripId: string;
  // ID dell'editor (Auth uid), non del ruolo. Usare un ID stabile nel form.
  editorId: string;
  entityId: string; // per nuova card, chiave locale stabile, es. "new:2026-12-04"
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DraftOptions {
  storage?: KeyValueStorage;
  now?: number;
  // Versione sorgente del record condiviso, se disponibile.
  sourceUpdatedAt?: string | number | null;
}

type StoredDraft = {
  schema: 1;
  scope: ShoppingDraftScope;
  fields: ShoppingDraftFields;
  savedAt: number;
  sourceUpdatedAt: string | null;
};

export type DraftSaveResult =
  | { ok: true; status: 'bozza_sul_dispositivo' }
  | { ok: false; status: 'bozza_non_salvata'; reason: string };

export type DraftReadResult = {
  fields: ShoppingDraftFields;
  savedAt: number;
  conflict: boolean; // NON applicare automaticamente se il record nel frattempo è cambiato
};

const PREFIX = 'hounigo:shopping:draft:v1:';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES_APPROX = 60_000;

function activeStorage(options?: DraftOptions): KeyValueStorage | null {
  if (options?.storage) return options.storage;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function normalizeVersion(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

export function shoppingDraftKey(scope: ShoppingDraftScope): string {
  if (![scope.tripId, scope.editorId, scope.entityId].every(v => typeof v === 'string' && v.trim())) {
    throw new Error('Per la bozza Shopping servono viaggio, editor e card');
  }
  return PREFIX + [scope.tripId, scope.editorId, scope.entityId].map(encodeURIComponent).join(':');
}

export function writeShoppingDraft(scope: ShoppingDraftScope, fields: ShoppingDraftFields, options: DraftOptions = {}): DraftSaveResult {
  const storage = activeStorage(options);
  if (!storage) return { ok: false, status: 'bozza_non_salvata', reason: 'Archiviazione locale non disponibile' };
  try {
    const payload: StoredDraft = {
      schema: 1,
      scope,
      fields: { ...fields },
      savedAt: options.now ?? Date.now(),
      sourceUpdatedAt: normalizeVersion(options.sourceUpdatedAt)
    };
    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_BYTES_APPROX) {
      return { ok: false, status: 'bozza_non_salvata', reason: 'Bozza troppo grande per la memoria locale' };
    }
    // Scrittura sincrona: non c'è debounce che possa perdere gli ultimi tasti.
    storage.setItem(shoppingDraftKey(scope), serialized);
    return { ok: true, status: 'bozza_sul_dispositivo' };
  } catch {
    return { ok: false, status: 'bozza_non_salvata', reason: 'Impossibile salvare la bozza su questo dispositivo' };
  }
}

export function readShoppingDraft(scope: ShoppingDraftScope, options: DraftOptions = {}): DraftReadResult | null {
  const storage = activeStorage(options);
  if (!storage) return null;
  try {
    const key = shoppingDraftKey(scope);
    const raw = storage.getItem(key);
    if (!raw) return null;
    const record: StoredDraft = JSON.parse(raw);
    if (record?.schema !== 1 || !record.fields || record.scope?.tripId !== scope.tripId ||
      record.scope?.editorId !== scope.editorId || record.scope?.entityId !== scope.entityId ||
      typeof record.savedAt !== 'number') return null;
    const now = options.now ?? Date.now();
    if (record.savedAt > now + 60_000 || now - record.savedAt > TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    const currentVersion = normalizeVersion(options.sourceUpdatedAt);
    const conflict = record.sourceUpdatedAt !== currentVersion &&
      (record.sourceUpdatedAt !== null || currentVersion !== null);
    return { fields: { ...record.fields }, savedAt: record.savedAt, conflict };
  } catch {
    return null;
  }
}

export function clearShoppingDraft(scope: ShoppingDraftScope, options: DraftOptions = {}): boolean {
  const storage = activeStorage(options);
  if (!storage) return false;
  try {
    storage.removeItem(shoppingDraftKey(scope));
    return true;
  } catch {
    return false;
  }
}
