import { auth } from '../firebase';
import {
  CLOUDFLARE_AI_CONSENT_VERSION,
  HOUNIAI_WORKER_URL,
  PRIVATE_AI_DISABLED_MESSAGE,
  hasCloudflareAiConsent,
} from '../config/freeArchitecture';
import { getTripConfig } from '../utils/tripConfig';

function friendlyWorkerError(status: number, message?: string): string {
  if (status === 401) return 'Sessione scaduta. Accedi di nuovo prima di usare HouniAI.';
  if (status === 403) return 'HouniAI è disponibile soltanto per Owner e Copilota autorizzati.';
  if (status === 413) return message || 'Il contenuto è troppo grande per l’analisi gratuita.';
  if (status === 428) return 'Leggi e accetta l’informativa Cloudflare prima dell’invio.';
  if (status === 429) return 'Quota gratuita HouniAI raggiunta. Continua manualmente e riprova domani.';
  return message || PRIVATE_AI_DISABLED_MESSAGE;
}

export async function callHouniAi(requestBody: unknown): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
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
    if (!response.ok) return { ok: false, error: friendlyWorkerError(response.status, payload?.error) };
    return typeof payload?.text === 'string' && payload.text
      ? { ok: true, text: payload.text }
      : { ok: false, error: 'HouniAI ha restituito una risposta incompleta. Continua manualmente.' };
  } catch {
    return { ok: false, error: PRIVATE_AI_DISABLED_MESSAGE };
  }
}
