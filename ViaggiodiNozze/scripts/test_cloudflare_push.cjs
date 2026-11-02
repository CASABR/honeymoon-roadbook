const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

(async () => {
  const module = await import(pathToFileURL(path.join(root, 'cloudflare/houniai-worker/src/push.js')).href);
  const helpers = module.pushTestHelpers;
  let passed = 0;
  const test = (name, fn) => { fn(); passed += 1; console.log(`[PASS ${passed}] ${name}`); };

  test('preferenze conservative normalizzate', () => {
    assert.deepEqual(helpers.normalizePreferences({ activities: false, reminderMinutes: 17 }), {
      transports: true, activities: false, lodging: true, deadlines: true, collaboration: true, reminderMinutes: 60,
    });
  });
  test('subscription HTTPS e chiavi obbligatorie', () => {
    assert.equal(helpers.validSubscription({ endpoint: 'http://example.test', keys: { p256dh: 'x'.repeat(40), auth: 'y'.repeat(16) } }), false);
    assert.equal(helpers.validSubscription({ endpoint: 'https://push.example.test/a', keys: { p256dh: 'x'.repeat(40), auth: 'y'.repeat(16) } }), true);
  });
  test('reminder futuri limitati e payload generici', () => {
    assert.equal(helpers.validReminder({ kind: 'deadline_due', eventAt: Date.now() + 60_000 }), true);
    assert.equal(helpers.validReminder({ kind: 'deadline_due', eventAt: Date.now() - 1 }), false);
    const payload = JSON.stringify(helpers.genericPayload('deadline_due'));
    assert.equal(/pnr|booking.?code|ticket/i.test(payload), false);
  });

  const worker = read('cloudflare/houniai-worker/src/push.js');
  const migration = read('cloudflare/houniai-worker/migrations/0002_push_notifications.sql');
  const service = read('src/services/pushNotificationService.ts');
  const config = read('src/config/freeArchitecture.ts');
  const wrangler = read('cloudflare/houniai-worker/wrangler.jsonc');

  test('membership ricontrollata prima degli invii pianificati', () => {
    assert.ok(worker.includes('stillAuthorized(subscriber.uid, subscriber.trip_id, env)'));
    assert.ok(worker.includes('FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY'));
  });
  test('quote, deduplica e D1 sono persistenti', () => {
    assert.ok(worker.includes('MAX_DAILY_SENDS = 100'));
    assert.ok(worker.includes('INSERT OR IGNORE INTO push_dispatches'));
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS push_subscriptions'));
    assert.ok(migration.includes('CREATE INDEX IF NOT EXISTS idx_push_jobs_due'));
  });
  test('frontend non usa Functions e resta disattivato senza configurazione', () => {
    assert.equal(service.includes('httpsCallable'), false);
    assert.ok(service.includes('user.getIdToken()'));
    assert.ok(config.includes('PUSH_WORKER_URL') && config.includes('PUSH_VAPID_PUBLIC_KEY.length > 40'));
  });
  test('segreti esclusi dalla configurazione versionata', () => {
    assert.equal(wrangler.includes('VAPID_PRIVATE_KEY'), false);
    assert.equal(wrangler.includes('FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY'), false);
    assert.ok(worker.includes('webpush.setVapidDetails(env.VAPID_SUBJECT'));
  });
  test('cron unico a frequenza ridotta', () => {
    assert.ok(wrangler.includes('"crons": ["*/5 * * * *"]'));
  });

  console.log(`\n${passed}/${passed} verifiche push Cloudflare superate.`);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
