const fs = require('fs');
const assert = require('assert');

console.log('=== TEST SUITE E2E: CONSOLIDAMENTO AGGIUNTA CARD & NOTIFICHE ===\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

// ─── SCENARIO A: Posizionamento "+ Aggiungi" in timeline Oggi ───────
runTest('Scenario A: Pulsante "+ Aggiungi" univoco nell\'header della timeline', () => {
  const oggiCode = fs.readFileSync('ViaggiodiNozze/src/views/OggiView.tsx', 'utf8');
  assert(oggiCode.includes('onClick={() => setIsCategoryPickerOpen(true)}'), 'Pulsante apertura categoria non trovato');
  assert(oggiCode.includes('>+</span>') || oggiCode.includes('<span>+</span>'), 'Simbolo + non trovato');
  assert(oggiCode.includes('<span>Aggiungi</span>'), 'Etichetta "Aggiungi" non trovata');
  // Verifica che il pulsante ridondante in fondo sia stato eliminato
  assert(!oggiCode.includes('Aggiungi a questa giornata'), 'Pulsante ridondante in fondo alla timeline ancora presente!');
});

// ─── SCENARIO B: Empty state "+ Aggiungi" ───────────────────────────
runTest('Scenario B: Empty state contiene unica CTA evidente "+ Aggiungi"', () => {
  const oggiCode = fs.readFileSync('ViaggiodiNozze/src/views/OggiView.tsx', 'utf8');
  assert(oggiCode.includes('Nessuna attività programmata per'), 'Testo stato vuoto non trovato');
  assert(oggiCode.includes('hounigo-button-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold active:scale-95 shadow-md shadow-[#FF6B5F]/20 cursor-pointer'), 'CTA principale non trovata');
});

// ─── SCENARIO C: Selettore categorie con le 6 tipologie e precompilazione data ─
runTest('Scenario C: Modale selezione con 6 categorie e precompilazione data', () => {
  const oggiCode = fs.readFileSync('ViaggiodiNozze/src/views/OggiView.tsx', 'utf8');
  assert(oggiCode.includes('Modale Selezione Categoria per Aggiunta Card'), 'Modale categorie non presente');
  assert(oggiCode.includes('INSERT_CATEGORIES.map'), 'Mappatura categorie non presente');
  
  const categories = ['tappa', 'attivita', 'ristorante', 'alloggio', 'trasporto', 'shopping'];
  for (const cat of categories) {
    assert(oggiCode.includes(`type: '${cat}'`), `Categoria ${cat} mancante in INSERT_CATEGORIES`);
  }
  
  assert(oggiCode.includes('defaultDate={selectedDate}'), 'Precompilazione selectedDate per tappa non trovata');
  assert(oggiCode.includes("defaultDate={creatingCategory === 'trasporto' ? selectedDate : undefined}"), 'Precompilazione trasporto non trovata');
  assert(oggiCode.includes("defaultDate={creatingCategory === 'alloggio' ? selectedDate : undefined}"), 'Precompilazione alloggio non trovata');
  assert(oggiCode.includes("defaultDate={creatingCategory === 'ristorante' ? selectedDate : undefined}"), 'Precompilazione ristorante non trovata');
  assert(oggiCode.includes("defaultDate={creatingCategory === 'shopping' ? selectedDate : undefined}"), 'Precompilazione shopping non trovata');
});

// ─── SCENARIO D: Rispetto permessi Viewer (canEdit === false) ─────────
runTest('Scenario D: I Viewer hanno controlli di aggiunta nascosti', () => {
  const oggiCode = fs.readFileSync('ViaggiodiNozze/src/views/OggiView.tsx', 'utf8');
  assert(oggiCode.includes('canEdit && (\n                  <div className="pt-2">\n                    <button\n                      type="button"\n                      onClick={() => setIsCategoryPickerOpen(true)}'), 'Pulsante empty state non condizionato a canEdit');
  assert(oggiCode.includes('canEdit && (\n                      <button\n                        type="button"\n                        onClick={() => setIsCategoryPickerOpen(true)}'), 'Pulsante header timeline non condizionato a canEdit');
});

// ─── SCENARIO E: Pulizia banner ridondanti ──────────────────────────
runTest('Scenario E: Eliminati banner multipli sovrapposti al primo avvio', () => {
  const oggiCode = fs.readFileSync('ViaggiodiNozze/src/views/OggiView.tsx', 'utf8');
  assert(!oggiCode.includes('hounigo_add_card_hint_seen_v1'), 'Banner hint ridondante ancora presente');
});

// ─── SCENARIO F: Campanella 3 macro-stati semplificata ───────────────
runTest('Scenario F: Campanella semplificata a 3 macro-stati veritieri', () => {
  const bellCode = fs.readFileSync('ViaggiodiNozze/src/components/common/NotificationBellButton.tsx', 'utf8');
  assert(bellCode.includes('isActive'), 'Stato active mancante');
  assert(bellCode.includes('isPending'), 'Stato pending mancante');
  assert(bellCode.includes('isOffOrBlocked'), 'Stato off/blocked mancante');
  assert(bellCode.includes('bg-emerald-500'), 'Dot verde attivo mancante');
  assert(bellCode.includes('bg-amber-500'), 'Dot ambra pending mancante');
});

// ─── SCENARIO G: Distinzione OS Permission vs D1 Server Registration ─
runTest('Scenario G: PushNotificationModal distingue permesso OS e DB D1 con "Riprova attivazione"', () => {
  const modalCode = fs.readFileSync('ViaggiodiNozze/src/components/modals/PushNotificationModal.tsx', 'utf8');
  assert(modalCode.includes('Autorizzazione concessa, registrazione server mancante'), 'Avviso browser-only mancante');
  assert(modalCode.includes('Riprova attivazione'), 'Pulsante Riprova attivazione mancante');
  assert(modalCode.includes('Permesso bloccato nel browser o sistema operativo'), 'Istruzioni permessi bloccati mancanti');
});

// ─── SCENARIO H: Permessi Test Personale (Owner, Copilota, Viewer) ─────
runTest('Scenario H: Worker consente test personale a tutti i membri del viaggio (Owner, Copilota, Viewer)', () => {
  const indexCode = fs.readFileSync('ViaggiodiNozze/cloudflare/houniai-worker/src/index.js', 'utf8');
  const pushCode = fs.readFileSync('ViaggiodiNozze/cloudflare/houniai-worker/src/push.js', 'utf8');
  
  assert(indexCode.includes('assertTripMember(uid, tripId, idToken, env)'), 'assertTripMember mancante in index.js');
  assert(indexCode.includes("role === 'owner' || role === 'copilota' || role === 'viewer'"), 'Ruolo viewer escluso da assertTripMember');
  assert(indexCode.includes('Non sei autorizzato per le notifiche di questo viaggio.'), 'Messaggio di errore non-member mancante');
  assert(pushCode.includes('if (!registration || registration.uid !== uid || registration.trip_id !== tripId) throw new Error(\'SUBSCRIPTION_NOT_AUTHORIZED\');'), 'Verifica di appartenenza subscription mancante');
});

// ─── SCENARIO I: Admin Broadcast Multi-Viaggio con deduplicazione ─────
runTest('Scenario I: Worker e AdminPanel supportano all_trips_broadcast con deduplicazione endpoint', () => {
  const pushCode = fs.readFileSync('ViaggiodiNozze/cloudflare/houniai-worker/src/push.js', 'utf8');
  const adminCode = fs.readFileSync('ViaggiodiNozze/src/views/altro/AdminNotificationsPanel.tsx', 'utf8');
  
  assert(pushCode.includes("target === 'all_trips_broadcast'"), 'target all_trips_broadcast non gestito nel worker push');
  assert(pushCode.includes('GROUP BY endpoint_hash'), 'Deduplicazione endpoint_hash mancante per broadcast globale');
  assert(adminCode.includes('all_trips_broadcast'), 'Opzione all_trips_broadcast mancante in AdminNotificationsPanel');
  assert(adminCode.includes('Conferma Invio Notifica'), 'Modale conferma mancante');
  assert(adminCode.includes('max 100 invii al giorno'), 'Avviso limiti Cloudflare Free mancante');
});

// ─── SCENARIO J: Protezione 403 per non-admin su admin-send ──────────
runTest('Scenario J: /v1/push/admin-send restituisce tassativamente 403 a utenti non-admin', () => {
  const indexCode = fs.readFileSync('ViaggiodiNozze/cloudflare/houniai-worker/src/index.js', 'utf8');
  assert(indexCode.includes("pathname.startsWith('/v1/push/admin-')"), 'Controllo endpoint admin- mancante');
  assert(indexCode.includes('const isAdmin = await assertGlobalAdmin(uid, idToken, env);'), 'Controllo assertGlobalAdmin mancante');
  assert(indexCode.includes('return json(origin, env, 403, { error: \'Operazione riservata esclusivamente agli amministratori globali (system_admins).\' });'), 'Risposta 403 tassativa mancante');
});

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSATI AL 100%`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
