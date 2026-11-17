/**
 * HOUNIGO - Overlap Detection & Collision Decision Engine
 *
 * Gestisce il rilevamento affidabile delle sovrapposizioni temporali e
 * la memorizzazione persistente e sincronizzata delle scelte utente («Mantieni entrambe», «Risolto»).
 *
 * REQUISITI FASE 1:
 * - Confronto degli intervalli temporali effettivi (inizio, fine e durata).
 * - Nessun falso conflitto basato soltanto sulla stessa data o su titoli simili ad orari diversi.
 * - Orari mancanti o indicativi gestiti senza inventare sovrapposizioni certe.
 * - Riconoscimento stabile della coppia mediante ID, indipendente dall'ordine (A_B === B_A).
 * - Memorizzazione persistente sincronizzata tra Owner e Copilota (localStorage + IndexedDB + Cloud settings).
 * - Nessuna nuova segnalazione se la situazione è immutata; ricalcola solo se cambiano date o orari.
 */

import { storageService } from '../storage/storageService';

export interface TimeInterval {
  id: string;
  type: string;
  date: string; // YYYY-MM-DD
  startTimeMin: number | null; // 0..1439
  endTimeMin: number | null; // 0..1439 (o > 1439 se oltre mezzanotte)
  durationMin: number | null;
  isIndicative: boolean;
  timeString: string;
  signature: string; // Impronta digitale data/orario per rilevare modifiche
}

export interface CollisionDecisionRecord {
  id: string; // `collision_decision_${pairKey}`
  pairKey: string;
  category: string;
  idA: string;
  idB: string;
  decision: 'keep' | 'resolved' | 'dismissed';
  signature: string;
  updatedAt: number;
}

/**
 * Converte una stringa orario (es. "09:30", "9:30", "09.30") in minuti da mezzanotte (0..1439).
 * Ritorna null se la stringa è vuota, non valida o un placeholder (es. "23:59" / "00:00" fittizio).
 */
export function parseTimeMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const clean = String(timeStr).trim().replace('.', ':');
  if (!clean || clean === '23:59' || clean === 'non specificato') return null;

  const match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;

  return h * 60 + m;
}

/**
 * Estrae la durata in minuti da numeri o stringhe (es. 90, "90", "1h 30m", "1h30", "2h", "45 min", "01:30").
 */
export function parseDurationMinutes(dur?: string | number | null): number | null {
  if (dur === null || dur === undefined) return null;
  if (typeof dur === 'number') {
    return dur > 0 && Number.isFinite(dur) ? dur : null;
  }
  const str = String(dur).trim().toLowerCase();
  if (!str) return null;

  // Formato puro numerico (minuti): "90"
  if (/^\d+$/.test(str)) {
    const val = parseInt(str, 10);
    return val > 0 ? val : null;
  }

  // Formato "01:30"
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m > 0 ? h * 60 + m : null;
  }

  // Formato con "h" e/o "m" (es. "1h 30m", "1h30", "2h", "45 min", "45m")
  let total = 0;
  let matched = false;

  const hMatch = str.match(/(\d+)\s*(?:h|ore|ora)/);
  if (hMatch) {
    total += parseInt(hMatch[1], 10) * 60;
    matched = true;
  }

  const mMatch = str.match(/(\d+)\s*(?:m|min|minuti)/);
  if (mMatch) {
    total += parseInt(mMatch[1], 10);
    matched = true;
  }

  // Formato compatto tipo "1h30"
  if (!matched) {
    const compactMatch = str.match(/^(\d+)h(\d+)$/);
    if (compactMatch) {
      total = parseInt(compactMatch[1], 10) * 60 + parseInt(compactMatch[2], 10);
      matched = true;
    }
  }

  return matched && total > 0 ? total : null;
}

/**
 * Estrae l'intervallo temporale normalizzato da una qualunque entità del roadbook
 */
export function extractTimeInterval(entity: any, fallbackType = 'item'): TimeInterval {
  const id = String(entity?.id || '');
  const type = String(entity?.type || fallbackType);

  // Data: date | data | dayId
  let date = String(entity?.date || entity?.data || '').trim();
  if (!date && typeof entity?.dayId === 'string' && entity.dayId.startsWith('day_')) {
    date = entity.dayId.replace('day_', '');
  }

  // Indicatività oraria
  const isIndicative = Boolean(
    entity?.timeIsDefault ||
    entity?.isIndicative ||
    entity?.timeStatus === 'indicativo' ||
    entity?.timeStatus === 'flessibile' ||
    entity?.orarioIndicativo
  );

  // Orario di inizio
  const rawStart = entity?.time || entity?.departureTime || entity?.orarioInizio || entity?.orario || entity?.orarioRitrovo || entity?.checkInTime;
  const startTimeMin = parseTimeMinutes(rawStart);

  // Durata
  const durationMin = parseDurationMinutes(entity?.duration || entity?.durata);

  // Orario di fine
  const rawEnd = entity?.arrivalTime || entity?.endTime || entity?.orarioFine || entity?.checkOutTime;
  let endTimeMin = parseTimeMinutes(rawEnd);

  // Se fine orario specificata ma inferiore all'inizio, assume scavallamento mezzanotte
  if (startTimeMin !== null && endTimeMin !== null && endTimeMin < startTimeMin) {
    endTimeMin += 24 * 60;
  }

  // Se manca orario fine ma c'è durata, calcola fine
  if (startTimeMin !== null && endTimeMin === null && durationMin !== null) {
    endTimeMin = startTimeMin + durationMin;
  }

  const timeString = rawStart ? String(rawStart).trim() : '';
  const signature = `${date}_${startTimeMin ?? 'none'}_${endTimeMin ?? 'none'}_${durationMin ?? 'none'}_${isIndicative ? 'ind' : 'exact'}`;

  return {
    id,
    type,
    date,
    startTimeMin,
    endTimeMin,
    durationMin,
    isIndicative,
    timeString,
    signature
  };
}

/**
 * Confronta due intervalli e determina se vi è un reale conflitto temporale.
 * Regole rigorose:
 * 1. Date diverse -> MAI sovrapposizione.
 * 2. Orari indicativi o mancanti -> MAI sovrapposizione inventata.
 * 3. Due eventi puntuali (senza durata o fine) -> Sovrapposti SOLO se hanno esattamente lo stesso orario.
 * 4. Evento con durata/intervallo e evento puntuale -> Sovrapposti se il punto cade all'interno dell'intervallo [inizio, fine).
 * 5. Due intervalli -> Sovrapposti se e solo se startA < endB && startB < endA.
 */
export function areIntervalsOverlapping(intA: TimeInterval, intB: TimeInterval): boolean {
  // Stesso ID -> mai collisione con se stesso
  if (!intA.id || !intB.id || intA.id === intB.id) return false;

  // Date diverse o mancanti -> nessun conflitto di orario giornaliero
  if (!intA.date || !intB.date || intA.date !== intB.date) return false;

  // Orari indicativi o non certi -> mai inventare sovrapposizioni
  if (intA.isIndicative || intB.isIndicative) return false;

  // Orari di inizio mancanti -> nessun conflitto
  if (intA.startTimeMin === null || intB.startTimeMin === null) return false;

  const startA = intA.startTimeMin;
  const startB = intB.startTimeMin;

  const endA = intA.endTimeMin !== null && intA.endTimeMin > startA ? intA.endTimeMin : startA;
  const endB = intB.endTimeMin !== null && intB.endTimeMin > startB ? intB.endTimeMin : startB;

  const hasRangeA = endA > startA;
  const hasRangeB = endB > startB;

  // Caso 1: entrambi sono eventi puntuali (nessuna durata)
  if (!hasRangeA && !hasRangeB) {
    return startA === startB;
  }

  // Caso 2: A ha un intervallo, B è puntuale
  if (hasRangeA && !hasRangeB) {
    return startB >= startA && startB < endA;
  }

  // Caso 3: B ha un intervallo, A è puntuale
  if (!hasRangeA && hasRangeB) {
    return startA >= startB && startA < endB;
  }

  // Caso 4: entrambi hanno un intervallo
  return startA < endB && startB < endA;
}

/**
 * Genera una chiave stabile e deterministica per la coppia di elementi,
 * rigorosamente INDIPENDENTE dall'ordine di chiamata.
 * pairKey(A, B) === pairKey(B, A)
 */
export function getCollisionPairKey(idA: string, idB: string, category = 'collision'): string {
  const [first, second] = [String(idA), String(idB)].sort();
  return `${category}_${first}_${second}`;
}

/**
 * Calcola l'impronta temporale combinata della coppia per invalidare la soppressione
 * solo se date o orari di uno dei due elementi cambiano effettivamente.
 */
export function getPairSignature(sigA: string, sigB: string): string {
  const [s1, s2] = [sigA, sigB].sort();
  return `${s1}___${s2}`;
}

// Cache sincrona locale in memoria per controlli immediati nel ciclo di render
const memoryDecisionCache = new Map<string, CollisionDecisionRecord>();

/**
 * Inizializza o aggiorna la cache in memoria a partire da localStorage
 */
function readDecisionFromStorage(pairKey: string): CollisionDecisionRecord | null {
  if (memoryDecisionCache.has(pairKey)) {
    return memoryDecisionCache.get(pairKey)!;
  }

  if (typeof localStorage === 'undefined') return null;

  try {
    const settingKey = `collision_decision_${pairKey}`;
    const raw = localStorage.getItem(settingKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.decision) {
        memoryDecisionCache.set(pairKey, parsed);
        return parsed;
      }
    }

    // Fallback: controllo chiave semplificata
    const simpleVal = localStorage.getItem(pairKey);
    if (simpleVal === 'keep' || simpleVal === 'resolved' || simpleVal === 'dismissed') {
      const legacyRecord: CollisionDecisionRecord = {
        id: `collision_decision_${pairKey}`,
        pairKey,
        category: 'collision',
        idA: '',
        idB: '',
        decision: simpleVal,
        signature: '',
        updatedAt: Date.now()
      };
      memoryDecisionCache.set(pairKey, legacyRecord);
      return legacyRecord;
    }
  } catch {}

  return null;
}

/**
 * Verifica se un avviso di collisione tra due elementi è già stato risolto o silenziato
 * con scelta «Mantieni entrambe» / «Risolto».
 * Se l'orario o la data sono cambiati rispetto a quando fu presa la decisione,
 * l'avviso torna ad essere valutato con i nuovi dati.
 */
export function isCollisionDismissedOrResolved(
  idA: string,
  idB: string,
  currentPairSignature: string,
  category = 'collision'
): boolean {
  if (!idA || !idB) return false;

  const pairKey = getCollisionPairKey(idA, idB, category);
  const stored = readDecisionFromStorage(pairKey);

  if (stored) {
    // Se la decisione salvata aveva una firma temporale registrata:
    if (stored.signature) {
      if (stored.signature === currentPairSignature) {
        // La situazione temporale è identica a quella confermata dall'utente: rispetta la scelta
        return true;
      }
      // Se la firma temporale è cambiata (es. orario modificato), la vecchia soppressione scade
      return false;
    }
    // Firma assente (decisione storica retrocompatibile): sopprimi
    return true;
  }

  // Controllo fallback retrocompatibile sui vecchi formati di localStorage/sessionStorage
  if (typeof sessionStorage !== 'undefined') {
    const sessVal = sessionStorage.getItem(pairKey) ||
                    sessionStorage.getItem(`collision_dismissed_${idA}_${idB}`) ||
                    sessionStorage.getItem(`collision_dismissed_${idB}_${idA}`);
    if (sessVal === 'keep' || sessVal === 'resolved' || sessVal === 'dismissed') return true;
  }

  if (typeof localStorage !== 'undefined') {
    const locVal = localStorage.getItem(`collision_dismissed_${idA}_${idB}`) ||
                   localStorage.getItem(`collision_dismissed_${idB}_${idA}`);
    if (locVal === 'keep' || locVal === 'resolved' || locVal === 'dismissed') return true;
  }

  return false;
}

/**
 * Salva la decisione dell'utente («Mantieni entrambe» / «Risolto» / «Ignora»)
 * in modo sincrono (localStorage + memoria) e asincrono (IndexedDB + Cloud sync via settings).
 */
export async function persistCollisionDecision(
  idA: string,
  idB: string,
  decision: 'keep' | 'resolved' | 'dismissed',
  pairSignature: string,
  category = 'collision'
): Promise<void> {
  if (!idA || !idB) return;

  const pairKey = getCollisionPairKey(idA, idB, category);
  const settingKey = `collision_decision_${pairKey}`;
  const now = Date.now();

  const record: CollisionDecisionRecord = {
    id: settingKey,
    pairKey,
    category,
    idA,
    idB,
    decision,
    signature: pairSignature,
    updatedAt: now
  };

  // 1. Aggiorna memoria
  memoryDecisionCache.set(pairKey, record);

  // 2. Aggiorna localStorage sincrono
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(settingKey, JSON.stringify(record));
      localStorage.setItem(pairKey, decision);
      // Salva anche chiavi retrocompatibili in entrambe le direzioni
      localStorage.setItem(`collision_dismissed_${idA}_${idB}`, decision);
      localStorage.setItem(`collision_dismissed_${idB}_${idA}`, decision);
    } catch {}
  }

  // 3. Aggiorna sessionStorage
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(pairKey, decision);
      sessionStorage.setItem(settingKey, decision);
      sessionStorage.setItem(`collision_dismissed_${idA}_${idB}`, decision);
      sessionStorage.setItem(`collision_dismissed_${idB}_${idA}`, decision);
    } catch {}
  }

  // 4. Salva in IndexedDB e sincronizza con il Cloud (raccolta settings del viaggio)
  try {
    await storageService.saveSetting(settingKey, record);
  } catch (err) {
    console.warn('[OverlapDetection] Fallito salvataggio setting sincronizzato:', err);
  }
}

/**
 * Sincronizza una decisione proveniente da remoto (onSnapshot o pull cloud).
 */
export function syncIncomingCollisionDecision(remoteData: any): void {
  if (!remoteData || typeof remoteData !== 'object') return;
  const record: CollisionDecisionRecord = remoteData.value || remoteData;
  if (!record || !record.pairKey || !record.decision) return;

  memoryDecisionCache.set(record.pairKey, record);

  if (typeof localStorage !== 'undefined') {
    try {
      const settingKey = record.id || `collision_decision_${record.pairKey}`;
      localStorage.setItem(settingKey, JSON.stringify(record));
      localStorage.setItem(record.pairKey, record.decision);
      if (record.idA && record.idB) {
        localStorage.setItem(`collision_dismissed_${record.idA}_${record.idB}`, record.decision);
        localStorage.setItem(`collision_dismissed_${record.idB}_${record.idA}`, record.decision);
      }
    } catch {}
  }
}
