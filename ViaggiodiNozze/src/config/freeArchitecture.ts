export const HOUNIAI_WORKER_URL = (import.meta.env.VITE_HOUNIAI_WORKER_URL || '').trim();
export const EXTERNAL_AI_ENABLED = /^https:\/\//.test(HOUNIAI_WORKER_URL);
export const BACKGROUND_PUSH_ENABLED = false;
export const CLOUDFLARE_AI_CONSENT_VERSION = 'cloudflare-workers-ai-v1';

const CLOUDFLARE_AI_CONSENT_KEY = 'hounigo_cloudflare_ai_consent';

export function hasCloudflareAiConsent(): boolean {
  return typeof localStorage !== 'undefined'
    && localStorage.getItem(CLOUDFLARE_AI_CONSENT_KEY) === CLOUDFLARE_AI_CONSENT_VERSION;
}

export function grantCloudflareAiConsent(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CLOUDFLARE_AI_CONSENT_KEY, CLOUDFLARE_AI_CONSENT_VERSION);
  }
}

export const PRIVATE_AI_DISABLED_MESSAGE =
  'HouniAI non è disponibile in questo momento. Usa le schede manuali: testo e allegati restano sul dispositivo.';

export const BACKGROUND_PUSH_DISABLED_MESSAGE =
  'Gli avvisi nell’app restano disponibili. Le notifiche in background saranno disponibili dopo la configurazione di un servizio gratuito e affidabile.';
