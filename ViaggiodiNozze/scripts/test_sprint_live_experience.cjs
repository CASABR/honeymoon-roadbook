const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const view = read('src/views/altro/LiveView.tsx');
const editorial = read('src/views/altro/LiveEditorialExperience.tsx');
const liveService = read('src/services/liveService.ts');
const geolocation = read('src/services/geolocationService.ts');
const app = read('src/App.tsx');

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
};

console.log('\n=== HOUNIGO: SPRINT LIVE EXPERIENCE ===\n');

test('Struttura editoriale in tre aree', () => {
  for (const marker of ['01 · Posizione', '02 · Diario', '03 · Interazioni']) assert.ok(editorial.includes(marker));
  assert.doesNotMatch(editorial, /grid-cols-3.*card|dashboard/i);
});

test('GPS richiede consenso esplicito e non parte al mount', () => {
  assert.ok(view.includes('onDetectGps={() => handleDetectGps(false)}'));
  assert.doesNotMatch(view, /useEffect\(\(\) => \{[^}]*handleDetectGps/s);
  assert.ok(geolocation.includes('navigator.geolocation.getCurrentPosition'));
});

test('Organizzatore e Holder controllano il GPS secondo lease Rules', () => {
  assert.ok(view.includes("canControlGps={cloudRole === 'owner' || isGpsHolder}"));
  assert.ok(view.includes("if (cloudRole !== 'owner'"));
  assert.ok(editorial.includes('Dispositivo autorizzato:'));
});

test('Copilota può pubblicare ma non controlla GPS se non è holder', () => {
  assert.ok(view.includes("cloudRole === 'owner' || cloudRole === 'copilota'"));
  assert.ok(view.includes("Copilota verificato · sola pubblicazione diario"));
});

test('Viewer e ospite restano in sola lettura', () => {
  assert.ok(view.includes("Viewer / ospite · sola lettura"));
  assert.ok(editorial.includes('Gli ospiti possono leggere il diario e usare le reazioni consentite'));
  assert.ok(editorial.includes('non possono vedere documenti, prenotazioni, spese o inviare messaggi testuali'));
});

test('Stati GPS disponibile, negato e non attivato sono distinti', () => {
  for (const label of ['Rilevata', 'Non disponibile', 'Non attivata']) assert.ok(editorial.includes(label));
  assert.ok(editorial.includes('Il GPS rilevato resta locale e non viene trasmesso agli ospiti'));
});

test('Trasferimento guida e revoca implementati secondo lease Rules', () => {
  assert.ok(view.includes('onTransferGps'));
  assert.ok(view.includes('onRevokeGps'));
  assert.ok(editorial.includes('Trasferisci guida') || editorial.includes('Revoca guida') || editorial.includes('Passa guida'));
});

test('Offline disabilita scritture e mantiene lettura', () => {
  assert.ok(view.includes("window.addEventListener('offline'"));
  assert.ok(editorial.includes('GPS, pubblicazione e reazioni richiedono connessione'));
  assert.match(editorial, /disabled=\{!props\.online\}/);
});

test('Feed vuoto ha uno stato editoriale dedicato', () => {
  assert.ok(editorial.includes('Il diario è ancora vuoto'));
  assert.ok(editorial.includes('Gli aggiornamenti pubblici compariranno qui'));
});

test('Timeline mostra foto, testo, data e luogo', () => {
  assert.ok(editorial.includes('formatUpdateDate(update.timestamp)'));
  assert.ok(editorial.includes('update.locationName'));
  assert.ok(editorial.includes('update.text'));
  assert.ok(editorial.includes('update.photoUrl'));
});

test('Reazioni pubbliche rispettano whitelist esistente', () => {
  assert.ok(liveService.includes("export const LIVE_REACTIONS = ['❤️', '😍', '😂', '👋']"));
  assert.ok(liveService.includes('if (!LIVE_REACTIONS.includes(type)) return'));
  assert.ok(editorial.includes("const REACTIONS = ['❤️', '😍', '😂', '👋']"));
});

test('Feed pubblico usa whitelist e non espone campi privati', () => {
  assert.ok(liveService.includes('sanitizeLiveUpdate'));
  assert.ok(liveService.includes('title: cleanString'));
  assert.doesNotMatch(editorial, /bookingCode|ownerUid|attachments|paymentStatus|qrCode|acconto/);
});

test('Link ospiti dedicato resta disponibile senza registrazione', () => {
  assert.ok(view.includes("url.searchParams.set('live', '1')"));
  assert.ok(app.includes('isStandaloneExternal={true}'));
  assert.ok(editorial.includes('Il link LIVE funziona senza registrazione'));
});

test('Light e Dark usano classi esistenti senza logica tema', () => {
  assert.ok(editorial.includes('dark:bg-slate-'));
  assert.ok(editorial.includes('dark:text-'));
  assert.doesNotMatch(editorial + view, /localStorage\.setItem\(['"]theme|DarkModeToggle|classList\.toggle\(['"]dark/);
});

console.log(`\nRISULTATO: ${passed}/14 TEST LIVE SUPERATI\n`);
