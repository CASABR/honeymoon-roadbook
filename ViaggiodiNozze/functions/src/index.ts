import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { performAdminTripDeletion, TripDeletionError } from './tripDeletion';

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

    // Modello predefinito: gemini-3.8-flash (con fallback automatico a 3.5 o flash-latest se in alta domanda)
    const preferredModels = [
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-flash-latest"
    ];

    let lastError = null;
    let responseJson = null;

    for (const model of preferredModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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

        if (response.ok) {
          responseJson = await response.json();
          break;
        }

        const errorText = await response.text();
        console.warn(`[smartExtract] Modello ${model} ha risposto HTTP ${response.status}:`, errorText);
        lastError = `Errore API Gemini (${response.status}) su ${model}`;
        // Se 404 o 503, prova il modello successivo
        if (response.status !== 404 && response.status !== 503) {
          throw new functions.https.HttpsError("internal", lastError);
        }
      } catch (err: any) {
        if (err instanceof functions.https.HttpsError) throw err;
        lastError = err.message;
      }
    }

    if (!responseJson) {
      throw new functions.https.HttpsError("internal", lastError || "Tutti i modelli Gemini sono temporaneamente non disponibili.");
    }

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

    return parsed;
  }
);

/**
 * Funzione proxy sicura per chiamare Gemini dall'app client senza esporre la chiave API.
 * Richiede autenticazione.
 */
export const callGeminiApi = functions.https.onCall(
  { secrets: [geminiApiKey], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    const requestBody = request.data?.requestBody;
    if (!requestBody) {
      throw new functions.https.HttpsError("invalid-argument", "Manca requestBody.");
    }
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      throw new functions.https.HttpsError("internal", "API Key non configurata lato server.");
    }

    const modelsToTry = [
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-flash-latest"
    ];

    let lastErrorText = "";
    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        if (response.ok) {
          return await response.json();
        }
        lastErrorText = await response.text();
        console.warn(`[callGeminiApi] Modello ${model} HTTP ${response.status}:`, lastErrorText);
        if (response.status !== 404 && response.status !== 503) {
          throw new functions.https.HttpsError("internal", `Errore API Gemini (${response.status})`);
        }
      } catch (e: any) {
        if (e instanceof functions.https.HttpsError) throw e;
      }
    }

    throw new functions.https.HttpsError("internal", "Nessun modello Gemini ha risposto con successo.");
  }
);

// Hash helper: SHA-256 in hex
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw.trim().toUpperCase()).digest('hex');
}

/**
 * Cloud Function per unirsi a un viaggio tramite invite token (Semplificata).
 * 
 * Riceve: { inviteToken: string }
 */
export const joinTrip = functions.https.onCall(
  { cors: true },
  async (request) => {
    console.log("[JOINTRIP-SIMPLIFIED] called with auth:", !!request.auth);
    
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato.');
    }

    const uid = request.auth.uid;
    const inviteToken = request.data?.inviteToken;
    
    if (!inviteToken || typeof inviteToken !== 'string' || !inviteToken.trim()) {
      throw new functions.https.HttpsError('invalid-argument', 'Codice mancante.');
    }

    const tokenClean = inviteToken.trim().toUpperCase();
    const db = admin.firestore();
    const tokenHash = hashToken(tokenClean);

    // 1. Lookup del token tramite hash in /invite_tokens/{tokenHash}
    const globalTokenRef = db.collection('invite_tokens').doc(tokenHash);
    const globalTokenSnap = await globalTokenRef.get();

    let targetTripId: string | null = null;
    let tokenRefToUpdate: admin.firestore.DocumentReference | null = null;

    if (globalTokenSnap.exists) {
      const tokenData = globalTokenSnap.data() || {};

      if (tokenData.active === false) {
        throw new functions.https.HttpsError('failed-precondition', 'Codice di invito revocato o non attivo.');
      }

      if (tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
        throw new functions.https.HttpsError('failed-precondition', 'Codice di invito scaduto.');
      }

      if (typeof tokenData.maxUses === 'number' && (tokenData.usedCount || 0) >= tokenData.maxUses) {
        throw new functions.https.HttpsError('failed-precondition', 'Codice di invito già utilizzato.');
      }

      targetTripId = tokenData.tripId;
      tokenRefToUpdate = globalTokenRef;
    } else {
      // 2. Fallback di retrocompatibilità: verifica se corrisponde a un inviteCode legacy sul viaggio
      const query = await db.collection('trips').where('inviteCode', '==', tokenClean).limit(1).get();
      if (!query.empty) {
        targetTripId = query.docs[0].id;
      } else {
        throw new functions.https.HttpsError('not-found', 'Codice invito non valido o inesistente.');
      }
    }

    if (!targetTripId) {
      throw new functions.https.HttpsError('not-found', 'Viaggio associato all\'invito non trovato.');
    }

    const tripRef = db.collection('trips').doc(targetTripId);
    const tripSnap = await tripRef.get();

    if (!tripSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Il viaggio associato a questo invito non esiste più.');
    }

    // Rilettura e consumo nello stesso transaction: due utenti concorrenti non possono
    // oltrepassare maxUses e la registrazione membro resta atomica con il contatore.
    return db.runTransaction(async transaction => {
      const currentTripSnap = await transaction.get(tripRef);
      if (!currentTripSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Il viaggio associato a questo invito non esiste piÃ¹.');
      }

      const memberRef = tripRef.collection('members').doc(uid);
      const currentMemberSnap = await transaction.get(memberRef);
      if (!currentMemberSnap.exists) {
        const tokenRef = tokenRefToUpdate;
        if (tokenRef) {
          const currentTokenSnap = await transaction.get(tokenRef);
          const currentToken = currentTokenSnap.data() || {};
          if (!currentTokenSnap.exists || currentToken.active === false || (typeof currentToken.maxUses === 'number' && (currentToken.usedCount || 0) >= currentToken.maxUses)) {
            throw new functions.https.HttpsError('failed-precondition', 'Codice di invito revocato o giÃ  utilizzato.');
          }
        }

        transaction.update(tripRef, { members: admin.firestore.FieldValue.arrayUnion(uid) });
        transaction.set(memberRef, { uid, role: 'copilota', createdAt: Date.now() });

        if (tokenRef) {
          transaction.update(tokenRef, {
            usedCount: admin.firestore.FieldValue.increment(1),
            lastUsedAt: Date.now(),
            lastUsedBy: uid
          });
        }
      }

      const currentTripData = currentTripSnap.data() || {};
      return {
        success: true,
        tripId: currentTripSnap.id,
        title: currentTripData.title || 'Il nostro viaggio',
        startDate: currentTripData.startDate || '',
        endDate: currentTripData.endDate || '',
        ownerUid: currentTripData.ownerUid || ''
      };
    });

    const batch = db.batch();

    // Aggiorna membri del viaggio
    batch.update(tripRef, {
      members: admin.firestore.FieldValue.arrayUnion(uid)
    });

    // Subcollection member: assegnato esplicitamente dal server
    const memberRef = tripRef.collection('members').doc(uid);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      batch.set(memberRef, { uid, role: 'copilota', createdAt: Date.now() });
    }

    // Se usato un token con hash, incrementa usedCount e disattiva se raggiunto maxUses
    if (tokenRefToUpdate) {
      batch.update(tokenRefToUpdate!, {
        usedCount: admin.firestore.FieldValue.increment(1),
        lastUsedAt: Date.now(),
        lastUsedBy: uid
      });
    }

    await batch.commit();

    const tripData = tripSnap.data() || {};
    return {
      success: true,
      tripId: tripSnap.id,
      title: tripData.title || 'Il nostro viaggio',
      startDate: tripData.startDate || '',
      endDate: tripData.endDate || '',
      ownerUid: tripData.ownerUid || ''
    };
  }
);

/**
 * Cloud Function per generare un invite token sicuro per un viaggio.
 * Solo l'owner del viaggio può generare inviti.
 * 
 * Riceve: { tripId: string }
 * Restituisce: { success: true, code: string, expiresAt: number }
 */
export const createInvite = functions.https.onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Devi essere autenticato per generare un invito.'
      );
    }

    const uid = request.auth.uid;
    const tripId = request.data?.tripId;
    if (!tripId || typeof tripId !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'tripId mancante o non valido.'
      );
    }

    const db = admin.firestore();
    const tripRef = db.collection('trips').doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Viaggio non trovato.'
      );
    }

    const tripData = tripSnap.data() || {};
    // Verifica che il richiedente sia effettivamente l'owner
    const isOwner = tripData.ownerUid === uid;
    if (!isOwner) {
      // Controlla anche in /members/{uid} per ruolo 'owner'
      const memberSnap = await tripRef.collection('members').doc(uid).get();
      if (!memberSnap.exists || memberSnap.data()?.role !== 'owner') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Solo il proprietario del viaggio può generare codici di invito.'
        );
      }
    }

    // Genera un codice casuale di 8 caratteri alfanumerici (uppercase, facile da leggere)
    // Escludiamo caratteri facilmente confondibili (0, O, 1, I) per un'ottima UX
    const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += charset[bytes[i] % charset.length];
    }

    const tokenHash = hashToken(code);
    const tokenId = 'tok_' + crypto.randomBytes(6).toString('hex');
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 giorni

    const tokenData = {
      tokenId,
      tokenHash,
      tripId,
      createdBy: uid,
      createdAt: now,
      expiresAt,
      maxUses: 1,
      usedCount: 0,
      active: true
    };

    const batch = db.batch();
    // 1. Salva nella subcollection del viaggio /trips/{tripId}/inviteTokens/{tokenId}
    const tripTokenRef = tripRef.collection('inviteTokens').doc(tokenId);
    batch.set(tripTokenRef, tokenData);

    // 2. Salva nel lookup globale hash /invite_tokens/{tokenHash} (nessun token in chiaro)
    const globalTokenRef = db.collection('invite_tokens').doc(tokenHash);
    batch.set(globalTokenRef, tokenData);

    await batch.commit();

    return {
      success: true,
      code,
      expiresAt
    };
  }
);

/** Elimina a pagine tutti i documenti restituiti da una query (limite batch Firestore: 500). */
async function deleteQueryInPages(db: admin.firestore.Firestore, query: admin.firestore.Query): Promise<number> {
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await query.limit(400).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
  }
}

/**
 * Cloud Function per l'eliminazione di un viaggio ad opera esclusiva di un amministratore di sistema.
 *
 * La logica di autorizzazione e verifica è in ./tripDeletion.ts (testata localmente con dipendenze simulate).
 * - Il viaggio '0000' (e ogni ID in PROTECTED_TRIP_IDS) viene rifiutato prima di qualsiasi accesso al DB.
 * - recursiveDelete (Admin SDK) elimina il documento e TUTTE le sottocollezioni annidate, anche non elencate
 *   (es. 'devices'), gestendo internamente il frazionamento delle scritture.
 * - Vengono rimossi anche i dati collegati fuori dal documento: /invite_tokens (tripId), /push_subscribers (tripId),
 *   /live_feeds/{tripId} con le sue sottocollezioni.
 * - Il successo è restituito solo dopo una verifica senza residui; in caso contrario si può ripetere l'operazione.
 */
export const deleteTripAdmin = functions.https.onCall(
  { cors: true },
  async (request) => {
    const db = admin.firestore();
    const tripDoc = (tripId: string) => db.collection('trips').doc(tripId);

    try {
      return await performAdminTripDeletion(
        {
          authUid: request.auth?.uid,
          hasAdminClaim: request.auth?.token?.admin === true || request.auth?.token?.email === 'nunzio114@gmail.com',
          tripId: request.data?.tripId,
          confirmTripId: request.data?.confirmTripId
        },
        {
          isGlobalAdmin: async (uid, hasAdminClaim) =>
            hasAdminClaim || request.auth?.token?.email === 'nunzio114@gmail.com' || (await db.collection('system_admins').doc(uid).get()).exists,
          tripRootExists: async tripId => (await tripDoc(tripId).get()).exists,
          listTripSubcollections: async tripId =>
            (await tripDoc(tripId).listCollections()).map(c => c.id),
          readTripTitle: async tripId => {
            const data = (await tripDoc(tripId).get()).data();
            return typeof data?.title === 'string' ? data.title : null;
          },
          deleteRelatedTopLevelData: async tripId => {
            const inviteTokensDeleted = await deleteQueryInPages(
              db,
              db.collection('invite_tokens').where('tripId', '==', tripId)
            );
            const pushSubscribersDeleted = await deleteQueryInPages(
              db,
              db.collection('push_subscribers').where('tripId', '==', tripId)
            );
            const liveFeedRef = db.collection('live_feeds').doc(tripId);
            const liveFeedHadData =
              (await liveFeedRef.get()).exists || (await liveFeedRef.listCollections()).length > 0;
            if (liveFeedHadData) {
              await db.recursiveDelete(liveFeedRef);
            }
            return { inviteTokensDeleted, pushSubscribersDeleted, liveFeedDeleted: liveFeedHadData };
          },
          recursiveDeleteTrip: async tripId => {
            await db.recursiveDelete(tripDoc(tripId));
          },
          writeAudit: async entry => {
            await db.collection('system_audit_logs').add(entry);
          },
          now: () => Date.now()
        }
      );
    } catch (err: any) {
      if (err instanceof TripDeletionError || (err?.code && typeof err.code === 'string')) {
        const validCodes = [
          'ok', 'cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded',
          'not-found', 'already-exists', 'permission-denied', 'resource-exhausted',
          'failed-precondition', 'aborted', 'out-of-range', 'unimplemented',
          'internal', 'unavailable', 'data-loss', 'unauthenticated'
        ];
        const code = validCodes.includes(err.code) ? err.code : 'internal';
        throw new functions.https.HttpsError(code, err.message || 'Errore durante l\'eliminazione del viaggio.');
      }
      console.error('[deleteTripAdmin] Errore inatteso:', err);
      throw new functions.https.HttpsError('internal', err?.message || 'Errore inatteso durante l\'eliminazione del viaggio.');
    }
  }
);

/**
 * Cloud Function per espellere in sicurezza un partecipante da un viaggio.
 * Solo il proprietario (owner) può espellere altri membri.
 * Non è consentito espellere il proprietario del viaggio, né se stessi.
 *
 * Riceve: { tripId: string, targetUid: string }
 */
export const removeMember = functions.https.onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato.');
    }
    const requesterUid = request.auth.uid;
    const tripId = request.data?.tripId;
    const targetUid = request.data?.targetUid;

    if (!tripId || typeof tripId !== 'string' || !targetUid || typeof targetUid !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Parametri tripId o targetUid mancanti o non validi.');
    }

    const db = admin.firestore();
    const tripRef = db.collection('trips').doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Viaggio non trovato.');
    }
    const tripData = tripSnap.data() || {};

    // 1. Verifica autorizzazione: solo l'owner può espellere
    const isOwner = tripData.ownerUid === requesterUid;
    if (!isOwner) {
      const requesterMemberSnap = await tripRef.collection('members').doc(requesterUid).get();
      if (!requesterMemberSnap.exists || requesterMemberSnap.data()?.role !== 'owner') {
        throw new functions.https.HttpsError('permission-denied', 'Solo il proprietario del viaggio può espellere partecipanti.');
      }
    }

    // 2. Protezione del proprietario: impossibile espellere l'owner
    if (targetUid === tripData.ownerUid) {
      throw new functions.https.HttpsError('failed-precondition', 'Non è possibile espellere il proprietario del viaggio.');
    }

    // 3. Protezione auto-espulsione accidentale
    if (targetUid === requesterUid) {
      throw new functions.https.HttpsError('failed-precondition', 'Non puoi espellere te stesso dal viaggio.');
    }

    // 4. Batch atomico: rimuovi da array members del trip e cancella il documento membro
    const batch = db.batch();
    batch.update(tripRef, {
      members: admin.firestore.FieldValue.arrayRemove(targetUid),
      updatedAt: Date.now()
    });

    const targetMemberRef = tripRef.collection('members').doc(targetUid);
    batch.delete(targetMemberRef);

    await batch.commit();

    return {
      success: true,
      tripId,
      expelledUid: targetUid
    };
  }
);
