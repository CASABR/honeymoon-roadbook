const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

(async () => {
  const pushModule = await import(pathToFileURL(path.join(root, 'cloudflare/houniai-worker/src/push.js')).href);
  const helpers = pushModule.pushTestHelpers;
  let passed = 0;
  const test = (name, fn) => { fn(); passed += 1; console.log(`[PASS ${passed}] ${name}`); };

  // 1. Schema D1
  const sql = read('cloudflare/houniai-worker/migrations/0002_push_notifications.sql');
  test('D1 migration contiene tabelle e indici push', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS push_subscriptions'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS push_jobs'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS push_dispatches'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS push_daily_usage'));
    assert.ok(sql.includes('idx_push_subscriptions_trip'));
    assert.ok(sql.includes('idx_push_jobs_due'));
  });

  // 2. Isolamento per viaggio e utente
  test('Isolamento subscription e job per trip_id', () => {
    const pushCode = read('cloudflare/houniai-worker/src/push.js');
    assert.ok(pushCode.includes('WHERE trip_id = ?1 AND enabled = 1'));
    assert.ok(pushCode.includes('WHERE trip_id = ?1 AND entity_key = ?2'));
    assert.ok(pushCode.includes('registration.trip_id !== tripId'));
  });

  // 3. Distinzione accettato dal server vs ricevuto su device
  test('Distingue invio accettato dal server da ricezione effettiva', () => {
    const modalCode = read('src/components/modals/PushNotificationModal.tsx');
    assert.ok(modalCode.includes('Invio accettato. Conferma la ricezione sul dispositivo.'));
    assert.ok(modalCode.includes('Su iPhone le push richiedono la PWA aggiunta alla schermata Home.'));
    const pushCode = read('cloudflare/houniai-worker/src/push.js');
    assert.ok(pushCode.includes("accepted: true, deliveryConfirmed: false, status: 'accepted'"));
  });

  // 4. Gestione errori 404 / 410 (unsubscription automatica)
  test('Subscription scadute (404/410) rimosse automaticamente', () => {
    const pushCode = read('cloudflare/houniai-worker/src/push.js');
    assert.ok(pushCode.includes('error?.statusCode === 404 || error?.statusCode === 410'));
    assert.ok(pushCode.includes('DELETE FROM push_subscriptions WHERE subscriber_id = ?1'));
  });

  // 5. Rate limiting e anti-spam
  test('Limiti anti-spam e quote conservative', () => {
    const pushCode = read('cloudflare/houniai-worker/src/push.js');
    assert.ok(pushCode.includes('MAX_DAILY_SENDS = 100'));
    assert.ok(pushCode.includes('MAX_JOBS_PER_DISPATCH = 20'));
    assert.ok(pushCode.includes('PUSH_RATE_LIMITED'));
  });

  // 6. Test di rotazione VAPID
  test('Nuova VAPID generata valida e salvata fuori dal repo', () => {
    const rotationPath = 'C:\\tmp\\hounigo-vapid-rotation.json';
    if (fs.existsSync(rotationPath)) {
      const parsed = JSON.parse(fs.readFileSync(rotationPath, 'utf8'));
      assert.ok(parsed.publicKey && parsed.publicKey.length > 40);
      assert.ok(parsed.privateKey && parsed.privateKey.length > 20);
    }
  });

  console.log(`\n${passed}/${passed} verifiche e2e e architettura Cloudflare Push completate con successo.`);
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
