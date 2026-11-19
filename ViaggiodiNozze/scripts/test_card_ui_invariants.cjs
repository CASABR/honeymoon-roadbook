/**
 * TEST PERMANENTE ANTI-REGRESSIONE UI — HOUNIGO
 * Verifica le decisioni permanenti di interfaccia e i componenti critici già approvati:
 * 1. Orari delle 6 categorie (Alloggio, Attivita, Ristorante, Shopping, Tappa, Trasporto)
 *    sempre nell'header superiore (.hounigo-ds-header-top / CardHeaderTimeBadge), mai accanto al titolo <h3>.
 * 2. Nessuna duplicazione degli orari nel body delle card o reintroduzione di CardTitleWithTime / title-row inline.
 * 3. Fronte AlloggioCard senza inviti proattivi al check-in (badge solo se checkInDone è true).
 * 4. Swipe orizzontale in OggiView dedicato esclusivamente al cambio giorno.
 * 5. Conservazione delle guardie critiche di sync Firestore (1.6.27), push notifiche (1.6.28) e GPS LIVE (1.6.29).
 *
 * Esecuzione rapida (Node): node ViaggiodiNozze/scripts/test_card_ui_invariants.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const CARD_FILES = [
  'AlloggioCard',
  'AttivitaCard',
  'RistoranteCard',
  'ShoppingCard',
  'TappaCard',
  'TrasportoCard',
];

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed += 1;
  }
}

function collectSourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('=== HOUNIGO — REGRESSION TEST PERMANENTE UI & INVARIANTI CRITICHE ===\n');

const badgeSource = read('src/components/cards/CardHeaderTimeBadge.tsx');
const cssSource = read('src/index.css');
const oggiSource = read('src/views/OggiView.tsx');
const appSource = read('src/App.tsx');
const syncSource = read('src/storage/syncService.ts');
const pushHookSource = read('src/hooks/usePushNotifications.ts');
const gpsSource = read('src/services/liveGpsContinuity.ts');

check('1. CardHeaderTimeBadge esiste ed espone .hounigo-ds-time-stamp + data-time-status', () => {
  assert(badgeSource.includes('export default function CardHeaderTimeBadge'), 'Componente CardHeaderTimeBadge mancante');
  assert(badgeSource.includes('data-time-status={status}'), 'Attributo data-time-status mancante su CardHeaderTimeBadge');
  assert(badgeSource.includes('hounigo-ds-time-stamp'), 'Classe .hounigo-ds-time-stamp mancante');
});

for (const cardName of CARD_FILES) {
  const relPath = `src/components/cards/${cardName}.tsx`;
  const src = read(relPath);
  const headerIdx = src.indexOf('hounigo-ds-card-header');
  const bodyIdx = src.indexOf('className="hounigo-ds-card-body"');

  check(`2.${CARD_FILES.indexOf(cardName) + 1} [${cardName}] orario esclusivamente in header-top, zero duplicazione nel body`, () => {
    assert(headerIdx !== -1 && bodyIdx !== -1 && headerIdx < bodyIdx, `${cardName}: struttura header -> body mancante`);
    const headerSlice = src.slice(headerIdx, bodyIdx);
    const bodySlice = src.slice(bodyIdx);

    assert(src.includes("import CardHeaderTimeBadge from './CardHeaderTimeBadge';"), `${cardName}: import CardHeaderTimeBadge mancante`);
    assert(headerSlice.includes('hounigo-ds-header-top'), `${cardName}: .hounigo-ds-header-top mancante nell'header`);
    assert(headerSlice.includes('hounigo-ds-header-cat'), `${cardName}: .hounigo-ds-header-cat mancante nell'header`);
    assert(headerSlice.includes('<CardHeaderTimeBadge'), `${cardName}: <CardHeaderTimeBadge non reso dentro .hounigo-ds-card-header`);
    assert(!src.includes('CardTitleWithTime'), `${cardName}: riferimento vietato a CardTitleWithTime`);

    assert(!bodySlice.includes('<CardHeaderTimeBadge'), `${cardName}: <CardHeaderTimeBadge trovato nel body`);
    assert(!bodySlice.includes('CardTitleWithTime'), `${cardName}: CardTitleWithTime trovato nel body`);
    assert(!bodySlice.includes('hounigo-ds-title-row'), `${cardName}: .hounigo-ds-title-row trovato nel body`);
    assert(!bodySlice.includes('hounigo-ds-time-stamp'), `${cardName}: .hounigo-ds-time-stamp duplicato nel body`);
    assert(!bodySlice.includes('headerTimeSummary'), `${cardName}: headerTimeSummary usato nel body`);
    assert(bodySlice.includes('<h3'), `${cardName}: titolo <h3> mancante nel body`);
  });
}

check('3. Nessun file in src/ importa o usa CardTitleWithTime', () => {
  const srcFiles = collectSourceFiles(path.join(root, 'src')).filter(
    (filePath) => !filePath.endsWith(`${path.sep}CardTitleWithTime.tsx`)
  );
  const offenders = srcFiles.filter((filePath) => fs.readFileSync(filePath, 'utf8').includes('CardTitleWithTime'));
  assert.deepEqual(offenders, [], `Riferimenti residui a CardTitleWithTime in: ${offenders.join(', ')}`);
});

check('4. index.css preserva layout header flessibile (.hounigo-ds-header-top/.hounigo-ds-header-cat) senza classi inline titolo', () => {
  assert(cssSource.includes('.hounigo-ds-header-top {'), '.hounigo-ds-header-top mancante in src/index.css');
  assert(cssSource.includes('flex-wrap: wrap;'), 'flex-wrap mancante per testi/badge lunghi');
  assert(cssSource.includes('.hounigo-ds-header-cat {'), '.hounigo-ds-header-cat mancante in src/index.css');
  assert(cssSource.includes('.hounigo-ds-time-stamp {'), '.hounigo-ds-time-stamp mancante in src/index.css');
  assert(cssSource.includes('max-width: 100%;'), 'max-width: 100% mancante su .hounigo-ds-time-stamp');
  assert(!cssSource.includes('.hounigo-ds-title-row'), 'Classe vietata .hounigo-ds-title-row presente in index.css');
  assert(!cssSource.includes('hounigo-ds-time-stamp--inline'), 'Classe vietata .hounigo-ds-time-stamp--inline presente in index.css');
});

check('5. Tutte le 6 card preservano indicatori confermato/indicativo, orari multipli e fallback previsti', () => {
  const alloggio = read('src/components/cards/AlloggioCard.tsx');
  assert(alloggio.includes('IN ${accommodation.checkInTime} · OUT ${accommodation.checkOutTime}'), 'AlloggioCard: formato IN/OUT mancante');
  assert(alloggio.includes('Check-in ${accommodation.checkInTime}'), 'AlloggioCard: fallback solo Check-in mancante');
  assert(alloggio.includes('Check-out ${accommodation.checkOutTime}'), 'AlloggioCard: fallback solo Check-out mancante');

  const attivita = read('src/components/cards/AttivitaCard.tsx');
  assert(attivita.includes('${meetingTime} → ${startTime}${timeStatusSuffix}'), 'AttivitaCard: formato doppio orario mancante');
  assert(attivita.includes('Ore ${displayTime}${timeStatusSuffix}'), 'AttivitaCard: formato orario singolo mancante');
  assert(attivita.includes("status={displayTime ? (isConfirmed ? 'confermato' : 'indicativo') : undefined}"), 'AttivitaCard: indicatore confermato/indicativo mancante');

  const ristorante = read('src/components/cards/RistoranteCard.tsx');
  assert(ristorante.includes("`Ore ${time}${isConfirmed ? ' · Confermato' : ' · indicativo'}`"), 'RistoranteCard: label orario/stato mancante');
  assert(ristorante.includes('formatDateIT((ristorante.data || ristorante.date)!)'), 'RistoranteCard: fallback data non compatta mancante');

  const shopping = read('src/components/cards/ShoppingCard.tsx');
  assert(shopping.includes("`Ore ${displayTime}${isConfirmed ? ' · Confermato' : ' · indicativo'}`"), 'ShoppingCard: label orario/stato mancante');
  assert(shopping.includes('formatDateIT((shopping.data || shopping.date)!)'), 'ShoppingCard: fallback data mancante');

  const tappa = read('src/components/cards/TappaCard.tsx');
  assert(tappa.includes("`Ore ${orario}${isConfirmed ? ' · Confermato' : ' · indicativo'}`"), 'TappaCard: label orario/stato mancante');
  assert(tappa.includes('formatDateIT(tappa.data)'), 'TappaCard: fallback data non compatta mancante');
  assert(tappa.includes('sequenceInfo?.inSequence'), 'TappaCard: badge sequenza passeggiata mancante');

  const trasporto = read('src/components/cards/TrasportoCard.tsx');
  assert(trasporto.includes('const headerTimeSummary = resolvedTimeSummary || formatDateIT(displayDateStr);'), 'TrasportoCard: fallback data mancante');
  assert(trasporto.includes('checkinInfo.cutoffTime') && trasporto.includes('transport.layover'), 'TrasportoCard: sotto-riga cutoff/layover mancante');
});

check('6. Fronte Alloggi senza inviti proattivi al check-in (solo badge se checkInDone è true)', () => {
  const alloggio = read('src/components/cards/AlloggioCard.tsx');
  const footerSlice = alloggio.slice(alloggio.indexOf('hounigo-ds-card-footer'));
  assert(footerSlice.includes('{accommodation.checkInDone && ('), 'AlloggioCard footer: check-in non vincolato a accommodation.checkInDone');
  assert(!footerSlice.includes('Check-in da fare'), 'AlloggioCard footer: dicitura proattiva "Check-in da fare" non ammessa');
  assert(!footerSlice.includes('Segna check-in'), 'AlloggioCard footer: invito proattivo "Segna check-in" non ammesso');
  assert(footerSlice.includes('{(accommodation.checkInDone || accommodation.checkOutDone) && ('), 'AlloggioCard footer: check-out non protetto da stato precedente');
});

check('7. Swipe orizzontale in Oggi dedicato al cambio giorno e isolato dallo swipe globale tab', () => {
  assert(oggiSource.includes('const handleDaySwipeStart ='), 'OggiView: handleDaySwipeStart mancante');
  assert(oggiSource.includes('const handleDaySwipeMove ='), 'OggiView: handleDaySwipeMove mancante');
  assert(oggiSource.includes('const handleDaySwipeEnd ='), 'OggiView: handleDaySwipeEnd mancante');
  assert(oggiSource.includes('setSelectedDate(tripDays[currentIndex - 1].dateStr)'), 'OggiView: navigazione giorno precedente mancante nello swipe');
  assert(oggiSource.includes('setSelectedDate(tripDays[currentIndex + 1].dateStr)'), 'OggiView: navigazione giorno successivo mancante nello swipe');
  assert(appSource.includes("if (activeTab === 'oggi'"), 'App.tsx: blocco swipe globale su activeTab === oggi mancante');
});

check('8. Guardie critiche Sync Firestore (1.6.27), Push (1.6.28) e GPS LIVE (1.6.29) preservate', () => {
  assert(syncSource.includes('const AUTO_SYNC_COOLDOWN_MS = 10 * 60 * 1000;'), 'syncService: cooldown 10 min mancante');
  assert(syncSource.includes('this.inFlightSyncPromise') && syncSource.includes('this.inFlightFlushPromise'), 'syncService: single-flight mancante');

  assert(pushHookSource.includes('let inFlightRefresh: Promise<void> | null = null;'), 'usePushNotifications: lock inFlightRefresh mancante');
  assert(pushHookSource.includes('async function refreshStatusShared('), 'usePushNotifications: refreshStatusShared mancante');

  assert(gpsSource.includes('export async function resumeLiveGpsIfEligible('), 'liveGpsContinuity: resumeLiveGpsIfEligible mancante');
  assert(gpsSource.includes('export function evaluateLiveGpsContinuityDecision('), 'liveGpsContinuity: evaluateLiveGpsContinuityDecision mancante');
  assert(gpsSource.includes('export function startSingleGpsWatcher('), 'liveGpsContinuity: startSingleGpsWatcher mancante');
});

console.log(`\n=== RIEPILOGO INVARIANTI PERMANENTI: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
