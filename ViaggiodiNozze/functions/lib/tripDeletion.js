"use strict";
/**
 * tripDeletion.ts
 *
 * Logica di eliminazione amministrativa di un viaggio, separata dalla Cloud Function
 * per poter essere testata localmente con dipendenze simulate (nessun accesso a Firebase).
 *
 * Garanzie implementate (verificate dai test locali con dipendenze finte):
 * - I viaggi protetti (es. '0000', viaggio reale) non possono MAI essere eliminati,
 *   neanche con chiamata diretta: il controllo avviene prima di qualsiasi lettura/scrittura.
 * - Solo un amministratore verificato lato server può procedere.
 * - La conferma dell'ID deve coincidere esattamente.
 * - Il successo viene dichiarato solo dopo una verifica post-cancellazione senza residui.
 * - Se il documento radice non esiste ma restano sottocollezioni orfane, è possibile ripetere
 *   l'operazione (retry sicuro) per completare la pulizia.
 *
 * NOTA: questo file non usa sintassi TypeScript non cancellabile (enum, parameter properties),
 * così può essere importato direttamente da Node con type-stripping nei test.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripDeletionError = exports.PROTECTED_TRIP_IDS = void 0;
exports.isProtectedTripId = isProtectedTripId;
exports.performAdminTripDeletion = performAdminTripDeletion;
/** ID di viaggi che non possono essere eliminati in alcun caso tramite questo percorso. */
exports.PROTECTED_TRIP_IDS = ['0000'];
function isProtectedTripId(tripId) {
    return exports.PROTECTED_TRIP_IDS.includes(String(tripId || '').trim());
}
class TripDeletionError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.TripDeletionError = TripDeletionError;
async function performAdminTripDeletion(input, deps) {
    if (!input.authUid) {
        throw new TripDeletionError('unauthenticated', 'Operazione riservata: autenticazione necessaria.');
    }
    if (typeof input.tripId !== 'string' || !input.tripId.trim()) {
        throw new TripDeletionError('invalid-argument', 'Identificativo tripId mancante o non valido.');
    }
    const tripId = input.tripId.trim();
    // Blocco assoluto dei viaggi protetti, PRIMA di qualsiasi lettura o scrittura.
    if (isProtectedTripId(tripId)) {
        throw new TripDeletionError('permission-denied', `Il viaggio "${tripId}" è protetto e non può essere eliminato tramite il portale amministrativo.`);
    }
    if (input.confirmTripId !== input.tripId) {
        throw new TripDeletionError('failed-precondition', 'Mancata corrispondenza di conferma: confirmTripId deve coincidere esattamente con tripId.');
    }
    const isAdmin = await deps.isGlobalAdmin(input.authUid, input.hasAdminClaim === true);
    if (!isAdmin) {
        throw new TripDeletionError('permission-denied', "Permesso negato: l'utente non dispone dei privilegi di amministratore globale.");
    }
    const rootExists = await deps.tripRootExists(tripId);
    const existingSubcollections = await deps.listTripSubcollections(tripId);
    if (!rootExists && existingSubcollections.length === 0) {
        throw new TripDeletionError('not-found', `Il viaggio con ID "${tripId}" non esiste nel database.`);
    }
    const wasRetryOfPartialDeletion = !rootExists;
    const tripTitle = rootExists ? await deps.readTripTitle(tripId) : null;
    await deps.writeAudit({
        action: 'TRIP_DELETE_ADMIN_STARTED',
        tripId,
        tripTitle,
        adminUid: input.authUid,
        subcollections: existingSubcollections,
        wasRetryOfPartialDeletion,
        timestamp: deps.now()
    });
    let related;
    try {
        // I token di invito vengono rimossi per primi, così non possono più essere usati.
        related = await deps.deleteRelatedTopLevelData(tripId);
        await deps.recursiveDeleteTrip(tripId);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await deps.writeAudit({
            action: 'TRIP_DELETE_ADMIN_FAILED',
            tripId,
            adminUid: input.authUid,
            error: message.slice(0, 300),
            timestamp: deps.now()
        }).catch(() => undefined);
        throw new TripDeletionError('aborted', `Eliminazione interrotta: alcuni dati potrebbero essere rimasti. È possibile ripetere l'operazione. Dettaglio: ${message}`);
    }
    // Il successo viene dichiarato solo dopo la verifica post-cancellazione.
    const check = {
        rootExists: await deps.tripRootExists(tripId),
        residualSubcollections: await deps.listTripSubcollections(tripId)
    };
    if (check.rootExists || check.residualSubcollections.length > 0) {
        await deps.writeAudit({
            action: 'TRIP_DELETE_ADMIN_INCOMPLETE',
            tripId,
            adminUid: input.authUid,
            rootExists: check.rootExists,
            residualSubcollections: check.residualSubcollections,
            timestamp: deps.now()
        }).catch(() => undefined);
        throw new TripDeletionError('aborted', `Eliminazione incompleta: restano dati (${check.rootExists ? 'documento radice' : ''}${check.residualSubcollections.length ? ' sottocollezioni: ' + check.residualSubcollections.join(', ') : ''}). Ripetere l'operazione.`);
    }
    await deps.writeAudit({
        action: 'TRIP_DELETE_ADMIN_COMPLETED',
        tripId,
        adminUid: input.authUid,
        related,
        timestamp: deps.now()
    }).catch(() => undefined);
    return { success: true, deletedTripId: tripId, wasRetryOfPartialDeletion, related };
}
//# sourceMappingURL=tripDeletion.js.map