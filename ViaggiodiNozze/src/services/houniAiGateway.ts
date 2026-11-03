import { auth } from '../firebase';
import {
  CLOUDFLARE_AI_CONSENT_VERSION,
  HOUNIAI_WORKER_URL,
  PRIVATE_AI_DISABLED_MESSAGE,
  hasCloudflareAiConsent,
} from '../config/freeArchitecture';
import { getTripConfig } from '../utils/tripConfig';

export const MAX_HOUNIAI_UID_REQUESTS_PER_DAY = 30;
export const MAX_HOUNIAI_GLOBAL_REQUESTS_PER_DAY = 150;
export const MAX_HOUNIAI_UID_REQUESTS_PER_MINUTE = 6;

const HOUNIAI_QUOTA_STORAGE_KEY = 'houniai_quota_state';

export interface HouniAiQuotaState {
  remainingToday: number;
  maxDaily: number;
  resetAtUtc: string;
  reason?: 'daily_user_limit' | 'daily_global_limit' | 'rate_limited_minute' | string;
  retryAfterSeconds?: number;
  blockedUntil?: number;
  lastUpdated: number;
  isSharedLimitReached?: boolean;
}

export function getNextMidnightUtcIso(): string {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
  return next.toISOString();
}

export function getStoredHouniAiQuota(): HouniAiQuotaState {
  if (typeof localStorage === 'undefined') {
    return {
      remainingToday: MAX_HOUNIAI_UID_REQUESTS_PER_DAY,
      maxDaily: MAX_HOUNIAI_UID_REQUESTS_PER_DAY,
      resetAtUtc: getNextMidnightUtcIso(),
      lastUpdated: Date.now()
    };
  }

  try {
    const raw = localStorage.getItem(HOUNIAI_QUOTA_STORAGE_KEY);
    if (raw) {
      const parsed: HouniAiQuotaState = JSON.parse(raw);
      if (parsed.resetAtUtc && Date.now() >= new Date(parsed.resetAtUtc).getTime()) {
        const refreshed: HouniAiQuotaState = {
          remainingToday: MAX_HOUNIAI_UID_REQUESTS_PER_DAY,
          maxDaily: MAX_HOUNIAI_UID_REQUESTS_PER_DAY,
          resetAtUtc: getNextMidnightUtcIso(),
          lastUpdated: Date.now()
        };
        localStorage.setItem(HOUNIAI_QUOTA_STORAGE_KEY, JSON.stringify(refreshed));
        return refreshed;
      }
      return parsed;
    }
  } catch {}

  const defaultState: HouniAiQuotaState = {
    remainingToday: MAX_HOUNIAI_UID_REQUESTS_PER_DAY,
    maxDaily: MAX_HOUNIAI_UID_REQUESTS_PER_DAY,
    resetAtUtc: getNextMidnightUtcIso(),
    lastUpdated: Date.now()
  };
  try {
    localStorage.setItem(HOUNIAI_QUOTA_STORAGE_KEY, JSON.stringify(defaultState));
  } catch {}
  return defaultState;
}

export function saveHouniAiQuota(updates: Partial<HouniAiQuotaState>): HouniAiQuotaState {
  const current = getStoredHouniAiQuota();
  const next: HouniAiQuotaState = {
    ...current,
    ...updates,
    lastUpdated: Date.now()
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(HOUNIAI_QUOTA_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('houniai_quota_updated', { detail: next }));
  }
  return next;
}

export function formatQuotaCountdown(resetAtUtc: string): string {
  try {
    const resetMs = new Date(resetAtUtc).getTime();
    const diffMs = Math.max(0, resetMs - Date.now());
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  } catch {
    return '00h 00m';
  }
}

export function formatLocalResetTime(resetAtUtc: string): string {
  try {
    return new Date(resetAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  } catch {
    return '00:00 UTC';
  }
}

function friendlyWorkerError(status: number, message?: string, payload?: any): string {
  if (status === 401) return 'Sessione scaduta. Accedi di nuovo prima di usare HouniAI.';
  if (status === 403) return 'HouniAI è disponibile soltanto per Owner e Copilota autorizzati.';
  if (status === 413) return message || 'Il contenuto è troppo grande per l’analisi gratuita.';
  if (status === 428) return 'Leggi e accetta l’informativa Cloudflare prima dell’invio.';
  if (status === 429) {
    if (payload?.reason === 'rate_limited_minute') {
      return payload.error || 'Troppe richieste ravvicinate. Attendi 30 secondi prima di riprovare.';
    }
    if (payload?.reason === 'daily_global_limit') {
      return payload.error || 'Disponibilità globale condivisa esaurita per oggi. Reset alle 00:00 UTC.';
    }
    return payload?.error || `Quota giornaliera HouniAI raggiunta (${MAX_HOUNIAI_UID_REQUESTS_PER_DAY}/${MAX_HOUNIAI_UID_REQUESTS_PER_DAY}). Reset alle 00:00 UTC.`;
  }
  return message || PRIVATE_AI_DISABLED_MESSAGE;
}

export async function callHouniAi(requestBody: unknown): Promise<{
  ok: true;
  text: string;
  remainingToday?: number;
  resetAtUtc?: string;
} | {
  ok: false;
  error: string;
  reason?: string;
  retryAfter?: number;
}> {
  if (!HOUNIAI_WORKER_URL) return { ok: false, error: PRIVATE_AI_DISABLED_MESSAGE };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, error: 'Sei offline. Continua con l’inserimento manuale.' };
  }
  if (!hasCloudflareAiConsent()) {
    return { ok: false, error: 'Leggi e accetta l’informativa Cloudflare prima dell’invio.' };
  }
  const currentUser = auth?.currentUser;
  const tripId = getTripConfig()?.id;
  if (!currentUser || !tripId) return { ok: false, error: 'Accedi a un viaggio autorizzato prima di usare HouniAI.' };

  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(HOUNIAI_WORKER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tripId, consentVersion: CLOUDFLARE_AI_CONSENT_VERSION, requestBody }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) {
        if (payload?.reason === 'rate_limited_minute') {
          const retryAfter = Number(payload?.retryAfter) || 30;
          saveHouniAiQuota({
            reason: 'rate_limited_minute',
            retryAfterSeconds: retryAfter,
            blockedUntil: Date.now() + (retryAfter * 1000)
          });
        } else if (payload?.reason === 'daily_user_limit') {
          saveHouniAiQuota({
            remainingToday: 0,
            resetAtUtc: payload?.resetAtUtc || getNextMidnightUtcIso(),
            reason: 'daily_user_limit',
            isSharedLimitReached: false
          });
        } else if (payload?.reason === 'daily_global_limit') {
          saveHouniAiQuota({
            resetAtUtc: payload?.resetAtUtc || getNextMidnightUtcIso(),
            reason: 'daily_global_limit',
            isSharedLimitReached: true
          });
        }
      }
      return {
        ok: false,
        error: friendlyWorkerError(response.status, payload?.error, payload),
        reason: payload?.reason,
        retryAfter: payload?.retryAfter
      };
    }

    if (typeof payload?.text === 'string' && payload.text) {
      saveHouniAiQuota({
        remainingToday: typeof payload?.remainingToday === 'number' ? payload.remainingToday : undefined,
        resetAtUtc: payload?.resetAtUtc || getNextMidnightUtcIso(),
        reason: undefined,
        blockedUntil: undefined,
        isSharedLimitReached: false
      });
      return {
        ok: true,
        text: payload.text,
        remainingToday: payload?.remainingToday,
        resetAtUtc: payload?.resetAtUtc
      };
    }
    return { ok: false, error: 'HouniAI ha restituito una risposta incompleta. Continua manualmente.' };
  } catch {
    return { ok: false, error: PRIVATE_AI_DISABLED_MESSAGE };
  }
}
