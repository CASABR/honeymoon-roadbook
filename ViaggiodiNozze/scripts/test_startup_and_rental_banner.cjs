/* Test statico: avvio non distruttivo + banner noleggi (Snap Rentals). Sola lettura. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); };

// ---- Avvio non distruttivo ----
const startupFiles = ['src/App.tsx', 'src/main.tsx'];
startupFiles.forEach(f => {
  if (!fs.existsSync(path.join(root, f))) return;
  const s = read(f);
  t(`${f}: nessun deleteTransport/deleteBookingItem/runDeduplication`, !/deleteTransport|deleteBookingItem|runDeduplication/.test(s));
});

const oggi = read('src/views/OggiView.tsx');
const fi = oggi.indexOf('const fetchTimeline');
const fetchBody = fi >= 0 ? oggi.slice(fi, fi + 6000) : '';
t('OggiView.fetchTimeline trovato', fi >= 0);
t('OggiView.fetchTimeline: nessuna cancellazione/scrittura', !/delete[A-Z]\w*\(|saveTransport|updateTransport|add[A-Z]\w*\(/.test(fetchBody.split('\n').slice(0, 80).join('\n')));

const storage = read('src/storage/storageService.ts');
const gStart = storage.indexOf('async getTimelineForDate');
const gEnd = storage.indexOf('\n  async ', gStart + 30);
const gBody = storage.slice(gStart, gEnd > 0 ? gEnd : gStart + 20000);
t('getTimelineForDate: corpo individuato', gStart > 0 && gBody.length > 1000);
t('getTimelineForDate: sola lettura (nessun put/delete/save)', !/idbPut|idbDelete|\.delete[A-Z]\w*\(|saveDocument|setDoc|deleteDoc|\.save[A-Z]\w*\(|\.update[A-Z]\w*\(/.test(gBody));

const sync = fs.existsSync(path.join(root, 'src/services/syncService.ts')) ? read('src/services/syncService.ts') : '';
t('syncService: nessuna chiamata deleteTransport/deleteBookingItem', !/deleteTransport|deleteBookingItem/.test(sync));

// ---- Banner noleggi ----
const banner = read('src/components/common/InTransitBanner.tsx');
t('Banner: noleggi gestiti (auto/camper) senza "Arrivo"', /isRental/.test(banner) && /Noleggio \$\{label\} in corso/.test(banner));
t('Banner: isArrival esclude i noleggi', /isArrival = !isRental/.test(banner));
t('Banner: icona aereo solo per volo', /volo: '🛬'/.test(banner) && !/let icon = '🛬'/.test(banner));
t('Timeline: titolo "Ritiro auto/camper"', /Ritiro \$\{t\.type === 'camper' \? 'camper' : 'auto'\}/.test(storage));
t('Timeline: titolo "Riconsegna auto/camper"', /Riconsegna \$\{t\.type === 'camper' \? 'camper' : 'auto'\}/.test(storage));
t('Timeline: riconsegna usa dropoffDate', /else if \(t\.dropoffDate === dateStr\)/.test(storage));
t('Timeline: noleggi escono prima del blocco _arrival generico', storage.indexOf('if (isRental) {') < storage.indexOf('${t.id}_arrival'));
t('Banner: nessun RouteBadge', !/RouteBadge/.test(banner));

// ---- Dati Snap Rentals (sola lettura) ----
const seed = read('src/storage/seedTransports.ts');
t('Seed Snap Rentals: type auto, dropoffDate 2026-12-15', /trn_05_snap_rentals[\s\S]{0,200}type: 'auto'[\s\S]{0,200}dropoffDate: '2026-12-15'/.test(seed));

console.log(`\n${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
