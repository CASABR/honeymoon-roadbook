/**
 * photonService.ts
 *
 * Servizio gratuito di geocoding e autocomplete luoghi (Zero-cost, nessuna API Key).
 * Doppia sorgente:
 * 1. Locale (prioritaria): elementi del viaggio in IndexedDB (ViaggiodiNozzeDB)
 * 2. Globale: Photon API by Komoot basata su OpenStreetMap (https://photon.komoot.io)
 */

import { storageService } from '../storage/storageService';
import type { Coordinate, Attivita, Alloggio, Tappa, Ristorante, Shopping } from '../types';

export interface PlaceSuggestion {
  id: string;
  source: 'local' | 'photon';
  title: string;
  subtitle: string;
  address: string;
  city?: string;
  country?: string;
  coordinate?: Coordinate;
  category?: string;
  rawLocalItem?: any;
}

// Cache in memoria per le voci locali di IndexedDB con TTL di 60 secondi
interface LocalPlacesCache {
  timestamp: number;
  items: PlaceSuggestion[];
}
let localPlacesCache: LocalPlacesCache | null = null;
const LOCAL_CACHE_TTL_MS = 60 * 1000;

// Cache in memoria con TTL 15 minuti per query remote Photon
interface CacheEntry {
  timestamp: number;
  results: PlaceSuggestion[];
}
const remoteCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Invalida la cache locale in memoria (es. dopo aggiunta/modifica elementi).
 */
export function invalidateLocalPlacesCache(): void {
  localPlacesCache = null;
}

/**
 * Normalizza una stringa rimuovendo accenti e portando in minuscolo.
 */
function normalize(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Precarica o restituisce dalla memoria tutti gli elementi del viaggio da IndexedDB.
 * Esegue le query IndexedDB una sola volta ogni 60 secondi per non bloccare l'interfaccia.
 */
export async function preloadLocalPlaces(): Promise<PlaceSuggestion[]> {
  if (localPlacesCache && Date.now() - localPlacesCache.timestamp < LOCAL_CACHE_TTL_MS) {
    return localPlacesCache.items;
  }

  try {
    const [acts, accs, tps, rists, shops] = await Promise.all([
      storageService.getActivities().catch(() => [] as Attivita[]),
      storageService.getAccommodations().catch(() => [] as Alloggio[]),
      storageService.getTappe().catch(() => [] as Tappa[]),
      storageService.getRistoranti ? storageService.getRistoranti().catch(() => [] as Ristorante[]) : Promise.resolve([] as Ristorante[]),
      storageService.getShopping ? storageService.getShopping().catch(() => [] as Shopping[]) : Promise.resolve([] as Shopping[])
    ]);

    const items: PlaceSuggestion[] = [];
    const seen = new Set<string>();

    // 1. Alloggi
    for (const h of accs) {
      const name = h.name || '';
      const addr = h.address || h.location || '';
      const key = normalize(name);
      if (key && !seen.has(key)) {
        seen.add(key);
        items.push({
          id: `local_acc_${h.id}`,
          source: 'local',
          title: name,
          subtitle: `Alloggio nel viaggio • ${h.sottocategoria || 'Struttura'}`,
          address: addr,
          city: h.location || undefined,
          coordinate: h.coordinate,
          category: 'alloggio',
          rawLocalItem: h
        });
      }
    }

    // 2. Attività
    for (const a of acts) {
      const title = a.title || '';
      const addr = a.address || a.location || '';
      const key = normalize(title);
      if (key && !seen.has(key)) {
        seen.add(key);
        items.push({
          id: `local_act_${a.id}`,
          source: 'local',
          title: title,
          subtitle: `Attività nel viaggio • ${a.sottocategoria || a.category || 'Tour'}`,
          address: addr,
          city: a.location || undefined,
          coordinate: a.coordinate,
          category: 'attivita',
          rawLocalItem: a
        });
      }
    }

    // 3. Tappe
    for (const t of tps) {
      const title = t.titolo || '';
      const addr = t.indirizzo || '';
      const key = normalize(title);
      if (key && !seen.has(key)) {
        seen.add(key);
        items.push({
          id: `local_tappa_${t.id}`,
          source: 'local',
          title: title,
          subtitle: `Tappa dell'itinerario`,
          address: addr,
          coordinate: t.coordinate,
          category: 'tappa',
          rawLocalItem: t
        });
      }
    }

    // 4. Ristoranti
    for (const r of rists) {
      const name = r.nome || '';
      const addr = r.indirizzo || '';
      const key = normalize(name);
      if (key && !seen.has(key)) {
        seen.add(key);
        items.push({
          id: `local_rist_${r.id}`,
          source: 'local',
          title: name,
          subtitle: `Ristorante nel viaggio • ${r.sottocategoria || 'Ristorante'}`,
          address: addr,
          coordinate: r.coordinate,
          category: 'ristorante',
          rawLocalItem: r
        });
      }
    }

    // 5. Shopping
    for (const s of shops) {
      const name = s.nome || '';
      const addr = s.indirizzo || '';
      const key = normalize(name);
      if (key && !seen.has(key)) {
        seen.add(key);
        items.push({
          id: `local_shop_${s.id}`,
          source: 'local',
          title: name,
          subtitle: `Shopping nel viaggio • ${s.sottocategoria || 'Negozio'}`,
          address: addr,
          category: 'shopping',
          rawLocalItem: s
        });
      }
    }

    localPlacesCache = {
      timestamp: Date.now(),
      items
    };

    return items;
  } catch (err) {
    console.warn('[PhotonService] Errore lettura locale IndexedDB:', err);
    return [];
  }
}

/**
 * Cerca corrispondenze negli store locali IndexedDB del viaggio corrente.
 * Utilizza la cache in memoria per garantire 0 I/O durante la digitazione.
 */
export async function searchLocalPlaces(query: string, maxResults = 4): Promise<PlaceSuggestion[]> {
  const qNorm = normalize(query);
  if (!qNorm || qNorm.length < 2) return [];

  const allItems = await preloadLocalPlaces();
  const results: PlaceSuggestion[] = [];

  for (const item of allItems) {
    const titleNorm = normalize(item.title);
    const addrNorm = normalize(item.address);
    if (titleNorm.includes(qNorm) || addrNorm.includes(qNorm)) {
      results.push(item);
      if (results.length >= maxResults) break;
    }
  }

  return results;
}

/**
 * Ricava una coordinata di contesto dalla data della card (mai dal GPS corrente dell'utente)
 * per ordinare i suggerimenti Photon verso l'area geografica prevista quel giorno,
 * senza impedire ricerche in altri Paesi.
 */
export async function getTripDateBiasCoordinate(dateStr?: string): Promise<Coordinate | undefined> {
  const target = (dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return undefined;
  try {
    const [accs, acts, tps, rists] = await Promise.all([
      storageService.getAccommodations().catch(() => [] as Alloggio[]),
      storageService.getActivities().catch(() => [] as Attivita[]),
      storageService.getTappe().catch(() => [] as Tappa[]),
      storageService.getRistoranti ? storageService.getRistoranti().catch(() => [] as Ristorante[]) : Promise.resolve([] as Ristorante[]),
    ]);

    const valid = (c?: Coordinate | null): c is Coordinate =>
      Boolean(c && typeof c.lat === 'number' && typeof c.lng === 'number' && Number.isFinite(c.lat) && Number.isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0));

    // 1. Alloggio attivo nella data target
    const acc = accs.find((a) => valid(a.coordinate) && a.checkIn <= target && (!a.checkOut || target <= a.checkOut));
    if (acc && valid(acc.coordinate)) return acc.coordinate;

    // 2. Attività, tappa o ristorante nella stessa data
    const sameDayAct = acts.find((a) => valid(a.coordinate) && a.date === target);
    if (sameDayAct && valid(sameDayAct.coordinate)) return sameDayAct.coordinate;
    const sameDayTappa = tps.find((t) => valid(t.coordinate) && t.data === target);
    if (sameDayTappa && valid(sameDayTappa.coordinate)) return sameDayTappa.coordinate;
    const sameDayRist = rists.find((r) => valid(r.coordinate) && (r.data || r.date) === target);
    if (sameDayRist && valid(sameDayRist.coordinate)) return sameDayRist.coordinate;

    // 3. Alloggio/tappa più vicina temporalmente
    const targetMs = Date.parse(target);
    let best: { diff: number; coord: Coordinate } | null = null;
    for (const a of accs) {
      if (!valid(a.coordinate) || !a.checkIn) continue;
      const diff = Math.abs(Date.parse(a.checkIn) - targetMs);
      if (!best || diff < best.diff) best = { diff, coord: a.coordinate };
    }
    return best?.coord;
  } catch {
    return undefined;
  }
}

/**
 * Cerca luoghi globali tramite Photon API (Komoot / OpenStreetMap).
 * Supporta AbortSignal esterno e bias geografico opzionale basato sulla data della card.
 */
export async function searchPhotonPlaces(
  query: string,
  limit = 5,
  signal?: AbortSignal,
  biasCoord?: Coordinate
): Promise<PlaceSuggestion[]> {
  const qClean = query.trim();
  if (qClean.length < 3) return [];

  const biasKey = biasCoord ? `${biasCoord.lat.toFixed(1)},${biasCoord.lng.toFixed(1)}` : 'global';
  const cacheKey = `${qClean.toLowerCase()}|${biasKey}`;
  const cached = remoteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }

  // Timeout protetto a 4000ms e collegamento all'AbortSignal del chiamante
  const internalController = new AbortController();
  const timer = setTimeout(() => internalController.abort(), 4000);

  const onExternalAbort = () => {
    internalController.abort();
  };

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      return [];
    }
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    // NOTA FONDAMENTALE: Photon supporta solo 'default, de, en, fr'. NON passare 'lang=it' altrimenti risponde con HTTP 400 Bad Request!
    const biasParams = biasCoord
      ? `&lat=${encodeURIComponent(biasCoord.lat.toFixed(4))}&lon=${encodeURIComponent(biasCoord.lng.toFixed(4))}`
      : '';
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(qClean)}&limit=${limit}${biasParams}`;
    
    const res = await fetch(url, {
      signal: internalController.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);

    if (!res.ok) {
      console.warn(`[PhotonService] Risposta HTTP non OK da Photon (${res.status} ${res.statusText}) per query: "${qClean}"`);
      return [];
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.features)) return [];

    console.log(`[PhotonService] HTTP ${res.status} - Trovati ${data.features.length} risultati da Photon per "${qClean}"`);

    const suggestions: PlaceSuggestion[] = [];

    for (const feat of data.features) {
      const props = feat.properties || {};
      const coords = feat.geometry?.coordinates; // [lng, lat]

      const name = props.name || props.street || props.city || qClean;
      
      // Costruisce indirizzo leggibile
      const streetPart = props.street
        ? (props.housenumber ? `${props.street} ${props.housenumber}` : props.street)
        : '';
      const cityPart = props.city || props.locality || props.district || '';
      const statePart = props.state || '';
      const countryPart = props.country || '';

      const addressParts = [streetPart, cityPart, countryPart].filter(Boolean);
      const formattedAddress = addressParts.length > 0 ? addressParts.join(', ') : name;

      // Sottotitolo descrittivo (es. "Roma, Lazio, Italia")
      const subtitleParts = [cityPart, statePart, countryPart].filter(Boolean);
      const subtitle = subtitleParts.join(', ') || formattedAddress;

      let coordinate: Coordinate | undefined;
      if (Array.isArray(coords) && coords.length >= 2) {
        coordinate = {
          lat: parseFloat(coords[1]),
          lng: parseFloat(coords[0])
        };
      }

      suggestions.push({
        id: `photon_${props.osm_id || Math.random().toString(36).substring(2, 9)}`,
        source: 'photon',
        title: name,
        subtitle,
        address: formattedAddress,
        city: cityPart || undefined,
        country: countryPart || undefined,
        coordinate,
        category: props.type || props.osm_value || 'luogo'
      });
    }

    console.log('[Photon Debug]', qClean, suggestions);

    remoteCache.set(cacheKey, {
      timestamp: Date.now(),
      results: suggestions
    });

    return suggestions;
  } catch (err: any) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);

    // Non logghiamo errori se la richiesta è stata intenzionalmente interrotta dall'utente digitando
    if (err?.name !== 'AbortError' && !internalController.signal.aborted) {
      console.warn('[PhotonService] Ricerca Photon fallita o offline:', err?.message || err);
    }
    return [];
  }
}

/**
 * Esegue ricerca combinata: prima locale da memoria/IndexedDB, poi globale Photon.
 * Deduplica i risultati ed elimina duplicati evidenti.
 */
export async function searchPlacesCombined(
  query: string,
  maxRemote = 5,
  signal?: AbortSignal,
  biasCoord?: Coordinate
): Promise<PlaceSuggestion[]> {
  const qClean = query.trim();
  if (qClean.length < 3) return [];

  const [localResults, photonResults] = await Promise.all([
    searchLocalPlaces(qClean, 3),
    searchPhotonPlaces(qClean, maxRemote, signal, biasCoord)
  ]);

  // Se la ricerca è stata annullata nel frattempo, esci
  if (signal?.aborted) return [];

  const isValidCoord = (c?: Coordinate | null): c is Coordinate =>
    Boolean(c && typeof c.lat === 'number' && typeof c.lng === 'number' && Number.isFinite(c.lat) && Number.isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0));

  const isSamePlace = (a: PlaceSuggestion, b: PlaceSuggestion): boolean => {
    if (normalize(a.title) !== normalize(b.title)) return false;
    if (!isValidCoord(a.coordinate) || !isValidCoord(b.coordinate)) return false;
    return (
      Math.abs(a.coordinate.lat - b.coordinate.lat) < 0.01 &&
      Math.abs(a.coordinate.lng - b.coordinate.lng) < 0.01
    );
  };

  // Deduplica solo se titolo E coordinate coincidono (~1 km): un omonimo locale errato o privo di coordinate non deve mai nascondere il risultato Photon corretto.
  const filteredPhoton = photonResults.filter(p => !localResults.some(l => isSamePlace(l, p)));
  const localWithCoords = localResults.filter(l => isValidCoord(l.coordinate));
  const localWithoutCoords = localResults.filter(l => !isValidCoord(l.coordinate));

  return [...localWithCoords, ...filteredPhoton, ...localWithoutCoords];
}
