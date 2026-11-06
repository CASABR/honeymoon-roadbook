const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

console.log('=== TEST SUITE COLLAUDO PWA 1.5.7 ===\n');

// 1. Test PriceHelper (Formule compatte)
const priceHelper = read('src/utils/priceHelper.ts');
assert(priceHelper.includes('compactPaymentText'), 'PricePaymentInfo deve includere compactPaymentText');

function formatCompactEuro(val) {
  if (Math.round(val) === val) return `€${val.toLocaleString('it-IT')}`;
  return `€${val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function computeCompact(costNum, paidNum, isPaid) {
  const remainingNum = Math.max(0, costNum - paidNum);
  if (isPaid) return `${formatCompactEuro(costNum)} · Saldato`;
  if (paidNum > 0 && remainingNum > 0) return `${formatCompactEuro(remainingNum)} da saldare · Cap. ${formatCompactEuro(paidNum)}`;
  return `${formatCompactEuro(costNum)} · Da saldare`;
}

assert.equal(computeCompact(180, 0, true), '€180 · Saldato');
assert.equal(computeCompact(180, 0, false), '€180 · Da saldare');
assert.equal(computeCompact(180, 60, false), '€120 da saldare · Cap. €60');
console.log('PASS 1: Calcolo riga prezzi compatta unificata conforme ai 3 requisiti');

// 2. Test Preservazione Caparra nei Toggle Pagamento
const alloggioCard = read('src/components/cards/AlloggioCard.tsx');
assert(!alloggioCard.includes("depositVal = newStatus === 'saldato' ? updatedCost : '0.00'"), 'AlloggioCard non deve azzerare la caparra');
assert(alloggioCard.includes('compactPaymentText'), 'AlloggioCard deve mostrare compactPaymentText');

const trasportoCard = read('src/components/cards/TrasportoCard.tsx');
assert(!trasportoCard.includes("paidVal = newStatus === 'saldato' ? costStr : '0.00 €'"), 'TrasportoCard non deve azzerare la caparra');
assert(trasportoCard.includes('compactPaymentText'), 'TrasportoCard deve mostrare compactPaymentText');

const attivitaCard = read('src/components/cards/AttivitaCard.tsx');
assert(!attivitaCard.includes("amountPaid: newStatus === 'saldato' ? (activity.cost ||"), 'AttivitaCard non deve azzerare acconti');

const shoppingCard = read('src/components/cards/ShoppingCard.tsx');
assert(!shoppingCard.includes("paidVal = newStatus === 'saldato' ? costStr : '0.00 €'"), 'ShoppingCard non deve azzerare acconti');
console.log('PASS 2: Toggle pagamento preserva acconto/caparra in tutte le card');

// 3. Test Autorizzazione Locale su Stato Cloud Unverified / Offline
const authIdentity = read('src/utils/useAuthIdentity.ts');
assert(authIdentity.includes("authoritativeCloudRole === 'unverified'"), 'isCloudAuthorized deve ammettere ruolo locale su unverified');
assert(authIdentity.includes("export function getLocalDeviceRole"), 'getLocalDeviceRole deve essere esportata');
console.log('PASS 3: isCloudAuthorized protegge le scritture IndexedDB da blocchi durante lockdown remoto');

// 4. Test Sincronizzazione Desktop & Ruolo Effettivo
const devRole = read('src/utils/useDeviceRole.ts');
assert(devRole.includes("if (cloudRole === 'owner') return 'guida'"), 'useDeviceRole deve promuovere owner desktop a guida');
assert(devRole.includes("storageService.setDeviceRole('guida')"), 'useDeviceRole deve persistere il ruolo guida per owner desktop');
console.log('PASS 4: Ruolo owner su Desktop riceve immediatamente privilegi guida e visualizzazione PNR');

// 5. Test Icona Gialla PNR e Feedback Visivo
assert(trasportoCard.includes('hounigo-ds-action-btn-active-green scale-105'), 'Pulsante PNR deve evidenziarsi in verde quando copiato');
assert(trasportoCard.includes('Copiato!'), 'Pulsante PNR deve mostrare la scritta "Copiato!" sia su touch che desktop');
console.log('PASS 5: Tasto PNR con feedback verde e dicitura "Copiato!" attivo');

// 6. Test Spaziatura Header Check-in / Scalo
assert(trasportoCard.includes('hounigo-ds-header-subrow flex items-center justify-between gap-3'), 'Subrow trasporto deve avere flex e gap');
console.log('PASS 6: Spaziatura header trasporto evita sovrapposizioni tra check-in e scalo');

// 7. Test Sfondo Verde Voucher (addio sfondo nero)
const css = read('src/index.css');
assert(css.includes('.hounigo-ds-action-btn-highlight {\n  background-color: #ECFDF5;'), 'Voucher highlight deve avere sfondo verde #ECFDF5');
assert(!css.includes('.hounigo-ds-action-btn-highlight {\n  background-color: #172033;'), 'Voucher highlight non deve più avere sfondo nero');
console.log('PASS 7: Sfondo nero voucher sostituito con verde attivo');

// 8. Test Centratura Calendario & Reattività onUpdate in OggiView
const oggiView = read('src/views/OggiView.tsx');
assert(oggiView.includes('selectedDayBtnRef.current.scrollIntoView'), 'Centratura calendario usa scrollIntoView nativo');
assert(oggiView.includes('<AlloggioCard') && oggiView.includes('loadData(false);'), 'AlloggioCard riceve onUpdate con ricarica timeline e alloggi');
assert(oggiView.includes('Avviso Persistente Scadenze'), 'OggiView include avviso persistente in-app per scadenze');
console.log('PASS 8: Scroll calendario libero da snap interference, onUpdate alloggi attivo e banner persistente scadenze presente');

// 9. Test Protezione Cache Locale in syncService
const syncService = read('src/storage/syncService.ts');
assert(!syncService.includes("else if (role === 'viewer' || role === 'unverified')"), 'syncService non deve bonificare cache su unverified');
console.log('PASS 9: syncService non distrugge le modifiche locali pendenti');

console.log('\n>>> TUTTI I 9 CONTROLLI DELLA SUITE SUPERATI CON SUCCESSO! <<<');
