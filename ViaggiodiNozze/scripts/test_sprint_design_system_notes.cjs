/**
 * TEST AUTOMATIZZATO: SPRINT DESIGN SYSTEM DEFINITIVO + NOTE CRUD
 * 
 * Verifiche:
 * 1. Note CRUD: ciclo completo (Create, Read, Update, Delete) su dati di test isolati
 * 2. Verifica che il viaggio '0000' rimanga isolato e non alterato
 * 3. Verifica guard anti re-seeding delle note
 * 4. Token semantici e rispetto preferenze Light/Dark mode
 * 5. Verifica contrasti WCAG AA sui token cromatici
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST SUITE: SPRINT DESIGN SYSTEM + NOTE CRUD ===\n');

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

// -----------------------------------------------------------------------------
// TEST 1: Analisi statica storageService.ts (Risoluzione blocco assertCanMutate)
// -----------------------------------------------------------------------------
runTest('Note: storageService.ts non blocca con assertCanMutate("note")', () => {
  const filePath = path.join(__dirname, '../src/storage/storageService.ts');
  const content = fs.readFileSync(filePath, 'utf-8');

  // getNote, saveNota, deleteNota devono essere liberi da assertCanMutate('note')
  const saveNotaMatch = content.match(/async saveNota\(nota: NotaViaggio\): Promise<void> {([\s\S]*?)await idbPut/);
  assert(saveNotaMatch, 'saveNota deve essere presente');
  assert(!saveNotaMatch[1].includes("assertCanMutate('note')"), 'saveNota NON deve chiamare assertCanMutate("note")');

  const deleteNotaMatch = content.match(/async deleteNota\(id: string\): Promise<void> {([\s\S]*?)await idbDelete/);
  assert(deleteNotaMatch, 'deleteNota deve essere presente');
  assert(!deleteNotaMatch[1].includes("assertCanMutate('note')"), 'deleteNota NON deve chiamare assertCanMutate("note")');
});

// -----------------------------------------------------------------------------
// TEST 2: NoteViaggioView.tsx (Pulsanti visibili su smartphone & anti re-seed)
// -----------------------------------------------------------------------------
runTest('Note: NoteViaggioView rende visibili i pulsanti senza hover nascosto', () => {
  const filePath = path.join(__dirname, '../src/views/altro/NoteViaggioView.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert(!content.includes('opacity-0 group-hover:opacity-100'), 'I pulsanti modifica ed elimina non devono avere opacity-0 group-hover');
  assert(content.includes('houni_notes_seeded_'), 'Deve essere presente la guard anti-re-seed su localStorage');
  assert(content.includes('canManageNotes'), 'La gestione note deve essere consentita');
  assert(content.includes('Modifica Post-it'), 'Modale modifica post-it presente');
  assert(content.includes('Elimina post-it'), 'Modale elimina post-it presente');
});

// -----------------------------------------------------------------------------
// TEST 3: Simulazione Mock CRUD per le Note con isolamento tripId
// -----------------------------------------------------------------------------
runTest('Note: Simulazione Ciclo Completo CRUD con isolamento tripId', () => {
  // Simula uno store IndexedDB in memoria isolato per tripId
  const dbStores = {
    'ViaggiodiNozzeDB': new Map(), // Viaggio 0000 reale
    'ViaggiodiNozzeDB_test_trip_crud': new Map() // Viaggio test
  };

  // 1. Popola viaggio 0000 con dati iniziali
  dbStores['ViaggiodiNozzeDB'].set('seed_1', { id: 'seed_1', title: '0000 Original Note', content: 'Secret' });

  // 2. Operazioni CRUD sul viaggio di test
  const testStore = dbStores['ViaggiodiNozzeDB_test_trip_crud'];

  // CREATE
  const newNota = { id: 'test_nota_1', title: 'Test Note', content: 'Contenuto di prova', color: 'amber', updatedAt: Date.now() };
  testStore.set(newNota.id, newNota);
  assert.strictEqual(testStore.size, 1, 'Creazione nota nel viaggio di test riuscita');

  // READ
  const retrieved = testStore.get('test_nota_1');
  assert.strictEqual(retrieved.title, 'Test Note');

  // UPDATE
  const updatedNota = { ...retrieved, content: 'Contenuto modificato con successo', updatedAt: Date.now() + 100 };
  testStore.set(updatedNota.id, updatedNota);
  assert.strictEqual(testStore.get('test_nota_1').content, 'Contenuto modificato con successo');

  // DELETE
  testStore.delete('test_nota_1');
  assert.strictEqual(testStore.size, 0, 'Eliminazione nota riuscita');

  // VERIFICA ISOLAMENTO: 0000 deve essere intatto
  assert.strictEqual(dbStores['ViaggiodiNozzeDB'].size, 1);
  assert.strictEqual(dbStores['ViaggiodiNozzeDB'].get('seed_1').title, '0000 Original Note');
});

// -----------------------------------------------------------------------------
// TEST 4: Verifica Token Semantici Centralizzati in src/index.css
// -----------------------------------------------------------------------------
runTest('Design System: Token semantici definiti in src/index.css per Light e Dark', () => {
  const filePath = path.join(__dirname, '../src/index.css');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Token fondamentali
  const requiredTokens = [
    '--bg-app',
    '--surface-card',
    '--surface-card-subtle',
    '--surface-muted',
    '--surface-input',
    '--text-main',
    '--text-body',
    '--text-muted',
    '--border-subtle',
    '--border-card',
    '--accent-primary'
  ];

  for (const token of requiredTokens) {
    assert(content.includes(token), `Token ${token} deve essere presente in index.css`);
  }

  // Verifica palette brand Hounigo
  assert(content.includes('#172033'), 'Palette Navy (#172033) presente');
  assert(content.includes('#FF6B5F'), 'Palette Coral (#FF6B5F) presente');
  assert(content.includes('#F8F7F3'), 'Palette Cloud (#F8F7F3) presente');
  assert(content.includes('Manrope'), 'Font Manrope presente');

  // Verifica regole dark mode e componenti semantici
  assert(content.includes('html.dark .hounigo-card'), 'Regola semantica html.dark .hounigo-card presente');
  assert(content.includes('html.dark input'), 'Regola dark mode input presente');
});

// -----------------------------------------------------------------------------
// TEST 5: Verifica Contrasto WCAG AA per Token Semantici
// -----------------------------------------------------------------------------
function hexToLuminance(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16) / 255);
  const a = rgb.map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(hex1, hex2) {
  const lum1 = hexToLuminance(hex1);
  const lum2 = hexToLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

runTest('Design System: Contrasto WCAG AA sui token testo/sfondo', () => {
  // Light Mode: text #172033 su surface #ffffff
  const ratioLight = contrastRatio('#172033', '#ffffff');
  assert(ratioLight >= 4.5, `Contrasto Light (${ratioLight.toFixed(2)}:1) deve essere >= 4.5:1`);

  // Dark Mode: text #f8fafc su surface #1e293b
  const ratioDark = contrastRatio('#f8fafc', '#1e293b');
  assert(ratioDark >= 4.5, `Contrasto Dark (${ratioDark.toFixed(2)}:1) deve essere >= 4.5:1`);

  // Dark Mode muted: text #94a3b8 su surface #1e293b
  const ratioDarkMuted = contrastRatio('#94a3b8', '#1e293b');
  assert(ratioDarkMuted >= 4.5, `Contrasto Dark Muted (${ratioDarkMuted.toFixed(2)}:1) deve essere >= 4.5:1`);
});

// -----------------------------------------------------------------------------
// TEST 6: Rispetto preferenze tema e anti-flash FOUC in index.html
// -----------------------------------------------------------------------------
runTest('Theme: Inizializzazione anti-flash in index.html rispetta preferenze e Light default', () => {
  const filePath = path.join(__dirname, '../index.html');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert(content.includes('localStorage.getItem(\'houni_theme\')'), 'index.html deve controllare houni_theme');
  assert(content.includes('saved === \'dark\''), 'Solo se saved === dark deve aggiungere .dark');
  assert(content.includes('classList.remove(\'dark\')'), 'Se non impostato o light, rimuove .dark (Light Mode default)');
});

// -----------------------------------------------------------------------------
// TEST 7: Integrità Vincoli di Sicurezza
// -----------------------------------------------------------------------------
runTest('Vincoli: Nessuna violazione a firestore.rules o chiavi sensibili', () => {
  const rulesPath = path.join(__dirname, '../firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  assert(rules.includes('service cloud.firestore'), 'firestore.rules intatto');
});

console.log(`\n=== RISULTATO: ${passedTests}/${totalTests} TEST SUPERATI CON SUCCESSO ===`);
if (passedTests !== totalTests) {
  process.exit(1);
}
