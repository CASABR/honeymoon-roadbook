/**
 * Test mirato di certificazione dello sprint:
 * - Pulizia nuovi viaggi
 * - Isolamento tripId per IndexedDB, Budget, Note, Emergenze e Toolkit
 * - Integrità dei dati storici del viaggio 0000
 * - Verifica impostazioni tema (Light mode default)
 */

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

console.log('=== TEST SUITE: SPRINT SEMPLIFICAZIONE E PULIZIA UI ===\n');

// 1. Verifica default Light Mode in index.html e DarkModeToggle
console.log('Test 1: Default Light Mode');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
assert(!indexHtml.includes('!saved && prefersDark'), 'index.html non forza dark mode di default per utenti senza preferenze salvate');
assert(indexHtml.includes("if (saved === 'dark')"), 'index.html applica dark mode solo se saved === dark');

const darkModeToggle = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'common', 'DarkModeToggle.tsx'), 'utf-8');
assert(!darkModeToggle.includes('!saved && prefersDark'), 'DarkModeToggle non forza dark mode se !saved');
assert(darkModeToggle.includes("if (saved === 'dark')"), 'DarkModeToggle applica dark mode solo se saved === dark');

// 2. Verifica scoping e guardie in storageService.ts
console.log('\nTest 2: Guardie di isolamento per nuovi viaggi in storageService.ts');
const storageServiceSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage', 'storageService.ts'), 'utf-8');
assert(storageServiceSrc.includes('getCurrentTripId(): string'), 'storageService implementa getCurrentTripId()');
assert(storageServiceSrc.includes('if (this.getCurrentTripId() !== MASTER_TRIP_ID)'), 'ensureMasterTripSeedData e ensureRefuels hanno la guardia su MASTER_TRIP_ID');
assert(storageServiceSrc.includes('getTripBudget(): Promise'), 'storageService implementa getTripBudget()');
assert(storageServiceSrc.includes('saveTripBudget(amount: number | null)'), 'storageService implementa saveTripBudget()');

// 3. Verifica scoping di NoteViaggioView
console.log('\nTest 3: Note di Viaggio isolate per nuovi viaggi');
const noteViaggioSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'altro', 'NoteViaggioView.tsx'), 'utf-8');
assert(noteViaggioSrc.includes("currentTripId === '0000'"), 'NoteViaggioView non inietta SEED_NOTE se il viaggio non è 0000');
assert(noteViaggioSrc.includes('+ Aggiungi nota'), 'NoteViaggioView include CTA esatta "+ Aggiungi nota"');

// 4. Verifica Travel Toolkit ed Emergenze
console.log('\nTest 4: Travel Toolkit & Emergenze');
const emergenzeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'altro', 'EmergenzeToolkitView.tsx'), 'utf-8');
assert(emergenzeSrc.includes('emergency_directory_${storageService.getCurrentTripId()}'), 'Emergenze scoped per tripId');
assert(emergenzeSrc.includes('travel_toolkit_${storageService.getCurrentTripId()}'), 'Travel Toolkit scoped per tripId');
assert(emergenzeSrc.includes('Numeri di Emergenza Generali'), 'Contiene numeri di sicurezza generali sempre presenti');
assert(emergenzeSrc.includes('Contatti Personalizzati del Viaggio'), 'Contiene contatti personalizzati separati per viaggio');
assert(emergenzeSrc.includes('Checklist Pre-partenza'), 'Travel Toolkit contiene Checklist con palette Hounigo');

// 5. Verifica Spese & Budget
console.log('\nTest 5: Spese e Budget pulito per nuovi viaggi');
const speseBudgetSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'altro', 'SpeseBudgetView.tsx'), 'utf-8');
assert(speseBudgetSrc.includes('targetBudget === null ?'), 'SpeseBudgetView distingue budget non impostato');
assert(speseBudgetSrc.includes('Nessun budget fissato'), 'Mostra "Nessun budget fissato" quando targetBudget === null');
assert(speseBudgetSrc.includes('Fissato a 0 €'), 'Distingue esplicitamente un budget fissato a 0 €');
assert(speseBudgetSrc.includes('Nessuna spesa registrata'), 'Mostra empty state elegante quando non ci sono spese');
assert(speseBudgetSrc.includes('Aggiungi prima spesa'), 'Include CTA per aggiungere la prima spesa');

// 6. Verifica MappaView
console.log('\nTest 6: Mappa vuota con stato illustrativo elegante');
const mappaSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'MappaView.tsx'), 'utf-8');
assert(mappaSrc.includes('Mappa vuota: nessun punto registrato'), 'MappaView include stato illustrativo quando markers.length === 0');
assert(mappaSrc.includes('Aggiungi la prima tappa'), 'MappaView include CTA "+ Aggiungi la prima tappa"');

// 7. Verifica navigazione Altro
console.log('\nTest 7: Navigazione Altro');
const altroSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'AltroView.tsx'), 'utf-8');
assert(altroSrc.includes('reset_altro_root'), 'AltroView ascolta reset_altro_root per tornare sempre alla root di Altro');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf-8');
assert(appSrc.includes("window.dispatchEvent(new CustomEvent('reset_altro_root'))"), 'App.tsx emette reset_altro_root al click su Altro');

// 8. Verifica rimozione testi hardcoded "***REMOVED***" dai nuovi viaggi
console.log('\nTest 8: Nessun testo hardcoded ***REMOVED*** nei nuovi viaggi');
const gestioneSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'altro', 'GestioneViaggioView.tsx'), 'utf-8');
assert(!gestioneSrc.includes('placeholder="UID dispositivo di ***REMOVED*** *"'), 'GestioneViaggioView non ha placeholder hardcoded su ***REMOVED***');
assert(gestioneSrc.includes("initialConfig?.id === '0000' ? 'UID dispositivo di ***REMOVED*** *' : 'UID dispositivo Co-pilota *'"), 'GestioneViaggioView preserva ***REMOVED*** solo per viaggio 0000');

console.log(`\n========================================`);
console.log(`ESITO TEST: ${testsPassed} superati, ${testsFailed} falliti.`);
console.log(`========================================`);

if (testsFailed > 0) {
  process.exit(1);
}
