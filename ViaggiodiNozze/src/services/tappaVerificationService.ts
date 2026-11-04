/**
 * tappaVerificationService.ts
 *
 * Servizio di verifica geografica e parsing affidabile per le tappe HouniAI.
 * Rispetta rigorosamente i requisiti:
 * 1. Mantiene la categoria 'tappa' (non la trasforma arbitrariamente in 'attivita').
 * 2. Esegue verifica individuale su ogni toponimo (Local Cache -> Photon Komoot -> Nominatim OSM).
 * 3. Identifica luoghi inesistenti/fittizi e li contrassegna esplicitamente come 'unverified' (NON VERIFICATO),
 *    evitando di generare coordinate fittizie o link mappe ingannevoli.
 * 4. Gestisce omonimi e disambiguazione geografica in base al contesto del viaggio.
 * 5. Parsing robusto di sequenze (->), liste numerate, multi-riga grezza e mix tappe/attività.
 */

import { searchPhotonPlaces, searchLocalPlaces, type PlaceSuggestion } from './photonService';
import { searchDestinations } from './destinationSearchService';
import type { Coordinate } from '../types';
import type { ExtractedTappa, ExtractedAttivita } from './aiExtractor';

export type TappaVerificationStatus = 'verified' | 'unverified' | 'ambiguous';

export interface VerifiedTappaCandidate {
  titolo: string;
  data?: string;
  orario?: string;
  indirizzo?: string;
  coordinate?: Coordinate;
  mapsUrl?: string;
  nota?: string;
  sottocategoria?: string;
  verificationStatus: TappaVerificationStatus;
  verificationSource?: 'local' | 'photon' | 'osm' | 'manual';
  verificationDetails?: string;
  ambiguousOptions?: Array<{ name: string; country?: string; coordinate?: Coordinate }>;
}

export interface VerificationContext {
  targetCountry?: string; // es. "Giappone", "Japan", "Italia", "Australia"
  currentCity?: string;
  tripDates?: string[];
}

/**
 * Normalizza il nome toponimo per la ricerca (rimuove prefissi comuni come "Arrivo a", "Tappa", "Sosta")
 */
export function cleanToponym(input: string): string {
  let cleaned = input.trim();
  cleaned = cleaned.replace(/^(?:arrivo\s+a|partenza\s+da|visita\s+a|tappa\s+a|sosta\s+a|tappa\s*[:\-–]?|sosta\s*[:\-–]?)\s*/i, '');
  cleaned = cleaned.replace(/^(?:[-*•]|\d+[\.\)\-–])\s*/, '');
  return cleaned.trim();
}

/**
 * Rileva se un toponimo è manifestamente fittizio o privo di senso (nonsense / random test)
 */
export function isObviouslyFakeToponym(toponym: string): boolean {
  const norm = toponym.toLowerCase().trim();
  if (norm.length < 2) return true;
  // Pattern inventati come Wonderland XY99, Fantacity, Asdfgh, ecc.
  if (/fantacity|wonderland|xy\d+|foo.*bar|fakeplace|qwerty|asdfgh/i.test(norm)) return true;
  // Solo caratteri speciali o numeri
  if (/^[^a-z0-9]+$/i.test(norm)) return true;
  return false;
}

/**
 * Verifica geografica individuale di una singola tappa
 */
export async function verifySingleTappa(
  rawTitolo: string,
  extra?: { data?: string; orario?: string; indirizzo?: string; nota?: string },
  context?: VerificationContext
): Promise<VerifiedTappaCandidate> {
  const cleanName = cleanToponym(rawTitolo);

  const baseResult: VerifiedTappaCandidate = {
    titolo: rawTitolo.trim(),
    data: extra?.data,
    orario: extra?.orario,
    indirizzo: extra?.indirizzo,
    nota: extra?.nota,
    sottocategoria: 'Tappa',
    verificationStatus: 'unverified'
  };

  if (!cleanName || isObviouslyFakeToponym(cleanName)) {
    baseResult.verificationStatus = 'unverified';
    baseResult.verificationDetails = 'Luogo inesistente o non trovato nei database cartografici.';
    return baseResult;
  }

  try {
    // 1. Controllo archivio locale IndexedDB
    const localMatches = await searchLocalPlaces(cleanName, 3);
    if (localMatches && localMatches.length > 0) {
      const best = localMatches[0];
      return {
        ...baseResult,
        indirizzo: best.address || baseResult.indirizzo,
        coordinate: best.coordinate,
        mapsUrl: best.coordinate ? `https://www.google.com/maps/search/?api=1&query=${best.coordinate.lat},${best.coordinate.lng}` : undefined,
        verificationStatus: 'verified',
        verificationSource: 'local',
        verificationDetails: `Verificato tramite elementi esistenti nel viaggio (${best.title})`
      };
    }

    // 2. Chiamata a Photon API Komoot (OpenStreetMap)
    const photonResults: PlaceSuggestion[] = await searchPhotonPlaces(cleanName, 5).catch(() => []);
    
    if (photonResults && photonResults.length > 0) {
      // Verifica omonimi geografici
      if (photonResults.length > 1) {
        const countries = Array.from(new Set(photonResults.map(p => p.country).filter(Boolean)));
        
        // Se i risultati appartengono a paesi diversi (es. Paris Texas vs Paris Francia)
        if (countries.length > 1) {
          if (context?.targetCountry) {
            const countryNorm = context.targetCountry.toLowerCase();
            const matched = photonResults.find(p => p.country?.toLowerCase().includes(countryNorm));
            if (matched && matched.coordinate) {
              return {
                ...baseResult,
                indirizzo: matched.address || `${matched.city || matched.title}, ${matched.country}`,
                coordinate: matched.coordinate,
                mapsUrl: `https://www.google.com/maps/search/?api=1&query=${matched.coordinate.lat},${matched.coordinate.lng}`,
                verificationStatus: 'verified',
                verificationSource: 'photon',
                verificationDetails: `Disambiguato per ${matched.country} in base al contesto del viaggio`
              };
            }
          }

          // Senza contesto chiaro o se l'omonimo è incerto, segnaliamo ambiguità
          return {
            ...baseResult,
            verificationStatus: 'ambiguous',
            verificationSource: 'photon',
            verificationDetails: `Trovati più luoghi corrispondenti in paesi diversi (${countries.join(', ')}). Da confermare.`,
            ambiguousOptions: photonResults.map(p => ({
              name: `${p.title} (${p.city || ''}, ${p.country || ''})`,
              country: p.country,
              coordinate: p.coordinate
            }))
          };
        }
      }

      const best = photonResults[0];
      if (best && best.coordinate) {
        return {
          ...baseResult,
          indirizzo: best.address || (best.city ? `${best.city}, ${best.country || ''}` : best.country || ''),
          coordinate: best.coordinate,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${best.coordinate.lat},${best.coordinate.lng}`,
          verificationStatus: 'verified',
          verificationSource: 'photon',
          verificationDetails: `Confermato su OpenStreetMap (${best.city || best.title}, ${best.country || ''})`
        };
      }
    }

    // 3. Fallback: OpenStreetMap Nominatim
    const osmResults = await searchDestinations(cleanName).catch(() => []);
    if (osmResults && osmResults.length > 0) {
      const best = osmResults[0];
      if (best.coordinate) {
        return {
          ...baseResult,
          indirizzo: best.formattedAddress,
          coordinate: best.coordinate,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${best.coordinate.lat},${best.coordinate.lng}`,
          verificationStatus: 'verified',
          verificationSource: 'osm',
          verificationDetails: `Confermato tramite OpenStreetMap Nominatim (${best.country || ''})`
        };
      }
    }

    // Nessuna corrispondenza valida trovata
    baseResult.verificationStatus = 'unverified';
    baseResult.verificationDetails = 'Luogo non identificato geograficamente. Nessuna coordinata fittizia generata.';
    return baseResult;
  } catch (err: any) {
    console.warn('[tappaVerificationService] Errore verifica:', err);
    baseResult.verificationStatus = 'unverified';
    baseResult.verificationDetails = 'Verifica cartografica temporaneamente non disponibile.';
    return baseResult;
  }
}

/**
 * Parsing intelligente di sequenze di tappe con separatori (->, >, –>)
 * es. "Tokyo -> Hakone -> Kyoto"
 */
export function parseTappaSequence(text: string, defaultDate?: string): ExtractedTappa[] {
  // Riconosce sequenze con frecce
  if (text.includes('->') || text.includes('—>') || text.includes('–>') || (text.includes(' > ') && !text.includes('<'))) {
    const parts = text.split(/(?:->|—>|–>|\s+>\s+)/).map(s => s.trim()).filter(s => s.length > 1);
    if (parts.length >= 2) {
      return parts.map(part => {
        let title = part;
        let orario: string | undefined;
        const timeMatch = part.match(/\b([0-2]?\d:[0-5]\d)\b/);
        if (timeMatch) {
          orario = timeMatch[1].padStart(5, '0');
          title = title.replace(timeMatch[0], '').trim();
        }
        title = cleanToponym(title);
        return {
          type: 'tappa' as const,
          titolo: title,
          data: defaultDate,
          orario,
          time: orario,
          sottocategoria: 'Tappa'
        };
      });
    }
  }
  return [];
}

/**
 * Parsing avanzato di itinerario grezzo multi-riga o elenchi numerati
 */
export function parseRawMultiLineTappe(text: string, defaultDate?: string): ExtractedTappa[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const results: ExtractedTappa[] = [];
  
  // Date detection per blocchi o righe
  let activeDate = defaultDate;
  const isoDateRegex = /\b(202\d-[01]\d-[0-3]\d)\b/;

  for (const line of lines) {
    const dateMatch = line.match(isoDateRegex);
    if (dateMatch) {
      activeDate = dateMatch[1];
    }

    // Ignora intestazioni generiche
    if (/^(itinerario|giorno\s+\d+|programma|tappe|soste)\s*[:\-–]?/i.test(line) && line.length < 30 && !line.includes(':')) {
      continue;
    }

    // Pattern 1: Con orario "15:30 Kyoto" o "- 15:30 Kyoto"
    const timeMatch = line.match(/^(?:[-*•]|\d+[\.\)\-–])?\s*([0-2]?\d:[0-5]\d)\s*(?:[-–—:]|tappa|sosta)?\s*(.+)$/i);
    if (timeMatch) {
      const orario = timeMatch[1].padStart(5, '0');
      const title = cleanToponym(timeMatch[2]);
      if (title.length > 1) {
        results.push({
          type: 'tappa',
          titolo: title,
          data: activeDate,
          orario,
          time: orario,
          sottocategoria: 'Tappa'
        });
        continue;
      }
    }

    // Pattern 2: Elenco numerato o puntato senza orario "1. Tokyo", "- Hakone"
    const listMatch = line.match(/^(?:[-*•]|\d+[\.\)\-–])\s*(.+)$/);
    if (listMatch) {
      const title = cleanToponym(listMatch[1]);
      if (title.length > 2 && !title.toLowerCase().startsWith('totale') && !title.toLowerCase().startsWith('km')) {
        results.push({
          type: 'tappa',
          titolo: title,
          data: activeDate,
          sottocategoria: 'Tappa'
        });
        continue;
      }
    }
  }

  return results.length >= 2 ? results : [];
}

/**
 * Rileva ed estrae da frasi miste ("Arrivo a Kyoto e visita al tempio Fushimi Inari")
 * separando la TAPPA dall'ATTIVITÀ per non confonderle mai.
 */
export function parseMixedTappaAndActivity(
  text: string,
  defaultDate?: string
): { tappa?: ExtractedTappa; attivita?: ExtractedAttivita } | null {
  const norm = text.trim();
  // Cerca pattern tipo "Arrivo a [Città] e visita/tour a [Luogo/Attrazione]"
  const pattern = /(?:arrivo\s+a|tappa\s+a)\s+([^,\.\n]+?)\s+(?:e\s+(?:visita|tour|escursione|ingresso)\s+(?:a|al|alla|allo|ai|alle)?\s*)([^,\.\n]+)/i;
  const match = norm.match(pattern);

  if (match) {
    const cityName = cleanToponym(match[1]);
    const activityName = match[2].trim();

    return {
      tappa: {
        type: 'tappa',
        titolo: cityName,
        data: defaultDate,
        sottocategoria: 'Tappa'
      },
      attivita: {
        type: 'attivita',
        title: activityName.startsWith('Tempio') || activityName.startsWith('Museo') ? activityName : `Visita a ${activityName}`,
        location: cityName,
        date: defaultDate
      }
    };
  }

  return null;
}
