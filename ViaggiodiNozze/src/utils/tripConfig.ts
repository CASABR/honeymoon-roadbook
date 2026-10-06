export interface TripConfig {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays?: number;
  ownerUid?: string; // UID del creatore per sicurezza Firestore
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
    normalized.startDate = MASTER_TRIP_START_DATE;
    normalized.endDate = MASTER_TRIP_END_DATE;
    normalized.totalDays = MASTER_TRIP_TOTAL_DAYS;
    return normalized;
  }

  if (normalized.startDate === '2026-01-01') {
    normalized.startDate = MASTER_TRIP_START_DATE;
  }
  if (normalized.endDate === '2026-12-31') {
    normalized.endDate = MASTER_TRIP_END_DATE;
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

export function saveTripConfig(config: TripConfig): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(normalizeTripConfig(config)));
  // Dispatch event so App.tsx can re-render if needed
  window.dispatchEvent(new Event('trip_config_changed'));
}

export function clearTripConfig(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(CONFIG_KEY);
  window.dispatchEvent(new Event('trip_config_changed'));
}
