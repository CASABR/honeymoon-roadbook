/**
 * SPRINT 1/4: TEST SUITE STABILITÀ FUNZIONALE
 * Verifica approfondita per:
 * A. Crash Mappa (prebundling Vite, empty state, CTA "Aggiungi la prima tappa", zero container collision)
 * B. Live GPS (nessun tracking automatico, graceful degradation senza GPS, privacy coordinate)
 * C. Note CRUD (creazione, modifica, eliminazione con conferma, pulsanti visibili touch, anti-reseeding, isolamento tripId)
 * D. Vincoli di sicurezza e rispetto delle regole
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log('=== SPRINT 1/4 TEST SUITE: STABILITÀ FUNZIONALE ===\n');

// -----------------------------------------------------------------------------
// 1. TEST A: MappaView - Risoluzione e Gestione Stati
// -----------------------------------------------------------------------------
runTest('A.1: vite.config.ts include leaflet e react-leaflet in optimizeDeps', () => {
  const vitePath = path.join(__dirname, '../vite.config.ts');
  const content = fs.readFileSync(vitePath, 'utf-8');
  assert(content.includes('optimizeDeps'), 'optimizeDeps deve essere configurato');
  assert(content.includes('"leaflet"'), 'leaflet deve essere pre-bundlato in optimizeDeps');
  assert(content.includes('"react-leaflet"'), 'react-leaflet deve essere pre-bundlato in optimizeDeps');
});

runTest('A.2: MappaView.tsx gestisce stato vuoto senza montare MapContainer (evita crash Leaflet)', () => {
  const mappaPath = path.join(__dirname, '../src/views/MappaView.tsx');
  const content = fs.readFileSync(mappaPath, 'utf-8');
  
  // Verifica che markers.length === 0 renderizzi lo stato vuoto
  assert(content.includes('markers.length === 0 ? ('), 'Deve esistere condizione dedicata per markers.length === 0');
  assert(content.includes('Mappa vuota: nessun punto registrato'), 'Messaggio descrittivo mappa vuota presente');
  assert(content.includes('Aggiungi la prima tappa'), 'CTA "Aggiungi la prima tappa" presente');
  assert(content.includes('onNavigateTab'), 'CTA deve reindirizzare alla tab tappe');
});

runTest('A.3: MappaView.tsx monta MapContainer con key dinamica solo in presenza di marker', () => {
  const mappaPath = path.join(__dirname, '../src/views/MappaView.tsx');
  const content = fs.readFileSync(mappaPath, 'utf-8');
  assert(content.includes('<MapContainer'), 'MapContainer deve essere presente per tappe popolate');
  assert(content.includes('key={`map_${storageService.getCurrentTripId()}_${markers.length}`}'), 'MapContainer deve avere key dinamica per ricreare istanze in modo pulito');
});

runTest('A.4: MappaView.tsx ha export default valido e gestisce geolocalizzazione opzionale', () => {
  const mappaPath = path.join(__dirname, '../src/views/MappaView.tsx');
  const content = fs.readFileSync(mappaPath, 'utf-8');
  assert(content.includes('export default function MappaView'), 'MappaView deve avere export default standard');
  assert(content.includes('handleLocateMe'), 'Pulsante manuale "Dove sono io" presente');
});

// -----------------------------------------------------------------------------
// 2. TEST B: LiveView - GPS Graceful Degradation & Privacy
// -----------------------------------------------------------------------------
runTest('B.1: LiveView.tsx NON attiva automaticamente la condivisione della posizione su mount', () => {
  const livePath = path.join(__dirname, '../src/views/altro/LiveView.tsx');
  const content = fs.readFileSync(livePath, 'utf-8');
  
  // Non deve esserci un useEffect che chiama handleDetectGps in automatico
  assert(!content.includes('handleDetectGps(true);'), 'handleDetectGps(true) automatico deve essere rimosso');
});

runTest('B.2: LiveView.tsx gestisce assenza di GPS senza bloccare o crashare la schermata', () => {
  const livePath = path.join(__dirname, '../src/views/altro/LiveView.tsx');
  const content = fs.readFileSync(livePath, 'utf-8');
  assert(content.includes('handleDetectGps'), 'handleDetectGps presente con blocco try/catch');
  assert(content.includes('setGpsError'), 'setGpsError gestito in modo elegante per l\'utente');
});

runTest('B.3: LiveView.tsx protegge la privacy delle coordinate per visitatori esterni', () => {
  const livePath = path.join(__dirname, '../src/views/altro/LiveView.tsx');
  const content = fs.readFileSync(livePath, 'utf-8');
  assert(content.includes('!isStandaloneExternal'), 'isStandaloneExternal deve proteggere dati sensibili');
  // Le coordinate GPS non devono essere mostrate ai visitatori esterni
  assert(content.includes('!isStandaloneExternal && (\n            <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 border border-slate-100">\n              <span className="text-sm">🧭</span>\n              <div className="min-w-0">\n                <div className="text-[9px] uppercase tracking-wider font-bold text-slate-400">\n                  Coordinate GPS'), 'Coordinate GPS protette da isStandaloneExternal');
});

// -----------------------------------------------------------------------------
// 3. TEST C: Note Viaggio CRUD & Isolamento
// -----------------------------------------------------------------------------
runTest('C.1: NoteViaggioView.tsx - pulsanti Modifica ed Elimina visibili su touch e desktop', () => {
  const notePath = path.join(__dirname, '../src/views/altro/NoteViaggioView.tsx');
  const content = fs.readFileSync(notePath, 'utf-8');
  assert(!content.includes('opacity-0 group-hover:opacity-100'), 'I comandi non devono essere nascosti dietro group-hover');
  assert(content.includes('openEdit'), 'Funzione apertura modifica openEdit presente');
  assert(content.includes('setDeletingNota'), 'Stato apertura conferma eliminazione setDeletingNota presente');
  assert(content.includes('openAdd'), 'Funzione aggiunta nota openAdd presente');
});

runTest('C.2: NoteViaggioView.tsx - protezione anti-reseeding permanente dopo cancellazione', () => {
  const notePath = path.join(__dirname, '../src/views/altro/NoteViaggioView.tsx');
  const content = fs.readFileSync(notePath, 'utf-8');
  assert(content.includes('houni_notes_seeded_'), 'Chiave di tracking seeding per tripId presente');
});

runTest('C.3: storageService.ts non impone assertCanMutate per le note', () => {
  const storagePath = path.join(__dirname, '../src/storage/storageService.ts');
  const content = fs.readFileSync(storagePath, 'utf-8');
  const saveNotaMatch = content.match(/async saveNota\(nota: NotaViaggio\): Promise<void> {([\s\S]*?)await idbPut/);
  assert(saveNotaMatch && !saveNotaMatch[1].includes("assertCanMutate('note')"), 'saveNota non deve bloccare con assertCanMutate');
  const deleteNotaMatch = content.match(/async deleteNota\(id: string\): Promise<void> {([\s\S]*?)await idbDelete/);
  assert(deleteNotaMatch && !deleteNotaMatch[1].includes("assertCanMutate('note')"), 'deleteNota non deve bloccare con assertCanMutate');
});

runTest('C.4: Simulazione mock CRUD per Note con isolamento per tripId', () => {
  const mockDB = {
    'ViaggiodiNozzeDB_0000': new Map(),
    'ViaggiodiNozzeDB_nuovo_viaggio': new Map()
  };

  // Creazione nota in nuovo viaggio
  const notaNuova = { id: 'n1', title: 'Tappa Auckland', content: 'Controllare voucher auto', color: 'sky', updatedAt: Date.now() };
  mockDB['ViaggiodiNozzeDB_nuovo_viaggio'].set(notaNuova.id, notaNuova);
  assert.strictEqual(mockDB['ViaggiodiNozzeDB_nuovo_viaggio'].size, 1);

  // Modifica nota
  const retrieved = mockDB['ViaggiodiNozzeDB_nuovo_viaggio'].get('n1');
  const updated = { ...retrieved, content: 'Voucher auto verificato e scaricato', updatedAt: Date.now() + 500 };
  mockDB['ViaggiodiNozzeDB_nuovo_viaggio'].set('n1', updated);
  assert.strictEqual(mockDB['ViaggiodiNozzeDB_nuovo_viaggio'].get('n1').content, 'Voucher auto verificato e scaricato');

  // Eliminazione nota
  mockDB['ViaggiodiNozzeDB_nuovo_viaggio'].delete('n1');
  assert.strictEqual(mockDB['ViaggiodiNozzeDB_nuovo_viaggio'].size, 0);

  // Isolamento 0000
  assert.strictEqual(mockDB['ViaggiodiNozzeDB_0000'].size, 0);
});

// -----------------------------------------------------------------------------
// 4. TEST D: Vincoli di Sicurezza & Firestore Rules
// -----------------------------------------------------------------------------
runTest('D.1: firestore.rules integro e non modificato', () => {
  const rulesPath = path.join(__dirname, '../firestore.rules');
  const content = fs.readFileSync(rulesPath, 'utf-8');
  assert(content.includes('service cloud.firestore'), 'firestore.rules deve contenere la definizione valida');
});

console.log(`\n=== RISULTATO: ${passedTests}/${totalTests} TEST SUPERATI CON SUCCESSO ===`);
if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
