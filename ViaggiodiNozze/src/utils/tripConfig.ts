export interface TripConfig {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays?: number;
  ownerUid?: string; // UID del creatore per sicurezza Firestore
  ownerName?: string; // Nome visualizzato del proprietario del viaggio
  headerImageUrl?: string | null;
  budgetConfig?: Record<string, any>;
  infoAltro?: {
    assicurazione?: string;
    numeriEmergenza?: string;
    noteViaggio?: string;
    [key: string]: any;
  };
}

const CONFIG_KEY = 'roadbook_trip_config';
const MASTER_TRIP_ID = '0000';
const MASTER_TRIP_START_DATE = '2026-11-28';
const MASTER_TRIP_END_DATE = '2027-01-10';
const MASTER_TRIP_TOTAL_DAYS = 44;

export function normalizeTripConfig(config: TripConfig): TripConfig {
  const normalized = { ...config };

  if (normalized.id === 'default') {
    normalized.id = MASTER_TRIP_ID;
  }

  if (normalized.id === MASTER_TRIP_ID) {
    normalized.title = normalized.title || 'Viaggio Originale';
    normalized.startDate = normalized.startDate || MASTER_TRIP_START_DATE;
    normalized.endDate = normalized.endDate || MASTER_TRIP_END_DATE;
    normalized.totalDays = normalized.totalDays || MASTER_TRIP_TOTAL_DAYS;
    normalized.ownerName = normalized.ownerName || 'Owner';
    // ownerUid non è hardcoded: proviene dal documento Firestore attendibile
    return normalized;
  }

  return normalized;
}

export function getTripConfig(): TripConfig | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(CONFIG_KEY);
  if (stored) {
    try {
      const rawConfig = JSON.parse(stored) as TripConfig;
      const config = normalizeTripConfig(rawConfig);

      if (JSON.stringify(config) !== JSON.stringify(rawConfig)) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      }
      
      return config;
    } catch (e) {
      console.error('Invalid trip config', e);
      return null;
    }
  }
  return null;
}

export const KNOWN_TRIPS_KEY = 'hounigo_known_trip_ids';

export function getKnownTripIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KNOWN_TRIPS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function addKnownTripId(tripId: string): void {
  if (!tripId || typeof localStorage === 'undefined') return;
  const clean = tripId.trim();
  if (!clean) return;
  try {
    const list = getKnownTripIds();
    if (!list.includes(clean)) {
      list.push(clean);
      localStorage.setItem(KNOWN_TRIPS_KEY, JSON.stringify(list));
    }
  } catch {}
}

export function saveTripConfig(config: TripConfig): void {
  if (typeof localStorage === 'undefined') return;
  const oldStored = localStorage.getItem(CONFIG_KEY);
  let oldId: string | null = null;
  if (oldStored) {
    try {
      oldId = JSON.parse(oldStored)?.id;
    } catch {}
  }

  const normalized = normalizeTripConfig(config);
  localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  addKnownTripId(normalized.id);
  
  if (oldId && oldId !== normalized.id) {
    import('../storage/indexedDB').then(({ closeAndResetDatabases }) => {
      closeAndResetDatabases().catch(() => {});
    });
  }

  import('../storage/indexedDB').then(({ idbPut }) => {
    idbPut('settings', { id: 'trip_config_backup', value: normalized }).catch(() => {});
  });
  
  // Dispatch event so App.tsx and views can re-render if needed
  window.dispatchEvent(new Event('trip_config_changed'));
  window.dispatchEvent(new Event('roadbook_trips_updated'));
}

export function clearTripConfig(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(CONFIG_KEY);
  import('../storage/indexedDB').then(({ closeAndResetDatabases }) => {
    closeAndResetDatabases().catch(() => {});
  });
  window.dispatchEvent(new Event('trip_config_changed'));
  window.dispatchEvent(new Event('roadbook_trips_updated'));
}
