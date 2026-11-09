import releaseHistory from '../data/releaseHistory.json';

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
export const COMMIT_HASH = typeof __COMMIT_HASH__ === 'string' ? __COMMIT_HASH__ : 'unknown';

export interface ReleaseHistoryItem {
  version: string;
  publishedAt: string;
  publishedAtIso?: string;
  sourceCommit: string;
  changes: string[];
}

/**
 * Formatta la data e l'ora effettiva di pubblicazione nel fuso locale dell'utente.
 * Es. "09/11/2026, 11:19" oppure "09/11/2026" se l'orario non è disponibile.
 */
export function formatReleaseTimestamp(isoOrDate?: string): string {
  if (!isoOrDate) return '';
  const date = new Date(isoOrDate.includes('T') ? isoOrDate : `${isoOrDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoOrDate;

  if (!isoOrDate.includes('T')) {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

const currentRelease = (releaseHistory.releases as ReleaseHistoryItem[]).find(
  (r) => r.version === APP_VERSION
) || (releaseHistory.releases as ReleaseHistoryItem[])[0];

export const RELEASE_TIMESTAMP_ISO = currentRelease?.publishedAtIso || currentRelease?.publishedAt || '';
export const FORMATTED_RELEASE_TIME = formatReleaseTimestamp(RELEASE_TIMESTAMP_ISO);
