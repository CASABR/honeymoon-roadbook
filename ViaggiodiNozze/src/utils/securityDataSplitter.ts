import type { PrivateCredentials } from '../types';

/**
 * Censimento esaustivo di tutte le chiavi contenenti dati sensibili o credenziali riservate.
 * Include alias storici, codici prenotazione, chiavi keybox, allegati privati e note copilota.
 */
export const SENSITIVE_KEYS = [
  // 1. Credenziali e codici accesso (inclusi alias storici)
  'pinCode',
  'pin',
  'codiceAccesso',
  'keyboxCode',
  'keybox',
  'bookingCode',
  'pnr',
  'codicePrenotazione',
  'conferma',
  'bookingReference',
  'ticketNumber',
  'ticketUrl',
  'voucherUrl',
  'bookingUrl',
  'linkPrenotazione',
  'qrCode',
  'qr',
  'tavolo',
  'posti',
  'postiASedere',
  'seat',
  'terminalGate',
  'gate',

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

export function normalizeEntityType(name: string): string {
  switch (name) {
    case 'alloggi':
    case 'alloggio': return 'alloggio';
    case 'trasporti':
    case 'trasporto': return 'trasporto';
    case 'attivita':
    case 'activity': return 'attivita';
    case 'tappe':
    case 'tappa': return 'tappa';
    case 'ristoranti':
    case 'ristorante': return 'ristorante';
    case 'shopping': return 'shopping';
    case 'documenti':
    case 'documento': return 'documento';
    case 'spese':
    case 'spesa': return 'spesa';
    default: return name;
  }
}

/**
 * Calcola l'ID univoco per la cassaforte private_credentials con prefisso anti-collisione.
 * Evita sovrascritture tra entità di categorie diverse aventi il medesimo ID (es. alloggio '1' vs attivita '1').
 */
export function getVaultDocId(entityType: string, entityId: string): string {
  if (!entityId) return '';
  const normType = normalizeEntityType(entityType);
  if (entityId.startsWith(`${normType}_`)) return entityId;
  return `${normType}_${entityId}`;
}

/**
 * Verifica se un ruolo è considerato privilegiato (Owner o Copilota con accesso ai dati privati).
 */
export function isPrivilegedRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'copilota' || role === 'guida';
}

/**
 * Separa un record completo in due parti:
 * 1. publicDoc: documento condiviso con tutti i membri (inclusi i Viewer), rigorosamente ripulito da chiavi sensibili (anche annidate).
 * 2. privateCredentialsDoc: record per la sottocollezione protetta /trips/{tripId}/private_credentials/{vaultId}.
 */
export function splitEntitySecurityData(
  entityType: 'alloggio' | 'trasporto' | 'attivita' | 'tappa' | 'ristorante' | 'shopping' | 'documento',
  tripId: string,
  fullData: Record<string, any>
): { publicDoc: Record<string, any>; privateCredentialsDoc: PrivateCredentials | null } {
  if (!fullData || typeof fullData !== 'object') {
    return { publicDoc: fullData, privateCredentialsDoc: null };
  }

  const vaultId = getVaultDocId(entityType, fullData.id);
  const publicDoc: Record<string, any> = {};
  const privateDoc: Record<string, any> = {
    id: vaultId,
    entityId: fullData.id,
    tripId,
    entityType,
    updatedAt: fullData.updatedAt || Date.now()
  };

  let hasPrivateFields = false;

  for (const [key, value] of Object.entries(fullData)) {
    if (value === undefined) continue;

    if (SENSITIVE_SET.has(key)) {
      if (value !== null && value !== '') {
        privateDoc[key] = value;
        hasPrivateFields = true;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Per oggetti annidati, sanitizza ricorsivamente per impedire leak annidati
      publicDoc[key] = sanitizePublicDocument(value);
    } else {
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
 * Supporta sia ID prefissati con anti-collisione sia ID storici.
 */
export function mergeEntitySecurityData<T extends Record<string, any>>(
  publicDoc: T,
  privateCredentialsDoc: PrivateCredentials | null | undefined
): T {
  if (!publicDoc) return publicDoc;
  if (!privateCredentialsDoc) return { ...publicDoc };

  const merged = { ...publicDoc } as any;

  for (const key of SENSITIVE_KEYS) {
    if (key in privateCredentialsDoc && (privateCredentialsDoc as any)[key] !== undefined) {
      merged[key] = (privateCredentialsDoc as any)[key];
    }
  }

  return merged as T;
}

/**
 * Sanitizza un documento condiviso eliminando tassativamente ogni chiave sensibile (anche ricorsivamente).
 * Usato prima dell'invio a Firestore per garantire che nessun vecchio client reinserisca dati privati.
 */
export function sanitizePublicDocument<T extends Record<string, any>>(docData: T): T {
  if (!docData || typeof docData !== 'object') return docData;
  if (Array.isArray(docData)) {
    return docData.map(item => (typeof item === 'object' && item !== null ? sanitizePublicDocument(item) : item)) as any;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(docData)) {
    if (!SENSITIVE_SET.has(key)) {
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizePublicDocument(value);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized as T;
}
