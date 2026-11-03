import { callHouniAi } from './houniAiGateway';

/**
 * aiExtractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Servizio client-side di estrazione dati con Gemini AI.
 */

/**
 * Servizio client-side di estrazione dati con Gemini AI.
 * Invia le richieste al gateway callable autenticato di HouniAI.
 *
 * Modalità:
 *  - 'import' : Importazione Voucher/Testo → estrae campi strutturati per il database.
 *  - 'chat'   : Concierge / domanda libera → risposta testuale (tipo 'info'), mai errore di parsing.
 *  - 'auto'   : decide l'AI; se non riconosce una prenotazione si ricade su 'chat'.
 */

export type ExtractedEntityType = 'alloggio' | 'tappa' | 'trasporto' | 'attivita' | 'ristorante' | 'shopping' | 'sconosciuto' | 'info';

export type AIMode = 'import' | 'chat' | 'auto';

export interface ExtractedAlloggio {
  type: 'alloggio';
  name: string;
  location: string;
  address: string;
  checkIn: string;        // YYYY-MM-DD
  checkOut: string;       // YYYY-MM-DD
  checkInTime?: string;   // HH:mm
  checkOutTime?: string;  // HH:mm
  cost?: string;          // es. "150.00"
  bookingCode?: string;
  bookingUrl?: string;
  notes?: string;
}

export interface ExtractedTappa {
  type: 'tappa';
  titolo: string;
  data?: string;          // YYYY-MM-DD
  orario?: string;        // HH:mm
  time?: string;          // HH:mm alias
  indirizzo?: string;     // Indirizzo o località leggibile
  mapsUrl?: string;       // Link Google Maps
  nota?: string;
  sottocategoria?: string;
}

export interface ExtractedTrasporto {
  type: 'trasporto';
  tipoTrasporto: 'volo' | 'treno' | 'traghetto' | 'auto' | 'transfer' | 'taxi';
  date: string;           // YYYY-MM-DD
  departureTime?: string; // HH:mm
  arrivalDate?: string;   // YYYY-MM-DD
  arrivalTime?: string;   // HH:mm
  departureLocation: string;
  arrivalLocation: string;
  layover?: {
    airport: string;
    duration?: string;
    arrivalTime?: string;
    departureTime?: string;
    departureDate?: string;
    arrivalDate?: string;
    carrier?: string;
  };
  carrier?: string;
  bookingCode?: string;
  cost?: string;
  notes?: string;
}

export interface ExtractedAttivita {
  type: 'attivita';
  title: string;
  location: string;
  date?: string;          // YYYY-MM-DD
  time?: string;          // HH:mm
  cost?: string;
  bookingCode?: string;
  notes?: string;
}

export interface ExtractedRistorante {
  type: 'ristorante';
  name: string;
  location: string;
  date?: string;          // YYYY-MM-DD
  time?: string;          // HH:mm
  cost?: string;
  notes?: string;
}

/** Suggerimento opzionale del Concierge, aggiungibile all'itinerario con un tap. */
export interface ConciergeSuggestion {
  category: 'attivita' | 'ristorante' | 'tappa';
  title: string;
  location?: string;
}

export interface ExtractedShopping {
  type: 'shopping';
  nome: string;
  indirizzo?: string;
  data?: string;          // YYYY-MM-DD
  orario?: string;        // HH:mm
  budget?: string;
  nota?: string;
  sottocategoria?: string;
}

export interface ExtractedInfo {
  type: 'info';
  message: string;
  suggestion?: ConciergeSuggestion;
}

export type ExtractedEntity = ExtractedAlloggio | ExtractedTappa | ExtractedTrasporto | ExtractedAttivita | ExtractedRistorante | ExtractedShopping | ExtractedInfo;

export interface AIExtractionResult {
  success: boolean;
  entityType: ExtractedEntityType;
  data?: ExtractedEntity;
  multipleItems?: ExtractedEntity[];
  raw?: string;
  error?: string;
}

// ─── Schema suggerimento (riusato in entrambi gli schemi) ─────────────────────
const SUGGESTION_SCHEMA = {
  type: "object",
  description: "Facoltativo: il singolo luogo/attività più consigliato, da proporre come aggiunta all'itinerario.",
  properties: {
    category: { type: "string", enum: ["attivita", "ristorante", "tappa"] },
    title: { type: "string", description: "Nome del luogo o dell'attività" },
    location: { type: "string", description: "Indirizzo o città" }
  },
  required: ["category", "title"]
};

// ─── JSON Schema per Gemini Structured Outputs (modalità import) ──────────────
const SINGLE_BOOKING_PROPERTIES = {
  entityType: {
    type: "string",
    enum: ["alloggio", "tappa", "trasporto", "attivita", "ristorante", "shopping", "info", "sconosciuto"],
    description: "Tipo di entità estratta"
  },
  alloggio: {
    type: "object",
    description: "Dati alloggio. Solo per pernottamenti (hotel, resort, b&b, appartamento). NON per attrazioni o tour.",
    properties: {
      name: { type: "string", description: "Nome hotel / struttura" },
      location: { type: "string", description: "Città o zona" },
      address: { type: "string", description: "Indirizzo completo o link Maps" },
      checkIn: { type: "string", description: "Data check-in nel formato YYYY-MM-DD" },
      checkOut: { type: "string", description: "Data check-out nel formato YYYY-MM-DD" },
      checkInTime: { type: "string", description: "Ora check-in nel formato HH:mm, se specificata" },
      checkOutTime: { type: "string", description: "Ora check-out nel formato HH:mm, se specificata" },
      cost: { type: "string", description: "Costo totale in euro o valuta come stringa numerica decimale, es. '199.50'" },
      bookingCode: { type: "string", description: "Codice prenotazione, PNR o numero conferma" },
      bookingUrl: { type: "string", description: "URL prenotazione se presente" },
      notes: { type: "string", description: "Note aggiuntive, tipo camera, condizioni, istruzioni check-in" }
    },
    required: ["name", "location", "checkIn", "checkOut"]
  },
  tappa: {
    type: "object",
    description: "Dati tappa, sosta o fermata dell'itinerario a piedi o in auto.",
    properties: {
      titolo: { type: "string", description: "Titolo o nome della tappa / sosta (es. 'Bridge of Remembrance e passeggiata lungo l\\'Avon')" },
      data: { type: "string", description: "Data visita nel formato YYYY-MM-DD" },
      orario: { type: "string", description: "Orario della tappa nel formato HH:mm, se presente (es. '15:30')" },
      indirizzo: { type: "string", description: "Indirizzo testuale leggibile o luogo (NON URL Maps lunghi)" },
      mapsUrl: { type: "string", description: "URL o link a Google Maps se fornito separatamente" },
      nota: { type: "string", description: "Note o informazioni sulla tappa" }
    },
    required: ["titolo"]
  },
  trasporto: {
    type: "object",
    description: "Dati trasporto. Per voli con scalo compila l'oggetto layover e usa arrivalDate per l'arrivo finale.",
    properties: {
      tipoTrasporto: { type: "string", enum: ["volo", "treno", "traghetto", "auto", "transfer", "taxi"] },
      date: { type: "string", description: "Data partenza nel formato YYYY-MM-DD" },
      departureTime: { type: "string", description: "Orario partenza HH:mm" },
      arrivalDate: { type: "string", description: "Data arrivo a destinazione finale YYYY-MM-DD se diversa da partenza" },
      arrivalTime: { type: "string", description: "Orario arrivo alla destinazione finale HH:mm" },
      departureLocation: { type: "string", description: "Aeroporto/stazione/porto o luogo di partenza" },
      arrivalLocation: { type: "string", description: "Aeroporto/stazione/porto o luogo di arrivo (destinazione finale)" },
      layover: {
        type: "object",
        description: "Dati scalo intermedio, da compilare SOLO se il volo/viaggio prevede uno scalo.",
        properties: {
          airport: { type: "string", description: "Aeroporto o città di scalo" },
          duration: { type: "string", description: "Durata dello scalo (es. '3h 20m')" },
          arrivalTime: { type: "string", description: "Orario di arrivo allo scalo HH:mm" },
          departureTime: { type: "string", description: "Orario di ripartenza dallo scalo HH:mm" },
          departureDate: { type: "string", description: "Data ripartenza dallo scalo YYYY-MM-DD (se diversa)" },
          carrier: { type: "string", description: "Compagnia aerea della seconda tratta (se diversa)" }
        },
        required: ["airport"]
      },
      carrier: { type: "string", description: "Compagnia aerea, numero volo (es. EK412), operatore o fornitore" },
      bookingCode: { type: "string", description: "Codice prenotazione, PNR o numero biglietto" },
      cost: { type: "string", description: "Costo come stringa numerica decimale" },
      notes: { type: "string", description: "Note aggiuntive, posti a sedere, franchigia bagagli, terminal/gate" }
    },
    required: ["tipoTrasporto", "date", "departureLocation", "arrivalLocation"]
  },
  attivita: {
    type: "object",
    description: "Dati attività (musei, parchi, zoo, tour guidati, escursioni, spettacoli, traghetti panoramici, attrazioni).",
    properties: {
      title: { type: "string", description: "Nome dell'attività o fornitore" },
      location: { type: "string", description: "Indirizzo o città dell'attività" },
      date: { type: "string", description: "Data attività nel formato YYYY-MM-DD" },
      time: { type: "string", description: "Ora di inizio / ritrovo nel formato HH:mm" },
      cost: { type: "string", description: "Costo totale dell'attività" },
      bookingCode: { type: "string", description: "Codice prenotazione, voucher o numero biglietto" },
      notes: { type: "string", description: "Note aggiuntive, istruzioni accesso, fornitore" }
    },
    required: ["title", "location"]
  },
  ristorante: {
    type: "object",
    description: "Dati ristorante (pranzi, cene, degustazioni).",
    properties: {
      name: { type: "string", description: "Nome del ristorante/locale" },
      location: { type: "string", description: "Indirizzo del locale" },
      date: { type: "string", description: "Data del pasto nel formato YYYY-MM-DD" },
      time: { type: "string", description: "Ora della prenotazione nel formato HH:mm" },
      cost: { type: "string", description: "Costo preventivato/pagato" },
      notes: { type: "string", description: "Note aggiuntive" }
    },
    required: ["name", "location"]
  },
  shopping: {
    type: "object",
    description: "Dati per shopping, acquisti, mercati, rifornimento carburante o negozi.",
    properties: {
      nome: { type: "string", description: "Nome del negozio, mercato o centro commerciale" },
      indirizzo: { type: "string", description: "Indirizzo o città" },
      data: { type: "string", description: "Data prevista nel formato YYYY-MM-DD" },
      orario: { type: "string", description: "Orario nel formato HH:mm" },
      budget: { type: "string", description: "Budget stimato o spesa (solo numero/importo)" },
      nota: { type: "string", description: "Cosa comprare, lista o note" },
      sottocategoria: { type: "string", description: "Es: 'Abbigliamento', 'Souvenir', 'Carburante', 'Alimentari'" }
    },
    required: ["nome"]
  },
  info: {
    type: "object",
    description: "Risposta a una domanda o richiesta dell'utente.",
    properties: {
      message: { type: "string", description: "Risposta sintetica con opzioni e link Maps." },
      suggestions: { type: "array", items: SUGGESTION_SCHEMA }
    },
    required: ["message"]
  }
};

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    ...SINGLE_BOOKING_PROPERTIES,
    multipleBookings: {
      type: "array",
      description: "Compila questo array SE nel documento/testo sono presenti 2 o più entità distinte (es. elenco di tappe separate a piedi, soste, voli andata + ritorno, hotel + attività, ristoranti multipli). Se l'utente specifica N tappe o elenca N orari separati, questo array DEVE contenere esattamente N elementi distinti!",
      items: {
        type: "object",
        properties: SINGLE_BOOKING_PROPERTIES,
        required: ["entityType"]
      }
    },
    items: {
      type: "array",
      description: "Alias di multipleBookings",
      items: {
        type: "object",
        properties: SINGLE_BOOKING_PROPERTIES,
        required: ["entityType"]
      }
    }
  },
  required: ["entityType"]
};

// ─── JSON Schema modalità Concierge (chat) ────────────────────────────────────
const CHAT_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string", description: "Risposta discorsiva all'utente, in italiano." },
    suggestions: { 
      type: "array", 
      description: "Lista di proposte suggerite dall'assistente (ristoranti, attività, etc.) in base alla richiesta dell'utente.",
      items: SUGGESTION_SCHEMA 
    }
  },
  required: ["message"]
};

const SYSTEM_PROMPT = `Sei un assistente specializzato nell'estrarre informazioni strutturate da conferme di prenotazione viaggi, email e note di testo.

Categorie ammesse:
- attivita: musei, parchi, zoo, tour, escursioni, spettacoli (Es. "Prenotazione per Zoo Safari Fasano" => attivita).
- alloggio: SOLO per pernottamenti (hotel, b&b, resort, appartamenti). Non includere zoo o parchi qui.
- trasporto: voli, treni, traghetti, noleggi auto, transfer e taxi.
- ristorante: pranzi, cene, degustazioni.
- shopping: acquisti, negozi, centri commerciali, mercati, souvenir, rifornimenti.
- tappa: città, spostamenti generali dell'itinerario.
- info: Se l'utente fa domande (cibo, meteo, soste, tappe, orari) o il testo NON contiene una prenotazione chiara. La risposta deve essere sintetica: 2-3 opzioni concrete con link diretto a Google Maps.

Esempi di classificazione (Few-Shot):
Testo: "Abbiamo preso i biglietti per lo Zoo di Fasano per il 28 Novembre a 50 euro"
Risposta corretta: entityType: "attivita", attivita: { title: "Zoo di Fasano", location: "Fasano", date: "2026-11-28", cost: "50" }

Testo: "Prenotazione all'Hotel Excelsior dal 1 al 3 dicembre"
Risposta corretta: entityType: "alloggio", alloggio: { name: "Hotel Excelsior", location: "Roma", checkIn: "2026-12-01", checkOut: "2026-12-03" }

Testo: "Dove mangiamo stasera a Tokyo?"
Risposta corretta: entityType: "info", info: { message: "..." }

Il tuo compito:
1. Identifica il tipo di entità.
2. Estrai i campi formattando date in YYYY-MM-DD e orari in HH:mm.
3. Se estrai un importo/costo, formattalo SEMPRE come numero semplice o decimale (es. "1250.50" o "319"), senza NESSUN separatore delle migliaia (non usare MAI "1.250,50" o "406.075"). Usa il punto per i decimali.
4. Se è una richiesta di "info", usa le informazioni di contesto fornite (Data, Città, Posizione) per dare suggerimenti mirati.
5. Non usare MAI "sconosciuto" se puoi rispondere come "info".
6. REGOLE CRITICHE PER TAPPE MULTIPLE ED ELENCHI DI SOSTE:
- Se il testo contiene un elenco di tappe, soste o orari distinti (es. "inserisci le seguenti tappe: 15:30 tappa A, 15:55 tappa B, 16:30 tappa C, 17:00 tappa D, 17:35 tappa E..."):
  * DEVI OBBLIGATORIAMENTE restituire ogni singola tappa come elemento distinto nell'array "multipleBookings".
  * Se nel testo ci sono 5 tappe, multipleBookings DEVE contenere ESATTAMENTE 5 elementi!
  * NON ACCORPARE MAI tappe o orari separati in un'unica entità o passeggiata riassuntiva!
  * NON cambiare la categoria in "attivita/passeggiata" quando l'utente richiede "tappe separate". Mantieni entityType: "tappa" per ciascuna.
  * La categoria predefinita per le tappe è "Tappa" generica (sottocategoria non specificata o "Tappa"): NON dedurre automaticamente "Sosta panoramica" o altre categorie specialistiche se non esplicitamente richieste nel testo.
  * Preserva esattamente per ciascuna tappa: titolo fedele, orario (formato HH:mm, es. "15:30") nel campo "orario", e data (YYYY-MM-DD).
  * Non inserire URL Google Maps nel campo indirizzo: usa il campo "mapsUrl" solo se fornito separatamente.
7. REGOLE PER WAYPOINT E PERCORSI STRADALI:
- Distingui rigorosamente i waypoint intermedi o puramente stradali di navigazione (es. transiti su autostrade come Playford Hwy o Western Hwy, bivi, rotonde) dalle VERE TAPPE turistiche.
- I waypoint puramente stradali NON devono essere trasformati in tappe autonome dell'itinerario a meno che l'utente non lo richieda esplicitamente come fermata programmata con orario.
- Non estrarre MAI fermate o incroci omonimi geograficamente incompatibili (es. Stawell in Victoria) se il contesto del percorso o del giorno è su un'altra isola o regione (es. Kangaroo Island).`;

const CHAT_PROMPT = `Sei Houni AI, il Concierge di viaggio di una coppia in luna di miele.
Rispondi in italiano, in modo caldo ma sintetico (max ~120 parole), a domande su cibo, meteo, tappe, orari, trasporti e consigli pratici.
- Quando consigli luoghi, proponi 2-3 opzioni concrete, ognuna con un link Google Maps nel formato https://www.google.com/maps/search/?api=1&query=NOME+CITTA
- Usa il contesto fornito (data, viaggio, città) per risposte mirate.
- Se esiste un'opzione chiaramente migliore, compilala anche nel campo "suggestion" (categoria attivita, ristorante o tappa).
- Se non conosci un dato in tempo reale (es. meteo esatto), dillo e dai un consiglio utile comunque.`;

// ─── Euristica: il testo è una domanda discorsiva? ────────────────────────────
const QUESTION_START = /^(dove|cosa|come|quando|quale|quali|quanto|quanti|chi|perch[eé]|consigli|suggerisci|meglio|c'?è|ci sono|che tempo|meteo|orari)/i;
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length > 400) return false; // i voucher sono lunghi
  return t.endsWith('?') || QUESTION_START.test(t);
}



// ─── Utility: Estrazione testo da HTML ──────────────────────────────────────────
export function stripHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Rimuovi script e style
  const scriptsAndStyles = doc.querySelectorAll('script, style');
  scriptsAndStyles.forEach(el => el.remove());
  return doc.body.textContent || doc.body.innerText || '';
}

/** Caching in-memory per risposte del Concierge */
const apiCache = new Map<string, { data: any, ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

async function callGemini(requestBody: any): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return callHouniAi(requestBody);
}

const sanitizeSuggestion = (s: any): ConciergeSuggestion | undefined => {
  if (!s || typeof s.title !== 'string' || !s.title.trim()) return undefined;
  const category = ['attivita', 'ristorante', 'tappa'].includes(s.category) ? s.category : 'attivita';
  return { category, title: s.title.trim(), location: typeof s.location === 'string' ? s.location.trim() : undefined };
};

const infoResult = (message: string, suggestion?: any, raw?: string): AIExtractionResult => ({
  success: true,
  entityType: 'info',
  data: { type: 'info', message: message.trim(), suggestion: sanitizeSuggestion(suggestion) },
  raw
});

/** Modalità Concierge: restituisce sempre un 'info' se l'API risponde. */
export async function askConcierge(_text: string, contextStr: string, cleanTextOverride?: string): Promise<AIExtractionResult> {
  const cleanText = cleanTextOverride || stripHtml(_text);
  
  const cacheKey = `concierge_${cleanText}_${contextStr}`;
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const res = await callGemini({
    system_instruction: { parts: [{ text: CHAT_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `CONTESTO: ${contextStr}\n\nDOMANDA: ${cleanText.slice(0, 4000)}` }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: CHAT_SCHEMA
    }
  });

  if (!res.ok) return { success: false, entityType: 'sconosciuto', error: res.error };

  let finalResult: AIExtractionResult;
  try {
    const parsed = JSON.parse(res.text);
    if (parsed?.message) {
      finalResult = infoResult(parsed.message, parsed.suggestion || (parsed.suggestions && parsed.suggestions[0]), res.text);
      apiCache.set(cacheKey, { data: finalResult, ts: Date.now() });
      return finalResult;
    }
  } catch {
    // JSON troncato o non valido
  }
  const plain = res.text.replace(/^\s*\{?\s*"message"\s*:\s*"/, '').replace(/"\s*,?\s*("suggestion"[\s\S]*)?\}?\s*$/, '').replace(/\\n/g, '\n');
  finalResult = infoResult(plain || 'Non sono riuscito a formulare una risposta. Prova a riformulare.', undefined, res.text);
  apiCache.set(cacheKey, { data: finalResult, ts: Date.now() });
  return finalResult;
}

// ─── Helper conversione entità estratta da JSON ────────────────────────────────
export function parseEntityItem(item: any): ExtractedEntity | null {
  if (!item || typeof item !== 'object') return null;
  const entityType: ExtractedEntityType = item.entityType || (item.type ? item.type : 'sconosciuto');

  if (entityType === 'alloggio' || item.alloggio) {
    const a = item.alloggio || item;
    return { type: 'alloggio', ...a } as ExtractedAlloggio;
  }
  if (entityType === 'tappa' || item.type === 'tappa' || (item.titolo && !item.tipoTrasporto)) {
    const t = item.tappa || item;
    return {
      type: 'tappa',
      titolo: t.titolo || t.title || 'Tappa',
      data: t.data || t.date,
      orario: t.orario || t.time,
      time: t.orario || t.time,
      indirizzo: t.indirizzo || t.address || t.location,
      mapsUrl: t.mapsUrl || t.link,
      nota: t.nota || t.notes,
      sottocategoria: t.sottocategoria
    } as ExtractedTappa;
  }
  if (entityType === 'trasporto' || item.trasporto || item.tipoTrasporto) {
    const tr = item.trasporto || item;
    return { type: 'trasporto', ...tr } as ExtractedTrasporto;
  }
  if (entityType === 'attivita' || item.attivita) {
    const act = item.attivita || item;
    return { type: 'attivita', ...act } as ExtractedAttivita;
  }
  if (entityType === 'ristorante' || item.ristorante) {
    const r = item.ristorante || item;
    return { type: 'ristorante', ...r } as ExtractedRistorante;
  }
  if (entityType === 'shopping' || item.shopping) {
    const s = item.shopping || item;
    return { type: 'shopping', ...s } as ExtractedShopping;
  }
  return null;
}

/**
 * Riconosce elenchi strutturati espliciti di tappe/soste con orari nel testo
 * (es. "15:30 tappa A\n15:55 tappa B..."), garantendo estrazione deterministica a 0 errori
 */
export function tryExtractMultipleTappe(text: string, defaultDate?: string): ExtractedTappa[] | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let extractedDate = defaultDate;
  const dateMatchIso = text.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
  const dateMatchIt = text.match(/\b([0-3]?\d)[\/\-\.]([01]?\d)(?:[\/\-\.](202\d))?\b/);
  const dateMatchText = text.match(/\b([0-3]?\d)\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(202\d))?\b/i);

  if (dateMatchIso) {
    extractedDate = dateMatchIso[1];
  } else if (dateMatchText) {
    const day = dateMatchText[1].padStart(2, '0');
    const months: Record<string, string> = {
      gennaio: '01', febbraio: '02', marzo: '03', aprile: '04',
      maggio: '05', giugno: '06', luglio: '07', agosto: '08',
      settembre: '09', ottobre: '10', novembre: '11', dicembre: '12'
    };
    const month = months[dateMatchText[2].toLowerCase()] || '12';
    const year = dateMatchText[3] || '2026';
    extractedDate = `${year}-${month}-${day}`;
  } else if (dateMatchIt) {
    const day = dateMatchIt[1].padStart(2, '0');
    const month = dateMatchIt[2].padStart(2, '0');
    const year = dateMatchIt[3] || '2026';
    extractedDate = `${year}-${month}-${day}`;
  }

  const items: ExtractedTappa[] = [];
  const linePattern = /^(?:[-*•]|\d+[\.\)\-–])?\s*([0-2]?\d:[0-5]\d)\s*(?:[-–—:]|tappa|sosta)?\s*(.+)$/i;

  for (const line of lines) {
    const m = line.match(linePattern);
    if (m) {
      const orario = m[1].padStart(5, '0');
      let title = m[2].trim();
      title = title.replace(/^(?:tappa|sosta)\s*[:\-–]?\s*/i, '').trim();
      if (title.length > 2) {
        items.push({
          type: 'tappa',
          titolo: title,
          data: extractedDate,
          orario,
          time: orario
        });
      }
    }
  }

  return items.length >= 2 ? items : null;
}

export function parseAIResponse(rawJsonText: string): AIExtractionResult {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    parsed = null;
  }

  if (parsed?.info?.message) {
    return infoResult(parsed.info.message, parsed.info.suggestions?.[0], rawJsonText);
  }

  const multipleItems: ExtractedEntity[] = [];
  const rawList = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.multipleBookings) ? parsed.multipleBookings
      : (Array.isArray(parsed?.items) ? parsed.items
        : (Array.isArray(parsed?.tappe) ? parsed.tappe
          : (Array.isArray(parsed?.entities) ? parsed.entities : []))));

  if (rawList.length > 0) {
    for (const b of rawList) {
      const parsedItem = parseEntityItem(b);
      if (parsedItem) multipleItems.push(parsedItem);
    }
  }

  const primaryItem = parseEntityItem(parsed);

  if (multipleItems.length > 1) {
    const mainItem = primaryItem || multipleItems[0];
    return {
      success: true,
      entityType: mainItem.type,
      data: mainItem,
      multipleItems,
      raw: rawJsonText
    };
  }

  if (primaryItem) {
    return {
      success: true,
      entityType: primaryItem.type,
      data: primaryItem,
      multipleItems: multipleItems.length > 0 ? multipleItems : undefined,
      raw: rawJsonText
    };
  }

  if (multipleItems.length === 1) {
    return {
      success: true,
      entityType: multipleItems[0].type,
      data: multipleItems[0],
      raw: rawJsonText
    };
  }

  return {
    success: false,
    entityType: 'sconosciuto',
    raw: rawJsonText,
    error: 'Impossibile interpretare il formato dei dati.'
  };
}

/**
 * Esegue l'estrazione AI dal testo incollato oppure risponde come Concierge.
 * @param text        Testo da estrarre (email, note, ecc.) o domanda
 * @param contextStr  Contesto dinamico (data, viaggio, città)
 * @param mode        'import' | 'chat' | 'auto' (default)
 */
export async function extractFromText(
  text: string,
  contextStr: string = '',
  mode: AIMode = 'auto'
): Promise<AIExtractionResult> {
  const cleanText = stripHtml(text);

  if (!cleanText || !cleanText.trim()) {
    return {
      success: false,
      entityType: 'sconosciuto',
      error: 'Nessun testo fornito.'
    };
  }

  // Cache deduplicata per evitare doppie chiamate identiche e consumo inutile di quota
  const cacheKey = `extract_${cleanText.slice(0, 500)}_${contextStr}`;
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  // Riconoscimento prioritario per elenchi espliciti di tappe separate con orari
  const explicitTappe = tryExtractMultipleTappe(cleanText);
  if (explicitTappe && explicitTappe.length >= 2) {
    const result: AIExtractionResult = {
      success: true,
      entityType: 'tappa',
      data: explicitTappe[0],
      multipleItems: explicitTappe,
      raw: cleanText
    };
    apiCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  }

  // Modalità Concierge esplicita, o domanda evidente in modalità auto
  if (mode === 'chat' || (mode === 'auto' && looksLikeQuestion(cleanText))) {
    return askConcierge(cleanText, contextStr);
  }

  // ─── Modalità Importazione ───
  const res = await callGemini({
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [{
          text: `CONTESTO DINAMICO: ${contextStr}\n\nEstrai le informazioni strutturate dal seguente testo (o rispondi se è una domanda):\n\n---\n${cleanText.slice(0, 8000)}\n---`
        }]
      }
    ],
    generationConfig: {
      temperature: 0.1, // Temperatura bassa per estrazione precisa
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_SCHEMA
    }
  });

  if (!res.ok) return { success: false, entityType: 'sconosciuto', error: res.error };

  let parsed: any = null;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    parsed = null;
  }

  if (parsed?.info?.message) {
    return infoResult(parsed.info.message, parsed.info.suggestions?.[0], res.text);
  }

  // Controlla prenotazioni multiple
  const multipleItems: ExtractedEntity[] = [];
  if (Array.isArray(parsed?.multipleBookings) && parsed.multipleBookings.length > 0) {
    for (const b of parsed.multipleBookings) {
      const parsedItem = parseEntityItem(b);
      if (parsedItem) multipleItems.push(parsedItem);
    }
  }

  const primaryItem = parseEntityItem(parsed);

  if (multipleItems.length > 1) {
    const mainItem = primaryItem || multipleItems[0];
    const result: AIExtractionResult = {
      success: true,
      entityType: mainItem.type,
      data: mainItem,
      multipleItems,
      raw: res.text
    };
    apiCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  }

  if (primaryItem) {
    const result: AIExtractionResult = {
      success: true,
      entityType: primaryItem.type,
      data: primaryItem,
      multipleItems: multipleItems.length > 0 ? multipleItems : undefined,
      raw: res.text
    };
    apiCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  }

  // Fallback: nessuna prenotazione riconosciuta → rispondiamo come Concierge invece di fallire
  const concierge = await askConcierge(cleanText, contextStr);
  if (concierge.success) return concierge;
  return infoResult(
    'Non ho trovato una prenotazione chiara in questo testo (date, struttura o tratta mancanti).\n\n' +
    'Puoi incollare la conferma completa, oppure passare a "Chiedi al Concierge" se vuoi un consiglio.',
    undefined,
    res.text
  );
}

/**
 * Esegue l'estrazione AI da un allegato (PDF o Immagine) tramite input multimodale nativo di Gemini.
 * @param attachment File attachment con dataUrl (base64) e tipo
 * @param contextStr Contesto di viaggio corrente
 */
export async function extractFromAttachment(
  attachment: { name: string; type: 'pdf' | 'image'; dataUrl: string },
  contextStr: string = ''
): Promise<AIExtractionResult> {
  if (!attachment || !attachment.dataUrl) {
    return { success: false, entityType: 'sconosciuto', error: 'Nessun file fornito per l\'analisi.' };
  }

  if (attachment.type === 'pdf') {
    try {
      const { extractTextFromPdfDataUrl } = await import('./pdfTextExtractor');
      const extractedText = await extractTextFromPdfDataUrl(attachment.dataUrl);
      if (extractedText.trim().length < 30) {
        return {
          success: false,
          entityType: 'sconosciuto',
          error: 'Il PDF non contiene testo leggibile. I PDF scannerizzati richiedono una prova vision reale; inserisci i dati manualmente.'
        };
      }
      return extractFromText(`Documento: ${attachment.name}\n\n${extractedText}`, contextStr, 'import');
    } catch {
      return {
        success: false,
        entityType: 'sconosciuto',
        error: 'Non è stato possibile leggere il testo del PDF sul dispositivo. Inserisci i dati manualmente.'
      };
    }
  }

  // Estrai mimeType e rawBase64
  let mimeType = 'image/jpeg';
  let base64Data = attachment.dataUrl;

  if (attachment.dataUrl.startsWith('data:')) {
    const parts = attachment.dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    if (mimeMatch) mimeType = mimeMatch[1];
    base64Data = parts[1] || '';
  }

  const promptText = `CONTESTO DINAMICO: ${contextStr}\n\nEstrai TUTTI i dati della prenotazione dal documento allegato ("${attachment.name}").
Controlla con la massima precisione:
- tipologia della prenotazione (volo, hotel/alloggio, attivita/tour, treno, traghetto, noleggio auto, ristorante)
- nome della compagnia, struttura o fornitore
- data, orari e fuso orario se presenti
- luogo/aeroporto di partenza e arrivo o indirizzo completo
- codice di prenotazione (PNR), numero biglietto o voucher
- nominativi dei viaggiatori, posti, bagagli
- prezzo e valuta (riporta il costo come numero senza simboli)
- note, condizioni di cancellazione, orari check-in/out
Se il documento contiene più di una prenotazione (es. volo andata e volo ritorno, oppure hotel + transfer), inseriscile nel campo multipleBookings.`;

  const res = await callGemini({
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_SCHEMA
    }
  });

  if (!res.ok) return { success: false, entityType: 'sconosciuto', error: res.error };

  let parsed: any = null;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return { success: false, entityType: 'sconosciuto', error: 'Risposta non valida dall\'AI.' };
  }

  // Controlla se sono state estratte prenotazioni multiple
  const multipleItems: ExtractedEntity[] = [];
  if (Array.isArray(parsed.multipleBookings) && parsed.multipleBookings.length > 0) {
    for (const b of parsed.multipleBookings) {
      const parsedItem = parseEntityItem(b);
      if (parsedItem) multipleItems.push(parsedItem);
    }
  }

  const primaryItem = parseEntityItem(parsed);

  if (multipleItems.length > 1) {
    const mainItem = primaryItem || multipleItems[0];
    return {
      success: true,
      entityType: mainItem.type,
      data: mainItem,
      multipleItems,
      raw: res.text
    };
  }

  if (primaryItem) {
    return {
      success: true,
      entityType: primaryItem.type,
      data: primaryItem,
      multipleItems: multipleItems.length > 0 ? multipleItems : undefined,
      raw: res.text
    };
  }

  return {
    success: false,
    entityType: 'sconosciuto',
    error: 'Non è stato possibile identificare una prenotazione valida (alloggio, trasporto o attività) in questo allegato. Verifica che il testo o l\'immagine siano nitidi.'
  };
}
