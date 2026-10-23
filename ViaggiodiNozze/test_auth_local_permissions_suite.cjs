/**
 * TEST SUITE: AUTORIZZAZIONI LOCALI, SYNC AUTOMATICO & RECUPERO PERMESSI
 * Verifica approfondita dei requisiti di sicurezza autorizzativa per HOUNIGO.
 *
 * DISTINZIONE FONDAMENTALE SULL'AMBIENTE DI TEST:
 * 1. PARTE A: Analisi statica e di integrità del CODICE REALE SORGENTE (file TypeScript di produzione).
 *    Verifica la presenza fisica ed effettiva dei guardrail, dei listener e del mutex nei file dell'applicazione.
 * 2. PARTE B: Test comportamentale mockato a runtime (Node.js).
 *    Simula la macchina a stati autorizzativa, la concorrenza, il debouncing e la riconciliazione
 *    senza invocare Firebase Emulator né eseguire scritture su database remoto.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function runTest(section, name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] [${section}] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] [${section}] Test ${totalTests}: ${name}`);
    console.error(`         Errore: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('======================================================================');
console.log('HOUNIGO - SUITE AUTORIZZAZIONI LOCALI, SYNC AUTOMATICO & RESUMPTION');
console.log('======================================================================\n');

const ROOT_DIR = path.resolve(__dirname);
const SYNC_SERVICE_PATH = path.join(ROOT_DIR, 'src', 'storage', 'syncService.ts');
const LIVE_SERVICE_PATH = path.join(ROOT_DIR, 'src', 'services', 'liveService.ts');
const STORAGE_SERVICE_PATH = path.join(ROOT_DIR, 'src', 'storage', 'storageService.ts');
const OGGI_VIEW_PATH = path.join(ROOT_DIR, 'src', 'views', 'OggiView.tsx');
const LIVE_VIEW_PATH = path.join(ROOT_DIR, 'src', 'views', 'altro', 'LiveView.tsx');

// ============================================================================
// PARTE A: VERIFICA STATICA SUL CODICE SORGENTE REALE DI PRODUZIONE
// ============================================================================
console.log('--- PARTE A: VERIFICHE SUL CODICE REALE SORGENTE (FILE DI PRODUZIONE) ---');

runTest('CODICE REALE', 'liveService.ts: publishToLive riconosce ownerUid anche se assente da members', () => {
  const code = fs.readFileSync(LIVE_SERVICE_PATH, 'utf8');
  assert.ok(
    code.includes('isOwner = tripData?.ownerUid === user.uid') || code.includes('tripData?.ownerUid === user.uid'),
    'liveService.ts deve verificare se user.uid corrisponde a tripData.ownerUid'
  );
  assert.ok(
    code.includes('if (!isOwner && !isMember)'),
    'liveService.ts deve consentire la pubblicazione se isOwner O isMember'
  );
});

runTest('CODICE REALE', 'syncService.ts: percorsi di scrittura residui in syncBidirectional() sono protetti', () => {
  const code = fs.readFileSync(SYNC_SERVICE_PATH, 'utf8');
  assert.ok(
    code.includes('isCloudAuthorized()') && code.includes('Sospesa eliminazione cloud per tombstone'),
    'syncBidirectional() deve proteggere deleteDoc con isCloudAuthorized()'
  );
  assert.ok(
    code.includes('Sospeso push per') && code.includes('modifiche locali preservate in attesa di autorizzazione cloud'),
    'syncBidirectional() deve proteggere il push locale e preservare i dati in IndexedDB'
  );
});

runTest('CODICE REALE', 'syncService.ts: percorsi di scrittura residui in setupCloudListeners() sono protetti', () => {
  const code = fs.readFileSync(SYNC_SERVICE_PATH, 'utf8');
  assert.ok(
    code.includes('Sospesa cancellazione remota per') && code.includes('in attesa di autorizzazione cloud'),
    'setupCloudListeners() deve sospendere deleteDoc del tombstone se non autorizzato'
  );
  assert.ok(
    code.includes('Sospeso push per') && code.includes('sessione non autorizzata, dato locale piu recente conservato'),
    'setupCloudListeners() deve sospendere setDoc del dato più recente se non autorizzato'
  );
});

runTest('CODICE REALE', 'syncService.ts: listener automatici houni_cloud_role_changed e online implementati', () => {
  const code = fs.readFileSync(SYNC_SERVICE_PATH, 'utf8');
  assert.ok(
    code.includes('houni_cloud_role_changed') && code.includes('triggerAutomaticSync(\'cloud_role_authorized\')'),
    'syncService.ts deve ascoltare houni_cloud_role_changed e avviare il sync automatico'
  );
  assert.ok(
    code.includes("'online'") && code.includes('triggerAutomaticSync(\'network_online\')'),
    'syncService.ts deve ascoltare online e verificare le autorizzazioni per il sync'
  );
});

runTest('CODICE REALE', 'syncService.ts: mutex di concorrenza, accodamento e cleanup in destroy()', () => {
  const code = fs.readFileSync(SYNC_SERVICE_PATH, 'utf8');
  assert.ok(
    code.includes('isSyncing') && code.includes('pendingSyncRequest'),
    'syncService.ts deve disporre di isSyncing e pendingSyncRequest per evitare collisioni simultanee'
  );
  assert.ok(
    code.includes('destroy()') && code.includes('domListeners') && code.includes('removeEventListener'),
    'syncService.ts destroy() deve rimuovere tutti i domListeners registrati'
  );
  assert.ok(
    code.includes('tombstoneSetting') && code.includes('!serverDocIds.has(localItem.id)'),
    'syncBidirectional() non deve pushare record locali se coperti da tombstone'
  );
});

runTest('CODICE REALE', 'storageService.ts: saveDayMapLink è protetto da assertCanMutate', () => {
  const code = fs.readFileSync(STORAGE_SERVICE_PATH, 'utf8');
  const methodMatch = code.match(/async\s+saveDayMapLink\s*\([^\)]*\)\s*:\s*Promise<void>\s*\{([^}]+)\}/);
  assert.ok(methodMatch, 'saveDayMapLink deve esistere in storageService.ts');
  assert.ok(
    methodMatch[1].includes("assertCanMutate('settings')"),
    'saveDayMapLink deve invocare assertCanMutate(\'settings\') prima di qualsiasi scrittura'
  );
});

runTest('CODICE REALE', 'OggiView.tsx: handleSaveDayMapLink e banner link sono protetti da canEdit', () => {
  const code = fs.readFileSync(OGGI_VIEW_PATH, 'utf8');
  assert.ok(
    code.includes('if (!canEdit) return;'),
    'OggiView.tsx deve bloccare handleSaveDayMapLink se canEdit è false'
  );
  assert.ok(
    code.includes('if (canEdit && !dayMapLink)'),
    'OggiView.tsx non deve aprire la modale di inserimento per viewer se non autorizzato'
  );
});

runTest('CODICE REALE', 'LiveView.tsx: GPS è vincolato a cloudRole === owner', () => {
  const code = fs.readFileSync(LIVE_VIEW_PATH, 'utf8');
  assert.ok(
    code.includes("if (cloudRole !== 'owner')"),
    'LiveView.tsx deve bloccare la trasmissione GPS se cloudRole non è owner'
  );
  assert.ok(
    code.includes("deviceRole === 'guida' && isCloudOwner"),
    'LiveView.tsx deve richiedere sia deviceRole guida sia isCloudOwner per la geolocalizzazione automatica'
  );
});

// ============================================================================
// PARTE B: SIMULAZIONE COMPORTAMENTALE ISOLATA DEI FLUSSI (MOCK DICHIARATI)
// ============================================================================
console.log('\n--- PARTE B: SIMULAZIONI COMPORTAMENTALI DEI FLUSSI (MOCK DICHIARATI) ---');

class MockLiveAuthorizationChecker {
  canPublishToLive(user, tripData) {
    if (!user || !user.uid) return false;
    const members = Array.isArray(tripData?.members) ? tripData.members : [];
    const isOwner = tripData?.ownerUid === user.uid;
    const isMember = members.includes(user.uid);
    return isOwner || isMember;
  }
}

class MockAutomaticSyncEngine {
  constructor() {
    this.cloudRole = 'checking';
    this.isOnline = false;
    this.isSyncing = false;
    this.pendingSyncRequest = false;
    this.syncExecutions = [];
    this.pushedItems = [];
    this.localStore = new Map();
    this.tombstones = new Set();
  }

  isCloudAuthorized() {
    return this.cloudRole === 'owner' || this.cloudRole === 'copilota';
  }

  setCloudRole(role) {
    this.cloudRole = role;
    if (this.isCloudAuthorized()) {
      this.triggerAutomaticSync('cloud_role_authorized');
    }
  }

  setOnline(online) {
    this.isOnline = online;
    if (online && this.isCloudAuthorized()) {
      this.triggerAutomaticSync('network_online');
    }
  }

  triggerAutomaticSync(reason) {
    if (!this.isCloudAuthorized()) return;
    if (this.isSyncing) {
      this.pendingSyncRequest = true;
      return;
    }
    this.executeSync(reason);
  }

  executeSync(reason) {
    this.isSyncing = true;
    this.syncExecutions.push(reason);

    try {
      // Simula sincronizzazione dei dati locali pendenti verso cloud
      for (const [id, item] of this.localStore.entries()) {
        if (this.tombstones.has(id)) continue;
        if (!item.syncedToCloud) {
          this.pushedItems.push({ id, ...item });
          item.syncedToCloud = true;
        }
      }
    } finally {
      this.isSyncing = false;
      if (this.pendingSyncRequest) {
        this.pendingSyncRequest = false;
        this.executeSync('pending_queued');
      }
    }
  }
}

runTest('MOCK COMPORTAMENTALE', '1. Owner in ownerUid ma assente da members: autorizzato a pubblicare', () => {
  const checker = new MockLiveAuthorizationChecker();
  const ownerUser = { uid: 'nunzio_real_uid' };
  const tripData = {
    ownerUid: 'nunzio_real_uid',
    members: ['copilota_uid_1', 'copilota_uid_2'] // Assente da members
  };

  assert.strictEqual(
    checker.canPublishToLive(ownerUser, tripData),
    true,
    'L\'owner deve essere autorizzato anche se non presente in members'
  );

  const stranger = { uid: 'stranger_uid' };
  assert.strictEqual(
    checker.canPublishToLive(stranger, tripData),
    false,
    'Utente estraneo non deve poter pubblicare'
  );
});

runTest('MOCK COMPORTAMENTALE', '2. Transizione checking -> owner avvia automaticamente la sincronizzazione', () => {
  const engine = new MockAutomaticSyncEngine();
  // Creazione di una modifica offline
  engine.localStore.set('act_offline_1', { id: 'act_offline_1', title: 'Visita Museo', syncedToCloud: false });

  assert.strictEqual(engine.syncExecutions.length, 0, 'In stato checking non deve avvenire alcun sync');
  assert.strictEqual(engine.pushedItems.length, 0);

  // Convalida cloud a owner
  engine.setCloudRole('owner');

  assert.strictEqual(engine.syncExecutions.length, 1);
  assert.strictEqual(engine.syncExecutions[0], 'cloud_role_authorized');
  assert.strictEqual(engine.pushedItems.length, 1, 'L\'elemento pendente deve essere stato sincronizzato automaticamente');
  assert.strictEqual(engine.pushedItems[0].id, 'act_offline_1');
});

runTest('MOCK COMPORTAMENTALE', '3. Ritorno online scatena il sync automatico per sessione autorizzata', () => {
  const engine = new MockAutomaticSyncEngine();
  engine.cloudRole = 'copilota'; // Già copilota ma era offline
  engine.localStore.set('spesa_1', { id: 'spesa_1', amount: 45, syncedToCloud: false });

  // Dispositivo torna online
  engine.setOnline(true);

  assert.strictEqual(engine.syncExecutions.length, 1);
  assert.strictEqual(engine.syncExecutions[0], 'network_online');
  assert.strictEqual(engine.pushedItems.length, 1);
  assert.strictEqual(engine.pushedItems[0].id, 'spesa_1');
});

runTest('MOCK COMPORTAMENTALE', '4. Gestione concorrenza e mutex: richieste simultanee vengono accodate ed eseguite ordinatamente', () => {
  const engine = new MockAutomaticSyncEngine();
  engine.cloudRole = 'owner';
  
  // Forza stato isSyncing attivo per simulare richiesta in volo
  engine.isSyncing = true;
  engine.localStore.set('item_queued', { id: 'item_queued', title: 'Tour', syncedToCloud: false });

  // Arriva un nuovo trigger mentre un sync è in corso
  engine.triggerAutomaticSync('concorrente_1');
  assert.strictEqual(engine.pendingSyncRequest, true, 'La richiesta deve essere accodata');
  assert.strictEqual(engine.pushedItems.length, 0, 'Nessun push simultaneo deve avvenire');

  // Termina il sync in volo
  engine.isSyncing = false;
  // Esecuzione della richiesta accodata
  if (engine.pendingSyncRequest) {
    engine.pendingSyncRequest = false;
    engine.executeSync('pending_queued');
  }

  assert.strictEqual(engine.syncExecutions.includes('pending_queued'), true);
  assert.strictEqual(engine.pushedItems.length, 1);
  assert.strictEqual(engine.pushedItems[0].id, 'item_queued');
});

runTest('MOCK COMPORTAMENTALE', '5. Tombstone impedisce resurrezione di elementi eliminati offline durante il sync automatico', () => {
  const engine = new MockAutomaticSyncEngine();
  // Elemento creato e poi eliminato localmente con tombstone
  engine.localStore.set('act_deleted', { id: 'act_deleted', title: 'Attività annullata', syncedToCloud: false });
  engine.tombstones.add('act_deleted');

  engine.setCloudRole('owner');

  assert.strictEqual(engine.syncExecutions.length, 1);
  // L'elemento con tombstone NON deve essere pushato come record attivo
  assert.strictEqual(engine.pushedItems.length, 0, 'Elemento con tombstone non deve essere inviato come record attivo');
});

runTest('MOCK COMPORTAMENTALE', '6. Viewer e non autorizzati non innescano sync automatico nè scritture', () => {
  const engine = new MockAutomaticSyncEngine();
  engine.localStore.set('fake_item', { id: 'fake_item', syncedToCloud: false });

  // Ruolo viewer confermato dal cloud
  engine.setCloudRole('viewer');
  assert.strictEqual(engine.syncExecutions.length, 0);
  assert.strictEqual(engine.pushedItems.length, 0);

  // Ritorno online per viewer
  engine.setOnline(true);
  assert.strictEqual(engine.syncExecutions.length, 0);
  assert.strictEqual(engine.pushedItems.length, 0);
});

console.log('----------------------------------------------------------------------');
console.log(`Esito Test Suite: ${passedTests}/${totalTests} superati.`);
if (passedTests === totalTests) {
  console.log('TUTTI I REQUISITI (CODICE REALE + MOCK) SONO VERIFICATI CON SUCCESSO.');
} else {
  console.error('ALCUNI TEST SONO FALLITI.');
  process.exit(1);
}
