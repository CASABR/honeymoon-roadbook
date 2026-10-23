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
      description: "Compila questo array SE nel documento/testo sono presenti 2 o più prenotazioni distinte (es. volo andata + volo ritorno, oppure hotel + attività, oppure conferme multiple).",
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

/** Modello di fallback predefinito */
/** Modello di default ufficiale */
export let GEMINI_MODEL = 'gemini-3.1-flash-lite';

// Modelli supportati in ordine di disponibilità ed efficienza verificata:
// gemini-3.1-flash-lite e 3.5-flash-lite rispondono in pochi secondi senza sovraccarico 503
export const PREFERRED_GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest'
];

// Cache in memoria del modello verificato funzionante
let cachedWorkingModel: string | null = null;

/**
 * Risolve dinamicamente il miglior modello Gemini disponibile per la chiave API corrente.
 * Se listModels ha successo, sceglie tra i modelli Flash moderni supportati (priorità a gemini-3.1-flash-lite).
 */
export async function getWorkingGeminiModel(cleanKey: string): Promise<string> {
  if (cachedWorkingModel) return cachedWorkingModel;

  try {
    const listController = new AbortController();
    const listTimeout = setTimeout(() => listController.abort(), 4000);
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    const res = await fetch(listUrl, { signal: listController.signal });
    clearTimeout(listTimeout);

    if (res.ok) {
      const data = await res.json();
      const models: Array<{ name: string; supportedGenerationMethods?: string[] }> = data.models || [];
      const supported = models.filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'));
      
      if (supported.length > 0) {
        // Normalizza il nome (es: "models/gemini-3.1-flash-lite" -> "gemini-3.1-flash-lite")
        const cleanNames = supported.map(m => m.name.replace(/^models\//, ''));
        
        const match = PREFERRED_GEMINI_MODELS.find(pref => cleanNames.includes(pref));
        if (match) {
          cachedWorkingModel = match;
          GEMINI_MODEL = match;
          return match;
        }
      }
    }
  } catch (e) {
    console.warn('[Gemini] Fallback automatico su modello default a causa di errore listModels:', e);
  }

  cachedWorkingModel = 'gemini-3.1-flash-lite';
  return 'gemini-3.1-flash-lite';
}

/**
 * Risolve la chiave API: 
 * Modello BYOK (Bring Your Own Key) sicuro.
 * La chiave viene letta esclusivamente da localStorage ('gemini_api_key'),
 * memorizzata privatamente sul dispositivo dell'utente.
 * Nessuna chiave statica di ambiente viene incorporata o letta dal bundle pubblico di produzione.
 */
export function resolveGeminiApiKey(): string {
  let apiKey: string | null | undefined = null;
  if (typeof localStorage !== 'undefined') {
    apiKey = localStorage.getItem('gemini_api_key');
  }
  const cleaned = (apiKey || '').trim().replace(/['"]/g, '').trim();
  if (cleaned.includes('la_tua_chiave')) {
    return '';
  }
  return cleaned;
}

/** Chiamata a Gemini tramite REST API diretta con fallback automatico e gestione diagnostica HTTP accurata. */
async function callGemini(requestBody: any): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const rawApiKey = resolveGeminiApiKey();
    if (!rawApiKey) {
      return { 
        ok: false, 
        error: 'Chiave API Gemini mancante o non configurata. Inserisci la tua chiave API Google AI nelle Impostazioni o direttamente qui sotto.' 
      };
    }
    const cleanKey = rawApiKey.trim().replace(/['"]/g, '');

    // Seleziona modello iniziale
    const initialModel = await getWorkingGeminiModel(cleanKey);
    const candidateModels = [
      initialModel,
      ...PREFERRED_GEMINI_MODELS.filter(m => m !== initialModel)
    ];

    let lastErrorMsg = '';

    for (const modelToUse of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${cleanKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8500);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          cachedWorkingModel = modelToUse;
          GEMINI_MODEL = modelToUse;
          const responseJson = await response.json();
          const parts = responseJson?.candidates?.[0]?.content?.parts || [];
          const rawText = parts.map((p: any) => p?.text || '').join('');

          if (!rawText) return { ok: false, error: 'Risposta vuota o formato non valido.' };
          return { ok: true, text: rawText };
        }

        const errText = await response.text();
        let parsedErr: any = null;
        try {
          parsedErr = JSON.parse(errText);
        } catch {
          parsedErr = null;
        }

        const gError = parsedErr?.error || parsedErr;
        const errMsg = gError?.message || errText;
        console.warn(`[Gemini API] Modello ${modelToUse} HTTP ${response.status}:`, errMsg);

        // 401 / 403: Credenziali o permessi non validi -> non riprovare altri modelli con la stessa chiave
        if (response.status === 401 || response.status === 403) {
          return { 
            ok: false, 
            error: `Errore credenziali API Gemini (${response.status}): la chiave non è autorizzata o è scaduta. Inserisci una chiave Google AI valida.` 
          };
        }

        // 400: Parametri non validi
        if (response.status === 400) {
          return { 
            ok: false, 
            error: `Richiesta non valida per il modello ${modelToUse} (${response.status}): ${errMsg}` 
          };
        }

        // 429: Limite di utilizzo (Rate Limit)
        if (response.status === 429) {
          lastErrorMsg = `Limite richieste per ${modelToUse} (429). Tentativo su modello alternativo...`;
          continue;
        }

        // 404: Modello non disponibile
        if (response.status === 404) {
          lastErrorMsg = `Modello ${modelToUse} non disponibile (404). Tentativo su modello alternativo...`;
          continue;
        }

        // 503: Servizio temporaneamente non disponibile / sovraccarico
        if (response.status === 503) {
          lastErrorMsg = `Modello ${modelToUse} momentaneamente sovraccarico (503). Tentativo su modello alternativo...`;
          continue;
        }

        lastErrorMsg = `Errore API Gemini (${response.status}): ${errMsg}`;
      } catch (networkErr: any) {
        clearTimeout(timeoutId);
        const isTimeout = networkErr.name === 'AbortError';
        const msg = isTimeout ? `Tempo scaduto su ${modelToUse} (timeout 8s). Tentativo su modello alternativo...` : (networkErr.message || 'Errore di connessione a Gemini');
        console.warn(`[Gemini Network Error] su ${modelToUse}:`, msg);
        lastErrorMsg = msg;
      }
    }

    return { 
      ok: false, 
      error: lastErrorMsg || 'Tutti i modelli Gemini configurati sono momentaneamente occupati o non raggiungibili.' 
    };
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

// ─── Helper conversione entità estratta da JSON ────────────────────────────────
export function parseEntityItem(item: any): ExtractedEntity | null {
  if (!item || typeof item !== 'object') return null;
  const entityType: ExtractedEntityType = item.entityType || 'sconosciuto';

  if (entityType === 'alloggio' && item.alloggio) {
    return { type: 'alloggio', ...item.alloggio } as ExtractedAlloggio;
  }
  if (entityType === 'tappa' && item.tappa) {
    return { type: 'tappa', ...item.tappa } as ExtractedTappa;
  }
  if (entityType === 'trasporto' && item.trasporto) {
    return { type: 'trasporto', ...item.trasporto } as ExtractedTrasporto;
  }
  if (entityType === 'attivita' && item.attivita) {
    return { type: 'attivita', ...item.attivita } as ExtractedAttivita;
  }
  if (entityType === 'ristorante' && item.ristorante) {
    return { type: 'ristorante', ...item.ristorante } as ExtractedRistorante;
  }
  if (entityType === 'shopping' && item.shopping) {
    return { type: 'shopping', ...item.shopping } as ExtractedShopping;
  }
  return null;
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
  if (Array.isArray(parsed?.multipleBookings) && parsed.multipleBookings.length > 0) {
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

  // Estrai mimeType e rawBase64
  let mimeType = attachment.type === 'pdf' ? 'application/pdf' : 'image/jpeg';
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
