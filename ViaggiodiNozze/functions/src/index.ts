import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Definisco lo schema atteso dal modello
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    entityType: {
      type: "string",
      enum: ["alloggio", "tappa", "trasporto", "sconosciuto"],
      description: "Tipo di entità principale estratta dal testo"
    },
    alloggio: {
      type: "object",
      description: "Dati alloggio. Compila solo se entityType = alloggio",
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
      description: "Dati tappa. Compila solo se entityType = tappa",
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
      description: "Dati trasporto. Compila solo se entityType = trasporto",
      properties: {
        tipoTrasporto: { type: "string", enum: ["volo", "treno", "traghetto", "auto", "transfer"] },
        date: { type: "string", description: "Data partenza nel formato YYYY-MM-DD" },
        departureTime: { type: "string", description: "Orario partenza HH:mm" },
        arrivalDate: { type: "string", description: "Data arrivo YYYY-MM-DD se diversa da partenza" },
        arrivalTime: { type: "string", description: "Orario arrivo HH:mm" },
        departureLocation: { type: "string", description: "Aeroporto/stazione di partenza" },
        arrivalLocation: { type: "string", description: "Aeroporto/stazione di arrivo" },
        carrier: { type: "string", description: "Compagnia aerea, numero volo o operatore" },
        bookingCode: { type: "string", description: "Codice prenotazione" },
        cost: { type: "string", description: "Costo in euro come stringa numerica" },
        notes: { type: "string", description: "Note aggiuntive" }
      },
      required: ["tipoTrasporto", "date", "departureLocation", "arrivalLocation"]
    }
  },
  required: ["entityType"]
};

const SYSTEM_PROMPT = `Sei un assistente specializzato nell'estrarre informazioni strutturate da conferme di prenotazione viaggi, email e note di testo in qualsiasi lingua (italiano, inglese, ecc.).

Il testo che ricevi può essere:
- Una email di conferma prenotazione hotel (Booking.com, Hotels.com, Airbnb, ecc.)
- Una conferma di volo (Ryanair, Lufthansa, Emirates, ecc.)
- Una conferma di treno, traghetto o transfer
- Una nota di testo libera con informazioni su una destinazione / tappa

Il tuo compito:
1. Identifica il tipo di entità principale (alloggio, tappa, trasporto o sconosciuto)
2. Estrai TUTTI i campi pertinenti con la massima precisione
3. Formatta le date SEMPRE come YYYY-MM-DD (es. 2026-11-28)
4. Formatta gli orari SEMPRE come HH:mm (es. 14:30)
5. Per il costo, restituisci solo il numero (es. "199.50"), non la valuta
6. Se non riesci ad estrarre un campo obbligatorio, usa una stringa vuota ma non omettere il campo
7. Per le conferme alloggio, il codice prenotazione è spesso un numero alfanumerico di 6-10 caratteri`;

// Usa Secret Manager per gestire la chiave in modo sicuro.
// Questo richiede di eseguire: firebase secrets:set GEMINI_API_KEY
import { defineSecret } from "firebase-functions/params";
const geminiApiKey = defineSecret("GEMINI_API_KEY");

export const smartExtract = functions.https.onCall(
  { secrets: [geminiApiKey], cors: true },
  async (request) => {
    // 1. Verifica autenticazione (facoltativo ma consigliato)
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Devi essere autenticato per usare questa funzione."
      );
    }

    const text = request.data.text;
    if (!text || typeof text !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Manca il testo da estrarre."
      );
    }

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      throw new functions.https.HttpsError(
        "internal",
        "API Key non configurata lato server."
      );
    }

    // Usiamo il modello gemini-2.5-flash
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Estrai le informazioni strutturate dal seguente testo:\n\n---\n${text.slice(0, 8000)}\n---`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: EXTRACTION_SCHEMA
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Errore API Gemini:", errorText);
        throw new functions.https.HttpsError(
          "internal",
          `Errore API Gemini (${response.status})`
        );
      }

      const responseJson = await response.json();
      const rawText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new functions.https.HttpsError("internal", "Risposta API vuota o formato inatteso.");
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        throw new functions.https.HttpsError("internal", "Impossibile interpretare la risposta JSON dell'AI.");
      }

      // Restituisco il risultato strutturato al client
      return parsed;

    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      console.error("Errore generico:", error);
      throw new functions.https.HttpsError("internal", "Errore di rete o server sconosciuto.");
    }
  }
);
