"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInvite = exports.joinTrip = exports.callGeminiApi = exports.smartExtract = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
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
const params_1 = require("firebase-functions/params");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
exports.smartExtract = functions.https.onCall({ secrets: [geminiApiKey], cors: true }, async (request) => {
    var _a, _b, _c, _d, _e;
    // 1. Verifica autenticazione (facoltativo ma consigliato)
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Devi essere autenticato per usare questa funzione.");
    }
    const text = request.data.text;
    if (!text || typeof text !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Manca il testo da estrarre.");
    }
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
        throw new functions.https.HttpsError("internal", "API Key non configurata lato server.");
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
            throw new functions.https.HttpsError("internal", `Errore API Gemini (${response.status})`);
        }
        const responseJson = await response.json();
        const rawText = (_e = (_d = (_c = (_b = (_a = responseJson === null || responseJson === void 0 ? void 0 : responseJson.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text;
        if (!rawText) {
            throw new functions.https.HttpsError("internal", "Risposta API vuota o formato inatteso.");
        }
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        }
        catch (e) {
            throw new functions.https.HttpsError("internal", "Impossibile interpretare la risposta JSON dell'AI.");
        }
        // Restituisco il risultato strutturato al client
        return parsed;
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        console.error("Errore generico:", error);
        throw new functions.https.HttpsError("internal", "Errore di rete o server sconosciuto.");
    }
});
/**
 * Funzione proxy sicura per chiamare Gemini dall'app client senza esporre la chiave API.
 * Richiede autenticazione.
 */
exports.callGeminiApi = functions.https.onCall({ secrets: [geminiApiKey], cors: true }, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    const requestBody = request.data.requestBody;
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
        throw new functions.https.HttpsError("internal", "API Key non configurata.");
    }
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Errore API Gemini Proxy:", errorText);
            throw new functions.https.HttpsError("internal", `Errore API Gemini (${response.status})`);
        }
        return await response.json();
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError)
            throw error;
        console.error("Errore Proxy Gemini:", error);
        throw new functions.https.HttpsError("internal", "Errore di rete o server sconosciuto.");
    }
});
// Hash helper: SHA-256 in hex
function hashToken(raw) {
    return crypto.createHash('sha256').update(raw.trim().toUpperCase()).digest('hex');
}
/**
 * Cloud Function per unirsi a un viaggio tramite invite token (Semplificata).
 *
 * Riceve: { inviteToken: string }
 */
exports.joinTrip = functions.https.onCall({ cors: true }, async (request) => {
    var _a;
    console.log("[JOINTRIP-SIMPLIFIED] called with auth:", !!request.auth);
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato.');
    }
    const uid = request.auth.uid;
    const inviteToken = (_a = request.data) === null || _a === void 0 ? void 0 : _a.inviteToken;
    if (!inviteToken || typeof inviteToken !== 'string' || !inviteToken.trim()) {
        throw new functions.https.HttpsError('invalid-argument', 'Codice mancante.');
    }
    const tokenClean = inviteToken.trim();
    const db = admin.firestore();
    // 1. Caso Master Trip "0000"
    if (tokenClean === '0000') {
        const tripRef = db.collection('trips').doc('0000');
        const tripSnap = await tripRef.get();
        if (!tripSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Viaggio 0000 non trovato. Esegui il seed.');
        }
        const batch = db.batch();
        batch.update(tripRef, {
            members: admin.firestore.FieldValue.arrayUnion(uid)
        });
        const memberRef = tripRef.collection('members').doc(uid);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists) {
            batch.set(memberRef, { uid, role: 'copilota', createdAt: Date.now() });
        }
        await batch.commit();
        const tripData = tripSnap.data() || {};
        return {
            success: true,
            tripId: '0000',
            title: tripData.title || 'Viaggio Originale',
            startDate: tripData.startDate || '',
            endDate: tripData.endDate || '',
            ownerUid: tripData.ownerUid || ''
        };
    }
    // 2. Fallback per altri viaggi (Match diretto su ID o inviteCode)
    const tripRef = db.collection('trips').doc(tokenClean);
    let tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
        // Prova a cercare per inviteCode
        const query = await db.collection('trips').where('inviteCode', '==', tokenClean).limit(1).get();
        if (!query.empty) {
            tripSnap = query.docs[0];
        }
        else {
            throw new functions.https.HttpsError('not-found', 'Codice viaggio non trovato.');
        }
    }
    const batch = db.batch();
    batch.update(tripSnap.ref, {
        members: admin.firestore.FieldValue.arrayUnion(uid)
    });
    const memberRef = tripSnap.ref.collection('members').doc(uid);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
        batch.set(memberRef, { uid, role: 'copilota', createdAt: Date.now() });
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
});
/**
 * Cloud Function per generare un invite token sicuro per un viaggio.
 * Solo l'owner del viaggio può generare inviti.
 *
 * Riceve: { tripId: string }
 * Restituisce: { success: true, code: string, expiresAt: number }
 */
exports.createInvite = functions.https.onCall({ cors: true }, async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato per generare un invito.');
    }
    const uid = request.auth.uid;
    const tripId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.tripId;
    if (!tripId || typeof tripId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'tripId mancante o non valido.');
    }
    const db = admin.firestore();
    const tripRef = db.collection('trips').doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Viaggio non trovato.');
    }
    const tripData = tripSnap.data() || {};
    // Verifica che il richiedente sia effettivamente l'owner
    const isOwner = tripData.ownerUid === uid;
    if (!isOwner) {
        // Controlla anche in /members/{uid} per ruolo 'owner'
        const memberSnap = await tripRef.collection('members').doc(uid).get();
        if (!memberSnap.exists || ((_b = memberSnap.data()) === null || _b === void 0 ? void 0 : _b.role) !== 'owner') {
            throw new functions.https.HttpsError('permission-denied', 'Solo il proprietario del viaggio può generare codici di invito.');
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
});
//# sourceMappingURL=index.js.map