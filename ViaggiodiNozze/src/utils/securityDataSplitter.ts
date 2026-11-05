import type { PrivateCredentials } from '../types';

/**
 * Censimento esaustivo di tutte le chiavi contenenti dati sensibili o credenziali riservate.
 * Include alias storici, codici prenotazione, chiavi keybox, allegati privati e note copilota.
 */
export const SENSITIVE_KEYS = [
  // 1. Credenziali e codici accesso
  'pinCode',
  'codiceAccesso',
  'keyboxCode',
  'bookingCode',
  'pnr',
  'codicePrenotazione',
  'conferma',
  'bookingReference',
  'ticketUrl',
  'voucherUrl',
  'bookingUrl',
  'linkPrenotazione',
  'qrCode',
  'qr',
  'tavolo',
  'posti',
  'terminalGate',

  // 2. Dati finanziari, spese e pagamenti
  'cost',
  'costo',
  'budget',
  'deposit',
  'depositPaid',
  'acconto',
  'cauzione',
  'amountPaid',
  'paymentStatus',

  // 3. Note e comunicazioni riservate
  'noteCopilota',
  'copilota',
  'cancellazioneGratuitaEntro',

  // 4. Allegati riservati (PDF carte d'imbarco, voucher, passaporti)
  'attachments'
] as const;

export type SensitiveKey = typeof SENSITIVE_KEYS[number];

const SENSITIVE_SET = new Set<string>(SENSITIVE_KEYS);

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_SET.has(key);
}

/**
 * Verifica se un ruolo è considerato privilegiato (Owner o Copilota con accesso ai dati privati).
 */
export function isPrivilegedRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'copilota' || role === 'guida';
}

/**
 * Separa un record completo in due parti:
 * 1. publicDoc: documento condiviso con tutti i membri (inclusi i Viewer), rigorosamente ripulito da chiavi sensibili.
 * 2. privateCredentialsDoc: record per la sottocollezione protetta /trips/{tripId}/private_credentials/{id}.
 */
export function splitEntitySecurityData(
  entityType: 'alloggio' | 'trasporto' | 'attivita' | 'tappa' | 'ristorante' | 'shopping' | 'documento',
  tripId: string,
  fullData: Record<string, any>
): { publicDoc: Record<string, any>; privateCredentialsDoc: PrivateCredentials | null } {
  if (!fullData || typeof fullData !== 'object') {
    return { publicDoc: fullData, privateCredentialsDoc: null };
  }

  const publicDoc: Record<string, any> = {};
  const privateDoc: Record<string, any> = {
    id: fullData.id,
    tripId,
    entityType,
    updatedAt: fullData.updatedAt || Date.now()
  };

  let hasPrivateFields = false;

  for (const [key, value] of Object.entries(fullData)) {
    if (value === undefined) continue;

    if (SENSITIVE_SET.has(key)) {
      // Salva nel record privato se valorizzato
      if (value !== null && value !== '') {
        privateDoc[key] = value;
        hasPrivateFields = true;
      }
    } else {
      // Mantieni nel documento pubblico
      publicDoc[key] = value;
    }
  }

  // Segnaposto booleano non sensibile per indicare alla UI che esistono credenziali/allegati privati
  if (hasPrivateFields) {
    publicDoc.hasPrivateCredentials = true;
  } else {
    delete publicDoc.hasPrivateCredentials;
  }

  return {
    publicDoc,
    privateCredentialsDoc: hasPrivateFields ? (privateDoc as PrivateCredentials) : null
  };
}

/**
 * Fonde in memoria il documento pubblico e le credenziali private per i ruoli autorizzati (Owner / Copilota).
 */
export function mergeEntitySecurityData<T extends Record<string, any>>(
  publicDoc: T,
  privateCredentialsDoc: PrivateCredentials | null | undefined
): T {
  if (!publicDoc) return publicDoc;
  if (!privateCredentialsDoc) return { ...publicDoc };

  const merged = { ...publicDoc } as any;

  for (const key of SENSITIVE_KEYS) {
    if (key in privateCredentialsDoc && privateCredentialsDoc[key as keyof PrivateCredentials] !== undefined) {
      merged[key] = privateCredentialsDoc[key as keyof PrivateCredentials];
    }
  }

  return merged as T;
}

/**
 * Sanitizza un documento condiviso eliminando tassativamente ogni chiave sensibile.
 * Usato prima dell'invio a Firestore per garantire che nessun vecchio client reinserisca dati privati.
 */
export function sanitizePublicDocument<T extends Record<string, any>>(docData: T): T {
  if (!docData || typeof docData !== 'object') return docData;

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(docData)) {
    if (!SENSITIVE_SET.has(key)) {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
