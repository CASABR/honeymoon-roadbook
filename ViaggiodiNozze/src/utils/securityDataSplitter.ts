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
  'budgetConfig',
  'deposit',
  'depositPaid',
  'acconto',
  'cauzione',
  'amountPaid',
  'amount',
  'paymentStatus',
  'originalCurrency',
  'originalCost',
  'originalDepositPaid',
  'originalDepositCurrency',
  'depositExchangeRate',
  'depositExchangeRateDate',
  'depositExchangeRateSource',
  'originalRemaining',
  'originalCauzione',
  'originalCauzioneCurrency',
  'exchangeRate',
  'exchangeRateDate',
  'exchangeRateSource',
  'conversionType',
  'depositConversionType',
  'convertedAt',
  'currencyUncertain',
  'privateNested',

  // 3. Note e comunicazioni riservate
  'noteCopilota',
  'copilota',
  'cancellazioneGratuitaEntro',

  // 4. Allegati riservati (PDF carte d'imbarco, voucher, passaporti)
  'attachments'
] as const;

export type SensitiveKey = typeof SENSITIVE_KEYS[number];

const SENSITIVE_SET = new Set<string>(SENSITIVE_KEYS);

// BEGIN GENERATED PUBLIC SCHEMAS
export const PUBLIC_DATA_SCHEMAS: Record<string, string[]> = {
  "giorni": [
    "_enriched",
    "address",
    "category",
    "completed",
    "coordinate",
    "createdAt",
    "data",
    "date",
    "dayId",
    "deleted",
    "deletedAt",
    "deletedBy",
    "hasPrivateCredentials",
    "id",
    "indirizzo",
    "lastSanitizedAt",
    "location",
    "name",
    "nome",
    "nota",
    "notes",
    "orario",
    "publicSchemaVersion",
    "sottocategoria",
    "status",
    "time",
    "timeStatus",
    "title",
    "titolo",
    "updatedAt"
  ],
  "tappe": [
    "_enriched",
    "address",
    "category",
    "completed",
    "coordinate",
    "createdAt",
    "data",
    "date",
    "dayId",
    "deleted",
    "deletedAt",
    "deletedBy",
    "hasPrivateCredentials",
    "id",
    "indirizzo",
    "lastSanitizedAt",
    "lightWindow",
    "link",
    "linkedBookingId",
    "linkedDocumentId",
    "linkedDocumentIds",
    "location",
    "mapsUrl",
    "mostraNoteInCard",
    "name",
    "nome",
    "nota",
    "notes",
    "openingHours",
    "orario",
    "order",
    "passeggiataId",
    "photoSubject",
    "publicDocumentIds",
    "publicSchemaVersion",
    "sottocategoria",
    "status",
    "time",
    "timeStatus",
    "title",
    "titolo",
    "updatedAt"
  ],
  "attivita": [
    "_enriched",
    "address",
    "category",
    "childTappe",
    "completed",
    "coordinate",
    "createdAt",
    "currency",
    "data",
    "date",
    "dayId",
    "deleted",
    "deletedAt",
    "deletedBy",
    "destinationLocation",
    "difficulty",
    "distanceKm",
    "duration",
    "elevationGainM",
    "endDate",
    "googleMapsUrl",
    "hasPrivateCredentials",
    "hikingDurationMinutes",
    "id",
    "indirizzo",
    "isRoute",
    "lastSanitizedAt",
    "lightWindow",
    "link",
    "location",
    "mapsUrl",
    "mostraNoteInCard",
    "name",
    "nome",
    "nota",
    "notes",
    "openingHours",
    "orario",
    "orarioInizio",
    "orarioRitrovo",
    "order",
    "originLocation",
    "photoSubject",
    "platform",
    "publicSchemaVersion",
    "routePreview",
    "routeType",
    "sottocategoria",
    "status",
    "time",
    "timeStatus",
    "timeZone",
    "title",
    "titolo",
    "updatedAt"
  ],
  "alloggi": [
    "_enriched",
    "address",
    "arrivalTime",
    "category",
    "checkIn",
    "checkInAt",
    "checkInDone",
    "checkInTime",
    "checkOut",
    "checkOutAt",
    "checkOutDone",
    "checkOutTime",
    "completed",
    "coordinate",
    "createdAt",
    "data",
    "date",
    "dayId",
    "deleted",
    "deletedAt",
    "deletedBy",
    "hasPrivateCredentials",
    "id",
    "indirizzo",
    "lastSanitizedAt",
    "location",
    "mostraNoteInCard",
    "name",
    "nome",
    "nota",
    "notes",
    "orario",
    "phone",
    "publicSchemaVersion",
    "sottocategoria",
    "status",
    "time",
    "timeStatus",
    "timeZone",
    "title",
    "titolo",
    "updatedAt"
  ],
  "trasporti": [
    "_enriched",
    "address",
    "arrivalDate",
    "arrivalIata",
    "arrivalLocation",
    "arrivalTime",
    "bagagli",
    "carrier",
    "category",
    "checkInAt",
    "checkInDone",
    "checkinCutoff",
    "completed",
    "coordinate",
    "createdAt",
    "data",
    "date",
    "dayId",
    "deleted",
    "deletedAt",
    "deletedBy",
    "departureIata",
    "departureLocation",
    "departureTime",
    "departureTimeZone",
    "dropoffAt",
    "dropoffCoordinate",
    "dropoffDate",
    "dropoffDone",
    "dropoffLocation",
    "dropoffTime",
    "dropoffTimeZone",
    "hasPrivateCredentials",
    "id",
    "indirizzo",
    "lastSanitizedAt",
    "layover",
    "location",
    "mostraNoteInCard",
    "name",
    "nome",
    "nota",
    "notes",
    "orario",
    "packageIncluded",
    "publicSchemaVersion",
    "sottocategoria",
    "status",
    "time",
    "timeStatus",
    "title",
    "titolo",
    "type",
    "updatedAt"
  ],
  "ristoranti": [
    "_enriched",
    "address",
    "category",
    "completed",
    "coordinate",
    "createdAt",
    "data",
    "date",
    "dayId",
    "deleted",
    "deletedAt",
    "deletedBy",
    "hasPrivateCredentials",
    "id",
    "indirizzo",
    "lastSanitizedAt",
    "location",
    "mostraNoteInCard",
    "name",
    "nome",
    "nota",
    "notes",
    "orario",
    "publicSchemaVersion",
    "sottocategoria",
    "status",
    "telefono",
    "time",
    "timeStatus",
    "title",
    "titolo",
    "updatedAt"
  ],
  "shopping": [
    "_enriched",
    "address",
    "category",
    "completed",
    "coordinate",
    "createdAt",
    "data",
    "date",
    "dayId",
    "deleted",
    "deletedAt",
    "deletedBy",
    "hasPrivateCredentials",
    "id",
    "indirizzo",
    "lastSanitizedAt",
    "link",
    "location",
    "name",
    "nome",
    "nota",
    "notes",
    "orario",
    "publicSchemaVersion",
    "scopo",
    "sottocategoria",
    "status",
    "time",
    "timeStatus",
    "title",
    "titolo",
    "updatedAt"
  ],
  "bagagli": [
    "_enriched",
    "address",
    "category",
    "completed",
    "coordinate",
    "createdAt",
    "data",
    "date",
    "dayId",
    "deleted",
    "deletedAt",
    "deletedBy",
    "descrizione",
    "hasPrivateCredentials",
    "id",
    "indirizzo",
    "lastSanitizedAt",
    "location",
    "name",
    "nome",
    "nota",
    "note",
    "notes",
    "orario",
    "passeggero",
    "pesoKg",
    "publicSchemaVersion",
    "sottocategoria",
    "status",
    "time",
    "timeStatus",
    "tipo",
    "title",
    "titolo",
    "updatedAt",
    "verificato",
    "voloId",
    "voloTitle"
  ]
};
// END GENERATED PUBLIC SCHEMAS

function privateTree(value: any): any {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    const entries = value.map(item => privateTree(item) ?? null);
    return entries.some(item => item !== null) ? entries : undefined;
  }
  const entries: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    const secret = SENSITIVE_SET.has(key) ? child : privateTree(child);
    if (secret !== undefined) entries[key] = secret;
  }
  return Object.keys(entries).length ? entries : undefined;
}

function restorePrivateTree(publicValue: any, secrets: any): any {
  if (secrets === undefined) return publicValue;
  if (secrets === null || typeof secrets !== 'object') return secrets;
  if (Object.prototype.hasOwnProperty.call(secrets, '__hounigoOpaqueValue')) return secrets.__hounigoOpaqueValue;
  if (Array.isArray(secrets)) {
    const result = Array.isArray(publicValue) ? [...publicValue] : [];
    secrets.forEach((entry, index) => {
      if (entry !== null) result[index] = restorePrivateTree(result[index], entry);
    });
    return result;
  }
  const result = { ...publicValue };
  for (const [key, value] of Object.entries(secrets)) {
    result[key] = SENSITIVE_SET.has(key) ? value : restorePrivateTree(result[key], value);
  }
  return result;
}

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

const PUBLIC_COLLECTIONS: Record<string, string> = {
    alloggio: 'alloggi', trasporto: 'trasporti', attivita: 'attivita', tappa: 'tappe',
    ristorante: 'ristoranti', shopping: 'shopping', giorni: 'giorni', giorno: 'giorni',
    bagaglio: 'bagagli', bagagli: 'bagagli',
};

const documentIdIsPublicReference = (value: any): boolean => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function publicValueIsSupported(key: string, value: any): boolean {
  if (key === 'linkedDocumentId') return value == null || documentIdIsPublicReference(value);
  if (key === 'linkedDocumentIds' || key === 'publicDocumentIds') {
    return value == null || (Array.isArray(value) && value.length <= 32 && value.every(documentIdIsPublicReference));
  }
  if (key === 'openingHours' && value != null) {
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = ['status', 'accessType', 'weekly', 'exceptions', 'source', 'verifiedAt', 'timeZone', 'notes'];
    if (!Object.keys(value).every(k => keys.includes(k))) return false;
    if (!['unverified', 'manual', 'verified'].includes(value.status) || !['unknown', 'attraction', 'outdoor'].includes(value.accessType)) return false;
    for (const field of ['weekly', 'exceptions']) {
      const map = value[field];
      if (map === undefined) continue;
      if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).length > 32) return false;
      if (!Object.entries(map).every(([k,v]) => (field === 'weekly' ? ['sun','mon','tue','wed','thu','fri','sat'].includes(k) : /^\d{4}-\d{2}-\d{2}$/.test(k)) && typeof v === 'string' && v.length <= 200)) return false;
    }
    return ['source', 'verifiedAt', 'timeZone', 'notes'].every(k => value[k] === undefined || (typeof value[k] === 'string' && value[k].length <= 2048));
  }
  if (key === 'layover' && value != null) {
    return typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([k,v]) =>
      ['airport','duration','arrivalTime','departureTime','departureDate','arrivalDate','carrier','notes'].includes(k) && typeof v === 'string');
  }
  if (value === null || value === undefined || typeof value !== 'object') return true;
  return /coordinate|coords/i.test(key) && !Array.isArray(value)
    && Object.keys(value).every(k => k === 'lat' || k === 'lng')
    && (value.lat === undefined || typeof value.lat === 'number')
    && (value.lng === undefined || typeof value.lng === 'number');
}

/** Only records matching the server schema may enter Viewer collection queries. */
export function stampPublicDocument(entityType: string, data: Record<string, any>): Record<string, any> {
  const allowed = PUBLIC_DATA_SCHEMAS[PUBLIC_COLLECTIONS[normalizeEntityType(entityType)]];
  if (!allowed) return data;
  const safe = Object.entries(data).every(([key, value]) => {
    if (!allowed.includes(key) || SENSITIVE_SET.has(key)) return false;
    return publicValueIsSupported(key, value);
  });
  // Explicit zero clears an old marker even when the caller uses merge:true.
  return { ...data, publicSchemaVersion: safe ? 2 : 0 };
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

  // Explicit publication classification, never inferred from the presence of a
  // document ID. References carry no URL, Storage path or access token.
  const publicDocumentIds = Array.isArray(fullData.publicDocumentIds)
    ? fullData.publicDocumentIds.filter(documentIdIsPublicReference).slice(0, 32) : [];

  for (const [key, value] of Object.entries(fullData)) {
    if (value === undefined) continue;

    if (key === 'linkedDocumentId' || key === 'linkedDocumentIds') {
      if (key === 'linkedDocumentId') {
        if (publicDocumentIds.includes(value)) {
          publicDoc[key] = value;
        } else if (value != null && value !== '') {
          privateDoc.privateNested ??= {};
          privateDoc.privateNested[key] = { __hounigoOpaqueValue: value };
          hasPrivateFields = true;
        }
      } else if (Array.isArray(value)) {
        const publicRefs = value.filter(id => publicDocumentIds.includes(id));
        const hasPrivateRefs = value.some(id => !publicDocumentIds.includes(id));
        if (publicRefs.length > 0 || value.length === 0) {
          publicDoc[key] = publicRefs;
        }
        if (hasPrivateRefs) {
          privateDoc.privateNested ??= {};
          privateDoc.privateNested[key] = { __hounigoOpaqueValue: value };
          hasPrivateFields = true;
        }
      } else if (value != null) {
        privateDoc.privateNested ??= {};
        privateDoc.privateNested[key] = { __hounigoOpaqueValue: value };
        hasPrivateFields = true;
      }
      continue;
    }

    if (SENSITIVE_SET.has(key)) {
      if (value !== '') {
        privateDoc[key] = value;
        hasPrivateFields = true;
      }
    } else if (typeof value === 'object' && value !== null) {
      // Per oggetti annidati, sanitizza ricorsivamente per impedire leak annidati
      publicDoc[key] = sanitizePublicDocument(value);
      const nested = privateTree(value);
      if (nested !== undefined) {
        privateDoc.privateNested ??= {};
        privateDoc.privateNested[key] = nested;
        hasPrivateFields = true;
      }
    } else {
      publicDoc[key] = value;
    }
  }

  // Preserve unknown/complex legacy fields in the editor-only vault rather than
  // withholding the entire itinerary row or publishing an unvalidated nested map.
  const allowed = PUBLIC_DATA_SCHEMAS[PUBLIC_COLLECTIONS[normalizeEntityType(entityType)]];
  if (allowed) {
    for (const [key, value] of Object.entries(publicDoc)) {
      if (!allowed.includes(key) || !publicValueIsSupported(key, value)) {
        privateDoc.privateNested ??= {};
        privateDoc.privateNested[key] = { __hounigoOpaqueValue: fullData[key] };
        hasPrivateFields = true;
        delete publicDoc[key];
      }
    }
  }

  // Segnaposto booleano non sensibile per indicare alla UI che esistono credenziali/allegati privati
  if (hasPrivateFields) {
    publicDoc.hasPrivateCredentials = true;
  } else {
    delete publicDoc.hasPrivateCredentials;
  }

  return {
    publicDoc: stampPublicDocument(entityType, publicDoc),
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

  const merged = restorePrivateTree({ ...publicDoc }, (privateCredentialsDoc as any).privateNested) as any;

  for (const key of SENSITIVE_KEYS) {
    if (key === 'privateNested') continue;
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

export type LegacyRecordClassification = 'v2_verified' | 'legacy_publishable' | 'requires_classification';

function containsSensitiveKeyDeep(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSensitiveKeyDeep);
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_SET.has(k)) return true;
    if (v && typeof v === 'object' && containsSensitiveKeyDeep(v)) return true;
  }
  return false;
}

/**
 * Classifica esplicitamente un record condiviso legacy rispetto allo schema pubblicabile.
 * Non promuove MAI a pubblico un documento contenente chiavi riservate, allegati non
 * autorizzati o campi non riconosciuti solo perché privo del marcatore v2.
 */
export function classifyLegacyRecord(
  collectionName: string,
  data: Record<string, any> | null | undefined
): LegacyRecordClassification {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'requires_classification';
  if (data.publicSchemaVersion === 0) return 'requires_classification';
  if (containsSensitiveKeyDeep(data)) return 'requires_classification';

  const pubIds = Array.isArray(data.publicDocumentIds)
    ? data.publicDocumentIds.filter(documentIdIsPublicReference).slice(0, 32)
    : [];
  if (data.linkedDocumentId != null && !pubIds.includes(data.linkedDocumentId)) {
    return 'requires_classification';
  }
  if (data.linkedDocumentIds != null) {
    if (!Array.isArray(data.linkedDocumentIds) || data.linkedDocumentIds.some(id => !pubIds.includes(id))) {
      return 'requires_classification';
    }
  }

  const normalizedCollection = PUBLIC_COLLECTIONS[normalizeEntityType(collectionName)] || collectionName;
  const allowed = PUBLIC_DATA_SCHEMAS[normalizedCollection];
  if (!allowed) return 'requires_classification';

  for (const [key, value] of Object.entries(data)) {
    if (!allowed.includes(key)) return 'requires_classification';
    if (!publicValueIsSupported(key, value)) return 'requires_classification';
  }

  return data.publicSchemaVersion === 2 ? 'v2_verified' : 'legacy_publishable';
}
