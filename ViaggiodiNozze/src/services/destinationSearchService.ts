/**
 * destinationSearchService.ts
 * 
 * Servizio gratuito di ricerca geografica e completamento metadati per Hounigo.
 * - Utilizza OpenStreetMap Nominatim per la ricerca geografica (con rispetto rate-limit e User-Agent)
 * - Nessuna dipendenza da API o intelligenze artificiali a pagamento
 * - Cache locale in memoria per evitare chiamate ripetute
 * - Anti-duplicazione intelligente e confronto con entità già presenti nel viaggio
 */

import { storageService } from '../storage/storageService';
import type { Tappa, Alloggio, Attivita, Ristorante, Coordinate } from '../types';

export interface DestinationSearchResult {
  id: string; // OpenStreetMap place_id o ID locale
  source: 'osm' | 'local_tappa' | 'local_alloggio';
  name: string;
  city?: string;
  country?: string;
  countryCode?: string;
  formattedAddress: string;
  coordinate: Coordinate;
  type?: string; // es. 'city', 'hotel', 'tourism', 'attraction'
  category?: string;
}

export interface EntityFieldComparison {
  fieldName: string;
  label: string;
  currentValue?: string;
  proposedValue?: string;
  willUpdate: boolean;
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  duplicateType: 'exact' | 'similar' | 'none';
  existingEntity?: Tappa | Alloggio | Attivita | Ristorante;
  entityType?: 'tappa' | 'alloggio' | 'attivita' | 'ristorante';
  similarityReason?: string;
}

// Cache in memoria con TTL 15 minuti per le ricerche
interface CacheEntry {
  timestamp: number;
  results: DestinationSearchResult[];
}
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

// Rate-limiting compliant Nominatim (minimo 800ms tra chiamate)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 800;

/** Normalizza una stringa per confronti robusti */
export function normalizeString(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Calcola la distanza approssimata in km tra due coordinate */
export function calculateDistanceKm(coord1: Coordinate, coord2: Coordinate): number {
  const R = 6371;
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Cerca destinazioni o luoghi tramite fonti gratuite:
 * 1. Cache in memoria
 * 2. Record locali già salvati nel viaggio
 * 3. OpenStreetMap Nominatim API
 */
export async function searchDestinations(query: string): Promise<DestinationSearchResult[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  const cacheKey = normalizeString(cleanQuery);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }

  const results: DestinationSearchResult[] = [];

  // 1. Cerca prima tra i dati locali del viaggio
  try {
    const [localTappe, localAlloggi] = await Promise.all([
      storageService.getTappe().catch(() => []),
      storageService.getAlloggi().catch(() => [])
    ]);

    const normQ = normalizeString(cleanQuery);

    for (const t of localTappe) {
      const normTitle = normalizeString(t.titolo);
      if (normTitle.includes(normQ) && t.coordinate) {
        results.push({
          id: `local_tappa_${t.id}`,
          source: 'local_tappa',
          name: t.titolo,
          formattedAddress: t.indirizzo || t.titolo,
          coordinate: t.coordinate,
          category: t.sottocategoria || 'Tappa esistente'
        });
      }
    }

    for (const a of localAlloggi) {
      const normName = normalizeString(a.name);
      if (normName.includes(normQ) && a.coordinate) {
        results.push({
          id: `local_alloggio_${a.id}`,
          source: 'local_alloggio',
          name: a.name,
          city: a.location,
          formattedAddress: a.address || a.name,
          coordinate: a.coordinate,
          category: a.sottocategoria || 'Alloggio esistente'
        });
      }
    }
  } catch (err) {
    console.warn('[DestinationSearch] Errore lettura dati locali:', err);
  }

  // 2. Chiamata a OpenStreetMap Nominatim (gratuita e open)
  try {
    const now = Date.now();
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - lastRequestTime));
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastRequestTime = Date.now();

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      cleanQuery
    )}&addressdetails=1&limit=6`;

    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'it,en;q=0.8',
        'User-Agent': 'HounigoRoadbook/1.0 (free travel roadbook app)'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (isNaN(lat) || isNaN(lng)) continue;

          const addr = item.address || {};
          const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
          const country = addr.country || '';
          const countryCode = addr.country_code ? addr.country_code.toUpperCase() : undefined;

          // Escludi duplicati identici con i risultati locali
          const isAlreadyInList = results.some(
            r => calculateDistanceKm(r.coordinate, { lat, lng }) < 0.2
          );

          if (!isAlreadyInList) {
            results.push({
              id: `osm_${item.place_id || Math.random().toString(36).substring(2)}`,
              source: 'osm',
              name: item.name || item.display_name.split(',')[0],
              city: city || undefined,
              country: country || undefined,
              countryCode,
              formattedAddress: item.display_name,
              coordinate: { lat, lng },
              type: item.type,
              category: item.class
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[DestinationSearch] Nominatim non raggiungibile o offline:', err);
  }

  // Memorizza in cache
  searchCache.set(cacheKey, { timestamp: Date.now(), results });
  return results;
}

/**
 * Verifica anti-duplicazione approfondita su un'entità candidata rispetto al viaggio corrente.
 */
export async function checkEntityDuplicate(
  entityType: 'tappa' | 'alloggio' | 'attivita' | 'ristorante',
  candidate: {
    name: string;
    coordinate?: Coordinate;
    address?: string;
    date?: string;
  }
): Promise<DuplicateCheckResult> {
  const normCandidateName = normalizeString(candidate.name);
  if (!normCandidateName) {
    return { hasDuplicate: false, duplicateType: 'none' };
  }

  try {
    let list: Array<Tappa | Alloggio | Attivita | Ristorante> = [];
    if (entityType === 'tappa') list = await storageService.getTappe();
    else if (entityType === 'alloggio') list = await storageService.getAlloggi();
    else if (entityType === 'attivita') list = await storageService.getActivities();
    else if (entityType === 'ristorante') list = await storageService.getRistoranti();

    for (const item of list) {
      const itemName = normalizeString(
        (item as any).titolo || (item as any).name || (item as any).title || (item as any).nome
      );
      const itemCoord = item.coordinate;

      // 1. Corrispondenza Esatta: stesso nome normalizzato
      if (itemName === normCandidateName) {
        return {
          hasDuplicate: true,
          duplicateType: 'exact',
          existingEntity: item,
          entityType,
          similarityReason: `Nome identico a "${(item as any).titolo || (item as any).name || (item as any).title || (item as any).nome}"`
        };
      }

      // 2. Corrispondenza Geografica di Prossimità (raggio < 300 metri con nome simile)
      if (candidate.coordinate && itemCoord) {
        const distKm = calculateDistanceKm(candidate.coordinate, itemCoord);
        if (distKm <= 0.3) {
          const sharesWord = normCandidateName
            .split(' ')
            .filter(w => w.length > 3)
            .some(w => itemName.includes(w));

          if (sharesWord || distKm <= 0.05) {
            return {
              hasDuplicate: true,
              duplicateType: 'similar',
              existingEntity: item,
              entityType,
              similarityReason: `Posizione coincidente (${Math.round(distKm * 1000)}m) con "${(item as any).titolo || (item as any).name || (item as any).title || (item as any).nome}"`
            };
          }
        }
      }
    }
  } catch (err) {
    console.error('[DestinationSearch] Errore verifica duplicati:', err);
  }

  return { hasDuplicate: false, duplicateType: 'none' };
}

/**
 * Prepara il confronto per l'unione dei campi preservando rigorosamente i valori manuali già inseriti.
 */
export function buildFieldComparisons(
  currentValues: Record<string, string | undefined>,
  proposedValues: Record<string, string | undefined>,
  fieldLabels: Record<string, string>
): EntityFieldComparison[] {
  const comparisons: EntityFieldComparison[] = [];

  for (const [key, label] of Object.entries(fieldLabels)) {
    const current = currentValues[key]?.trim();
    const proposed = proposedValues[key]?.trim();

    // Se entrambi i campi sono vuoti, non ha senso mostrarli
    if (!current && !proposed) continue;

    // Regola di preservazione:
    // - Se il campo attuale è vuoto e c'è una proposta -> aggiorno
    // - Se il campo attuale è già compilato e la proposta è identica -> non tocco
    // - Se il campo attuale è già compilato e la proposta differisce -> preservo il manuale per default (willUpdate: false)
    const willUpdate = !current && !!proposed;

    comparisons.push({
      fieldName: key,
      label,
      currentValue: current,
      proposedValue: proposed,
      willUpdate
    });
  }

  return comparisons;
}
