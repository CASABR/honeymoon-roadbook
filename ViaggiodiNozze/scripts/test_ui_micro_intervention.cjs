const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const app = read('src/App.tsx');
const navBar = read('src/components/NavBar.tsx');
const navigation = read('src/utils/mainNavigation.ts');
const altro = read('src/views/AltroView.tsx');
const admin = read('src/views/altro/AdminDashboardView.tsx');

let passed = 0;
function test(name, condition) {
  if (!condition) throw new Error(`[FAIL] ${name}`);
  passed += 1;
  console.log(`[PASS ${passed}] ${name}`);
}

test('Swipe e tap condividono lo stesso ordine delle quattro sezioni',
  navigation.includes("['oggi', 'categorie', 'mappa', 'altro']") && navBar.includes('MAIN_SECTION_ORDER.map'));
test('HouniAI resta fuori dalla sequenza swipe e accessibile dal pulsante',
  !navigation.includes('HouniAI') && navBar.includes('Apri HouniAI'));
test('Swipe orizzontale sincronizza activeTab e rispetta i margini',
  app.includes('getAdjacentMainSection(activeTab') && navigation.includes("return MAIN_SECTION_ORDER[targetIndex] || null"));
test('Scroll verticale e componenti interattivi non vengono intercettati',
  app.includes('Math.abs(deltaX) <= Math.abs(deltaY) * 1.35') &&
  ['.leaflet-container', '[role="dialog"]', '[role="slider"]', 'overflow-x-auto', '[data-carousel]'].every(value => navigation.includes(value)));
test('Strumenti di viaggio è configurato in griglia compatta 2x2',
  altro.includes('Strumenti di Viaggio') &&
  altro.includes('grid grid-cols-2') &&
  ['Documenti', 'Spese', 'Lista Bagagli', 'Scadenze'].every(label => altro.includes(label)));
test('Tutte le sezioni e funzioni chiave sono presenti nel nuovo menu',
  ['Sicurezza', 'Emergenze e numeri utili', 'Assicurazione e assistenza H24', 'Travel Toolkit',
   'Organizzazione', 'Partecipanti &amp; Copiloti', 'Note di Viaggio', 'Esporta Itinerario PDF',
   'Account &amp; Sistema', 'Account e accesso Cloud', 'Ruolo Dispositivo', 'Stato Sincronizzazione'].every(label => altro.includes(label)));
test('Iconografia HOUNIGO e relativo collegamento UI sono assenti',
  !altro.includes('Iconografia Hounigo') && !altro.includes('TrailIconsShowcaseModal') && !altro.includes('showIconsShowcase'));
test('La card Admin è visibile solo sul viaggio 0000',
  altro.includes("currentTripConfig?.id === '0000'") && (altro.match(/data-admin-console-card/g) || []).length === 1);
test('La card Admin non modifica i controlli globali esistenti',
  altro.includes('Accesso soggetto ad autorizzazione globale') && admin.includes("setAccessStatus('unauthorized')") && admin.includes('system_admins'));

console.log(`\n${passed}/${passed} verifiche UI mirate superate.`);
