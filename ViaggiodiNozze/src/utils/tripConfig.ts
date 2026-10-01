export interface TripConfig {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

const CONFIG_KEY = 'roadbook_trip_config';

export function getTripConfig(): TripConfig | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(CONFIG_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as TripConfig;
    } catch (e) {
      console.error('Invalid trip config', e);
      return null;
    }
  }
  return null;
}

export function saveTripConfig(config: TripConfig): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  // Dispatch event so App.tsx can re-render if needed
  window.dispatchEvent(new Event('trip_config_changed'));
}

export function clearTripConfig(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(CONFIG_KEY);
  window.dispatchEvent(new Event('trip_config_changed'));
}
