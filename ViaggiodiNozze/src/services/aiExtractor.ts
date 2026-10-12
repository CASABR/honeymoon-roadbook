/**
 * aiExtractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Servizio client-side di estrazione dati con Gemini AI.
 */

/**
 * Servizio client-side di estrazione dati con Gemini AI.
 * Effettua la chiamata diretta all'API REST di Gemini tramite la chiave VITE_GEMINI_API_KEY.
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
  mapsUrl?: string;
  nota?: string;
}

export interface ExtractedTrasporto {
  type: 'trasporto';
  tipoTrasporto: 'volo' | 'treno' | 'traghetto' | 'auto' | 'transfer';
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
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    entityType: {
      type: "string",
      enum: ["alloggio", "tappa", "trasporto", "attivita", "ristorante", "shopping", "info", "sconosciuto"],
      description: "Tipo di entità principale estratta dal testo"
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
        cost: { type: "string", description: "Costo totale in euro come stringa numerica, es. '199.50'" },
        bookingCode: { type: "string", description: "Codice prenotazione o numero conferma" },
        bookingUrl: { type: "string", description: "URL prenotazione se presente" },
        notes: { type: "string", description: "Note aggiuntive, istruzioni check-in, informazioni utili" }
      },
      required: ["name", "location", "checkIn", "checkOut"]
    },
    tappa: {
      type: "object",
      description: "Dati tappa (città, spostamenti generali).",
      properties: {
        titolo: { type: "string", description: "Titolo o nome della tappa / destinazione" },
        data: { type: "string", description: "Data visita nel formato YYYY-MM-DD" },
        mapsUrl: { type: "string", description: "URL Google Maps o indirizzo" },
        nota: { type: "string", description: "Note o informazioni sulla tappa" }
      },
      required: ["titolo"]
    },
    trasporto: {
      type: "object",
      description: "Dati trasporto. Per voli con scalo compila l'oggetto layover e usa arrivalDate per l'arrivo finale.",
      properties: {
        tipoTrasporto: { type: "string", enum: ["volo", "treno", "traghetto", "auto", "transfer"] },
        date: { type: "string", description: "Data partenza nel formato YYYY-MM-DD" },
        departureTime: { type: "string", description: "Orario partenza HH:mm" },
        arrivalDate: { type: "string", description: "Data arrivo a destinazione finale YYYY-MM-DD se diversa da partenza" },
        arrivalTime: { type: "string", description: "Orario arrivo alla destinazione finale HH:mm" },
        departureLocation: { type: "string", description: "Aeroporto/stazione di partenza" },
        arrivalLocation: { type: "string", description: "Aeroporto/stazione di arrivo (destinazione finale)" },
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
        carrier: { type: "string", description: "Compagnia aerea principale, numero volo o operatore" },
        bookingCode: { type: "string", description: "Codice prenotazione" },
        cost: { type: "string", description: "Costo in euro come stringa numerica" },
        notes: { type: "string", description: "Note aggiuntive" }
      },
      required: ["tipoTrasporto", "date", "departureLocation", "arrivalLocation"]
    },
    attivita: {
      type: "object",
      description: "Dati attività (musei, parchi, zoo, tour, escursioni, spettacoli). NON è un alloggio.",
      properties: {
        title: { type: "string", description: "Nome dell'attività (es. Zoo di Fasano, Tour Colosseo)" },
        location: { type: "string", description: "Indirizzo o città dell'attività" },
        date: { type: "string", description: "Data attività nel formato YYYY-MM-DD" },
        time: { type: "string", description: "Ora di inizio nel formato HH:mm" },
        cost: { type: "string", description: "Costo totale dell'attività" },
        notes: { type: "string", description: "Note aggiuntive" }
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
      description: "Risposta a una domanda o richiesta dell'utente (es. dove mangiare, cosa fare).",
      properties: {
        message: { type: "string", description: "Risposta sintetica con 2-3 opzioni e link diretto a Google Maps." },
        suggestions: { type: "array", items: SUGGESTION_SCHEMA }
      },
      required: ["message"]
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
- trasporto: voli, treni, traghetti, noleggi auto, transfer.
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
5. Non usare MAI "sconosciuto" se puoi rispondere come "info".`;

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

/** Modello principale + fallback (i modelli gemini-1.5-* sono stati ritirati e restituiscono 404). */
export const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash';

/** Risolve la chiave API: .env → localStorage → default personale. */
export function resolveGeminiApiKey(): string {
  let apiKey: string | null | undefined = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('la_tua_chiave')) {
    apiKey = localStorage.getItem('gemini_api_key');
  }
  if (!apiKey || apiKey.includes('la_tua_chiave')) {
    apiKey = 'AQ.Ab8RN6Kxc93HHq3cDGA0Sv3XFgczoWKPiXUip9tgF88fixCHg';
  }
  return apiKey.trim();
}

/** Chiamata a Gemini tramite REST API diretta. Restituisce il testo grezzo della risposta. */
async function callGemini(requestBody: any, model: string = GEMINI_MODEL): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) return { ok: false, error: 'Chiave API Gemini mancante' };

    // Su gemini-2.5 il "thinking" consuma i maxOutputTokens: lo disattiviamo per risposte rapide e complete.
    const body = model.startsWith('gemini-2.5')
      ? { ...requestBody, generationConfig: { ...(requestBody?.generationConfig || {}), thinkingConfig: { thinkingBudget: 0 } } }
      : requestBody;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Gemini] ${model} → HTTP ${response.status}:`, errText);
      // Modello non disponibile: riprova una volta col modello di fallback
      if (response.status === 404 && model !== GEMINI_FALLBACK_MODEL) {
        return callGemini(requestBody, GEMINI_FALLBACK_MODEL);
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return { ok: false, error: `Errore API Gemini (${response.status}): chiave API non valida o non autorizzata.` };
      }
      return { ok: false, error: `Errore API Gemini (${response.status})` };
    }

    const responseJson = await response.json();
    const parts = responseJson?.candidates?.[0]?.content?.parts || [];
    const rawText = parts.map((p: any) => p?.text || '').join('');

    if (!rawText) return { ok: false, error: 'Risposta vuota o formato non valido.' };
    return { ok: true, text: rawText };
  } catch (error: any) {
    console.error('Errore chiamata Gemini REST API:', error);
    return { ok: false, error: `Errore rete: ${error.message || 'Sconosciuto'}` };
  }
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
      maxOutputTokens: 512,
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

  const entityType: ExtractedEntityType = parsed?.entityType || 'sconosciuto';

  if (entityType === 'alloggio' && parsed.alloggio) {
    return { success: true, entityType: 'alloggio', data: { type: 'alloggio', ...parsed.alloggio } as ExtractedAlloggio };
  }
  if (entityType === 'tappa' && parsed.tappa) {
    return { success: true, entityType: 'tappa', data: { type: 'tappa', ...parsed.tappa } as ExtractedTappa };
  }
  if (entityType === 'trasporto' && parsed.trasporto) {
    return { success: true, entityType: 'trasporto', data: { type: 'trasporto', ...parsed.trasporto } as ExtractedTrasporto };
  }
  if (entityType === 'attivita' && parsed.attivita) {
    return { success: true, entityType: 'attivita', data: { type: 'attivita', ...parsed.attivita } as ExtractedAttivita };
  }
  if (entityType === 'ristorante' && parsed.ristorante) {
    return { success: true, entityType: 'ristorante', data: { type: 'ristorante', ...parsed.ristorante } as ExtractedRistorante };
  }
  if (entityType === 'shopping' && parsed.shopping) {
    return { success: true, entityType: 'shopping', data: { type: 'shopping', ...parsed.shopping } as ExtractedShopping };
  }
  if (parsed?.info?.message) {
    return infoResult(parsed.info.message, parsed.info.suggestions?.[0], res.text);
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
