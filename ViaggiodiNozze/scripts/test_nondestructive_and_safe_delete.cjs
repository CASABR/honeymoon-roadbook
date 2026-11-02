/**
 * Test: nessun effetto collaterale distruttivo in lettura + guardie cancellazione amministrativa + collisioni.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0;
const test = (name, fn) => { try { fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };

console.log('--- TEST: LETTURA NON DISTRUTTIVA, CANCELLAZIONE SICURA, COLLISIONI ---');

test('OggiView.fetchTimeline non chiama deleteTransport', () => {
  const src = read('src/views/OggiView.tsx');
  const start = src.indexOf('const fetchTimeline = useCallback');
  const end = src.indexOf('Rilevamento collisioni orarie');
  assert.ok(start > 0 && end > start, 'fetchTimeline individuata');
  assert.ok(!src.slice(start, end).includes('deleteTransport'), 'nessuna cancellazione nella lettura');
});

test('App.tsx non esegue deduplicazioni/cancellazioni automatiche all\'avvio', () => {
  const src = read('src/App.tsx');
  assert.ok(!src.includes('runDeduplication'), 'runDeduplication rimossa');
  assert.ok(!src.includes('storageService.deleteTransport'), 'nessun deleteTransport in App.tsx');
});

test('getTimelineForDate è di sola lettura e marca gli orari predefiniti', () => {
  const src = read('src/storage/storageService.ts');
  const s = src.indexOf('async getTimelineForDate');
  const e = src.indexOf('// --- BAGAGLI ---');
  const body = src.slice(s, e);
  assert.ok(!/delete|setDoc|saveTransport|idbPut|idbDelete/i.test(body), 'nessuna scrittura');
  assert.ok((body.match(/timeIsDefault/g) || []).length >= 5, 'flag timeIsDefault presente per tappe/attività/ristoranti/shopping/alloggi');
});

test('Rilevamento collisioni ignora orari predefiniti e alloggi', () => {
  const src = read('src/views/OggiView.tsx');
  assert.ok(src.includes("item.timeIsDefault || item.type === 'alloggio'"), 'filtro collisioni presente');
});

test('Gli orari assenti restano assenti senza valori fittizi', () => {
  const body = read('src/storage/storageService.ts');
  for (const d of ["'14:00'", "'19:30'", "'16:00'", "'21:00'"]) assert.ok(!body.includes(`time: ${d}`), 'default fittizio ' + d + ' rimosso');
  assert.ok(body.includes("time: r.orario || ''"), 'ristoranti senza fallback fittizio');
});

(async () => {
  const mod = await import('file:///' + path.join(root, 'scripts', 'admin-delete-trip.mjs').replace(/\\/g, '/'));
  test('admin-delete-trip: 0000 rifiutato in modo permanente', () => {
    assert.throws(() => mod.validateTripId('0000'), /PROTETTO/);
  });
  test('admin-delete-trip: ID vuoti o con percorso rifiutati', () => {
    for (const bad of ['', 'a/b', '..', ' x y']) assert.throws(() => mod.validateTripId(bad));
  });
  test('admin-delete-trip: ID normale accettato', () => { assert.strictEqual(mod.validateTripId('abc123'), 'abc123'); });
  test('admin-delete-trip: percorsi consentiti limitati al viaggio e ai riferimenti top-level', () => {
    for (const allowed of [
      'trips/abc123',
      'trips/abc123/tappe/t1',
      'live_feeds/abc123/entries/e1',
      'invite_tokens/token1',
      'push_subscribers/sub1',
      'push_jobs/job1',
      'push_dispatches/dispatch1'
    ]) assert.strictEqual(mod.isAllowedDeletionPath(allowed, 'abc123'), true, allowed);
    for (const denied of ['trips/0000', 'trips/other', 'users/u1', 'invite_tokens/token1/child/x']) {
      assert.strictEqual(mod.isAllowedDeletionPath(denied, 'abc123'), false, denied);
    }
  });
  test('admin-delete-trip: default = sola lettura, conferma obbligatoria, verifica residui', () => {
    const src = read('scripts/admin-delete-trip.mjs');
    assert.ok(src.includes("process.argv.includes('--execute')"));
    assert.ok(src.includes('--confirm-id deve essere identico'));
    assert.ok(src.includes('showMissing=true'), 'enumera documenti orfani');
    assert.ok(src.includes('INCOMPLETO') && src.includes('COMPLETATO e VERIFICATO'), 'successo solo dopo verifica');
    assert.ok(src.includes('Backup non verificato'), 'backup obbligatorio');
    assert.ok(src.includes("createHash('sha256')"), 'backup riletto e verificato con digest');
    assert.ok(src.includes('RELATED_COLLECTIONS'), 'riferimenti top-level inclusi');
    assert.ok(src.includes('remaining: ordered.slice(done)'), 'journal riprendibile conserva i residui');
    assert.ok(src.includes('FIREBASE_ADMIN_ACCESS_TOKEN'), 'token IAM temporaneo richiesto');
    assert.ok(!src.includes('client_secret') && !src.includes('refresh_token'), 'nessuna credenziale OAuth incorporata');
  });
  console.log(`\n${passed} test superati`);
})();
