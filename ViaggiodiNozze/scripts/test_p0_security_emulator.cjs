/**
 * HOUNIGO — TEST DI SICUREZZA P0 SU FIRESTORE EMULATOR
 * Convalida formale delle regole di sicurezza con 4 identità sintetiche distinte:
 * 1. Owner (Sposi - Guida)
 * 2. Copilota (Sposi - Co-pilota)
 * 3. Viewer (Membro del viaggio in sola lettura)
 * 4. Guest LIVE (Ospite esterno non autenticato)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
const PROJECT_ID = 'app-viaggio-di-nozze';
const BASE_URL = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function createMockJwt(authUid) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: authUid,
    user_id: authUid,
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`
  })).toString('base64url');
  return `${header}.${payload}.mock_signature`;
}

// Helper per invocare l'API REST di Firestore Emulator con mock auth token
async function firestoreRequest(method, docPath, body = null, authUid = null) {
  const url = `${BASE_URL}/${docPath}`;
  const headers = { 'Content-Type': 'application/json' };

  if (authUid) {
    // In Firestore Emulator, passare un mock JWT valido imposta request.auth.uid = <uid>
    headers['Authorization'] = `Bearer ${createMockJwt(authUid)}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  let json = null;
  try {
    json = await res.json();
  } catch {}

  return {
    status: res.status,
    ok: res.ok,
    data: json
  };
}

// Convertitore semplice di campi in formato Firestore REST
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(item => ({ stringValue: String(item) })) } };
  }
  return { fields };
}

async function runSecuritySuite() {
  console.log('========================================================================');
  console.log('HOUNIGO — P0 VERIFICA SICUREZZA FIRESTORE CON 4 RUOLI SINTETICI');
  console.log('========================================================================\n');

  console.log(`Connessione all'emulatore Firestore su http://${EMULATOR_HOST}...`);

  // 1. Verifica raggiungibilità dell'emulatore
  try {
    const ping = await fetch(`http://${EMULATOR_HOST}/`);
    if (ping.status !== 200 && ping.status !== 404) {
      throw new Error(`Status ${ping.status}`);
    }
  } catch (err) {
    console.error(`ERRORE: Impossibile contattare Firestore Emulator su ${EMULATOR_HOST}`);
    console.error('Assicurarsi che l\'emulatore sia avviato con "npx firebase emulators:start"');
    process.exit(1);
  }

  const TRIP_ID = 'trip_sec_test';
  const OWNER_UID = 'user_owner_sposi';
  const COPILOTA_UID = 'user_copilota_sposi';
  const VIEWER_UID = 'user_viewer_famiglia';
  const GUEST_UID = null;

  console.log('Fase 1: Configurazione viaggio di test e permessi ruoli...');

  // Setup 1: Creazione Viaggio da parte dell'Owner
  const tripPayload = toFirestoreFields({
    ownerUid: OWNER_UID,
    ownerName: 'Sposi',
    title: 'Viaggio Sicurezza P0',
    members: [OWNER_UID, COPILOTA_UID, VIEWER_UID]
  });
  const tripRes = await firestoreRequest('PATCH', `trips/${TRIP_ID}`, tripPayload, OWNER_UID);
  assert(tripRes.ok, `Setup Viaggio fallito: ${JSON.stringify(tripRes.data)}`);

  // Setup 2: Creazione subcollection members
  await firestoreRequest('PATCH', `trips/${TRIP_ID}/members/${OWNER_UID}`, toFirestoreFields({ uid: OWNER_UID, role: 'owner' }), OWNER_UID);
  await firestoreRequest('PATCH', `trips/${TRIP_ID}/members/${COPILOTA_UID}`, toFirestoreFields({ uid: COPILOTA_UID, role: 'copilota' }), OWNER_UID);
  await firestoreRequest('PATCH', `trips/${TRIP_ID}/members/${VIEWER_UID}`, toFirestoreFields({ uid: VIEWER_UID, role: 'viewer' }), OWNER_UID);

  // Setup 3: Creazione documento pubblico Alloggio (privo di PIN)
  const publicAlloggio = toFirestoreFields({
    id: 'acc_1',
    name: 'Hotel Tokyo Central',
    checkIn: '2026-11-28',
    address: 'Shinjuku 1-1',
    hasPrivateCredentials: true
  });
  await firestoreRequest('PATCH', `trips/${TRIP_ID}/alloggi/acc_1`, publicAlloggio, OWNER_UID);

  // Setup 4: Creazione cassaforte Private Credentials con prefisso anti-collisione
  const privateCreds = toFirestoreFields({
    id: 'alloggio_acc_1',
    entityId: 'acc_1',
    tripId: TRIP_ID,
    entityType: 'alloggio',
    pinCode: '7492#',
    bookingCode: 'BOOK-CONFIRM-99',
    noteCopilota: 'Chiave di riserva al concierge'
  });
  await firestoreRequest('PATCH', `trips/${TRIP_ID}/private_credentials/alloggio_acc_1`, privateCreds, OWNER_UID);

  // Setup 5: Creazione documento e spesa riservata
  await firestoreRequest('PATCH', `trips/${TRIP_ID}/documenti/att_chunk_1`, toFirestoreFields({ attachmentId: 'att_1', dataPiece: 'base64pdf' }), OWNER_UID);
  await firestoreRequest('PATCH', `trips/${TRIP_ID}/spese/exp_1`, toFirestoreFields({ id: 'exp_1', amount: '120.00 €', note: 'Contabilità' }), OWNER_UID);

  // Setup 6: Live feed pubblico
  await firestoreRequest('PATCH', `live_feeds/${TRIP_ID}`, toFirestoreFields({ title: 'Live Sposi', status: 'in_corso' }), OWNER_UID);
  await firestoreRequest('PATCH', `live_feeds/${TRIP_ID}/updates/up_1`, toFirestoreFields({ title: 'Arrivati a Tokyo', text: 'Tutto bene', timestamp: 1700000 }), OWNER_UID);

  console.log('✓ Setup dati di test completato con successo.\n');
  console.log('Fase 2: Esecuzione prove di accesso e convalida permessi...\n');

  let passed = 0;

  // TEST 1: Owner legge sia alloggio pubblico che credenziali private
  const t1_pub = await firestoreRequest('GET', `trips/${TRIP_ID}/alloggi/acc_1`, null, OWNER_UID);
  const t1_priv = await firestoreRequest('GET', `trips/${TRIP_ID}/private_credentials/alloggio_acc_1`, null, OWNER_UID);
  assert(t1_pub.status === 200, 'FAIL: Owner non riesce a leggere alloggio pubblico');
  assert(t1_priv.status === 200, 'FAIL: Owner non riesce a leggere private_credentials');
  passed++;
  console.log(`[PASS 01] Owner ha accesso completo (pubblico e credenziali private)`);

  // TEST 2: Copilota legge sia alloggio pubblico che credenziali private
  const t2_pub = await firestoreRequest('GET', `trips/${TRIP_ID}/alloggi/acc_1`, null, COPILOTA_UID);
  const t2_priv = await firestoreRequest('GET', `trips/${TRIP_ID}/private_credentials/alloggio_acc_1`, null, COPILOTA_UID);
  assert(t2_pub.status === 200, 'FAIL: Copilota non riesce a leggere alloggio pubblico');
  assert(t2_priv.status === 200, 'FAIL: Copilota non riesce a leggere private_credentials');
  passed++;
  console.log(`[PASS 02] Copilota ha accesso completo (pubblico e credenziali private)`);

  // TEST 3: Viewer legge documento pubblico dell'itinerario
  const t3 = await firestoreRequest('GET', `trips/${TRIP_ID}/alloggi/acc_1`, null, VIEWER_UID);
  assert(t3.status === 200, `FAIL: Viewer non riesce a leggere documento pubblico: ${t3.status}`);
  assert(t3.data.fields.name.stringValue === 'Hotel Tokyo Central');
  passed++;
  console.log(`[PASS 03] Viewer legge correttamente l'itinerario pubblico (Alloggio)`);

  // TEST 4: Viewer BLOCCATO da Firestore su Private Credentials
  const t4 = await firestoreRequest('GET', `trips/${TRIP_ID}/private_credentials/alloggio_acc_1`, null, VIEWER_UID);
  assert(t4.status === 403, `FAIL: Viewer è riuscito ad accedere a private_credentials! Status: ${t4.status}`);
  passed++;
  console.log(`[PASS 04] VULNERABILITÀ PIN RISOLTA: Viewer riceve 403 FORBIDDEN su private_credentials`);

  // TEST 5: Viewer BLOCCATO da Firestore su Documenti / Allegati Chunked
  const t5 = await firestoreRequest('GET', `trips/${TRIP_ID}/documenti/att_chunk_1`, null, VIEWER_UID);
  assert(t5.status === 403, `FAIL: Viewer è riuscito ad accedere a documenti! Status: ${t5.status}`);
  passed++;
  console.log(`[PASS 05] VULNERABILITÀ ALLEGATI RISOLTA: Viewer riceve 403 FORBIDDEN su documenti`);

  // TEST 6: Viewer BLOCCATO da Firestore su Spese
  const t6 = await firestoreRequest('GET', `trips/${TRIP_ID}/spese/exp_1`, null, VIEWER_UID);
  assert(t6.status === 403, `FAIL: Viewer è riuscito ad accedere a spese! Status: ${t6.status}`);
  passed++;
  console.log(`[PASS 06] Viewer riceve 403 FORBIDDEN sulla contabilità privata delle spese`);

  // TEST 7: Viewer BLOCCATO in Scrittura su Collezioni Pubbliche
  const t7 = await firestoreRequest('PATCH', `trips/${TRIP_ID}/alloggi/acc_fake`, toFirestoreFields({ name: 'Hacked Hotel' }), VIEWER_UID);
  assert(t7.status === 403, `FAIL: Viewer è riuscito a scrivere un alloggio! Status: ${t7.status}`);
  passed++;
  console.log(`[PASS 07] Viewer riceve 403 FORBIDDEN su qualsiasi tentativo di scrittura/modifica`);

  // TEST 8: Schema Guard Anti-Injection (Rifiuta documenti pubblici con chiavi sensibili)
  const rogueDoc = toFirestoreFields({
    id: 'acc_rogue',
    name: 'Hotel con PIN esposto',
    pinCode: 'LEAKED_PIN_9999'
  });
  const t8 = await firestoreRequest('PATCH', `trips/${TRIP_ID}/alloggi/acc_rogue`, rogueDoc, OWNER_UID);
  assert(t8.status === 403, `FAIL: Schema Guard non ha bloccato il salvataggio del PIN nel documento pubblico! Status: ${t8.status}`);
  passed++;
  console.log(`[PASS 08] Schema Guard attivo: Firestore rifiuta scritture pubbliche contenenti chiavi sensibili`);

  // TEST 9: Ospite Esterno non autenticato ha accesso al LIVE pubblico ma è bloccato sul viaggio
  const t9_live = await firestoreRequest('GET', `live_feeds/${TRIP_ID}/updates/up_1`, null, GUEST_UID);
  const t9_trip = await firestoreRequest('GET', `trips/${TRIP_ID}/alloggi/acc_1`, null, GUEST_UID);
  const t9_priv = await firestoreRequest('GET', `trips/${TRIP_ID}/private_credentials/alloggio_acc_1`, null, GUEST_UID);
  assert(t9_live.status === 200, `FAIL: Ospite non riesce a leggere il LIVE pubblico: ${t9_live.status}`);
  assert(t9_trip.status === 403, `FAIL: Ospite riesce a leggere documenti del viaggio: ${t9_trip.status}`);
  assert(t9_priv.status === 403, `FAIL: Ospite riesce a leggere credenziali private: ${t9_priv.status}`);
  passed++;
  console.log(`[PASS 09] LIVE Pubblico isolato: Ospiti esterni leggono solo il Feed, zero accesso al viaggio`);

  // TEST 10: Modifica autorizzata di credenziali da parte del Copilota
  const t10 = await firestoreRequest('PATCH', `trips/${TRIP_ID}/private_credentials/alloggio_acc_1`, toFirestoreFields({
    id: 'alloggio_acc_1',
    entityId: 'acc_1',
    pinCode: '1122#'
  }), COPILOTA_UID);
  assert(t10.status === 200, `FAIL: Copilota non riesce ad aggiornare private_credentials: ${t10.status}`);
  passed++;
  console.log(`[PASS 10] Copilota collabora regolarmente e aggiorna le credenziali nella cassaforte`);

  // TEST 11: Revoca ruolo Copilota -> Accesso immediato a private_credentials negato (403)
  await firestoreRequest('PATCH', `trips/${TRIP_ID}/members/${COPILOTA_UID}`, toFirestoreFields({ uid: COPILOTA_UID, role: 'viewer' }), OWNER_UID);
  const t11 = await firestoreRequest('GET', `trips/${TRIP_ID}/private_credentials/alloggio_acc_1`, null, COPILOTA_UID);
  assert(t11.status === 403, `FAIL: Ex-copilota declassato riesce ancora ad accedere a private_credentials! Status: ${t11.status}`);
  passed++;
  console.log(`[PASS 11] Declassamento Copilota a Viewer: accesso a private_credentials revocato istantaneamente (403)`);

  // TEST 12: Rimozione membro dal viaggio -> Zero accesso a qualsiasi documento del viaggio
  await firestoreRequest('DELETE', `trips/${TRIP_ID}/members/${COPILOTA_UID}`, null, OWNER_UID);
  // Rimuovi anche dall'array members del documento principale
  await firestoreRequest('PATCH', `trips/${TRIP_ID}`, toFirestoreFields({
    ownerUid: OWNER_UID,
    members: [OWNER_UID, VIEWER_UID]
  }), OWNER_UID);
  const t12_pub = await firestoreRequest('GET', `trips/${TRIP_ID}/alloggi/acc_1`, null, COPILOTA_UID);
  const t12_priv = await firestoreRequest('GET', `trips/${TRIP_ID}/private_credentials/alloggio_acc_1`, null, COPILOTA_UID);
  assert(t12_pub.status === 403, `FAIL: Utente rimosso legge ancora documenti pubblici: ${t12_pub.status}`);
  assert(t12_priv.status === 403, `FAIL: Utente rimosso legge ancora credenziali private: ${t12_priv.status}`);
  passed++;
  console.log(`[PASS 12] Rimozione membro: utente espulso perde ogni accesso sia all'itinerario che alla cassaforte (403)`);

  console.log('\n========================================================================');
  console.log(`ESITO TEST SICUREZZA: TUTTI I ${passed}/12 CONTROLLI SUPERATI CON SUCCESSO!`);
  console.log('========================================================================');
}

runSecuritySuite().catch((err) => {
  console.error('\nFAIL TEST SICUREZZA:', err);
  process.exit(1);
});
