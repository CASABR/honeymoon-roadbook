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
  test('cron ogni minuto compatibile con piano Free', () => {
    assert.ok(wrangler.includes('"crons": ["*/1 * * * *"]'));
  });

  const asyncTest = async (name, fn) => { await fn(); passed += 1; console.log(`[PASS ${passed}] ${name}`); };

  await asyncTest('cron service account parsing gestisce apici escape e JSON senza esporre segreti', async () => {
    const crypto = require('node:crypto');
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const escapedPem = privateKey.replace(/\n/g, '\\n');
    const quoted = helpers.parseServiceAccountConfig({
      FIREBASE_SERVICE_ACCOUNT_EMAIL: '"sa-test@example.iam.gserviceaccount.com"',
      FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: `"${escapedPem}"`,
    });
    const fromJson = helpers.parseServiceAccountConfig({
      FIREBASE_SERVICE_ACCOUNT_EMAIL: '',
      FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: JSON.stringify({
        client_email: 'sa-test@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    });
    assert.equal(quoted.email, 'sa-test@example.iam.gserviceaccount.com');
    assert.deepEqual(quoted.der, fromJson.der);
    const imported = await crypto.webcrypto.subtle.importKey(
      'pkcs8',
      quoted.der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    assert.ok(imported);
    assert.throws(
      () => helpers.parseServiceAccountConfig({
        FIREBASE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com',
        FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: 'SUPER_SECRET_BROKEN_VALUE',
      }),
      err => err.message === 'FIREBASE_SERVICE_ACCOUNT_KEY_INVALID' && !err.message.includes('SUPER_SECRET'),
    );
  });

  await asyncTest('cron isolamento errore getServiceAccountToken non consuma quota e non elimina subscription', async () => {
    const crypto = require('node:crypto');
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const state = {
      subscriptions: [{
        subscriber_id: 'e35efdbc82000000',
        trip_id: '0000',
        uid: 'uid-owner-synth',
        enabled: 1,
        subscription_json: JSON.stringify({ endpoint: 'https://web.push.apple.com/test', keys: { p256dh: 'x'.repeat(40), auth: 'y'.repeat(16) } }),
        preferences_json: JSON.stringify({ activities: true, reminderMinutes: 30 }),
      }],
      jobs: [{
        job_id: 'probe_job_1',
        trip_id: '0000',
        subscriber_id: 'e35efdbc82000000',
        kind: 'activity_start',
        due_at: Date.now() - 1000,
        attempts: 0,
      }],
      sentCount: 1,
    };
    const mockDb = {
      prepare(sql) {
        let params = [];
        return {
          bind(...args) { params = args; return this; },
          async all() {
            if (sql.includes('FROM push_jobs')) return { results: state.jobs.filter(j => j.due_at <= params[0]) };
            return { results: [] };
          },
          async first() {
            if (sql.includes('FROM push_subscriptions')) {
              return state.subscriptions.find(s => s.subscriber_id === params[0] && s.enabled === 1) || null;
            }
            return null;
          },
          async run() {
            if (sql.includes('UPDATE push_jobs SET attempts')) {
              const job = state.jobs.find(j => j.job_id === params[0]);
              if (job) { job.attempts = params[1]; job.due_at = params[2]; }
            } else if (sql.includes('DELETE FROM push_subscriptions')) {
              state.subscriptions = state.subscriptions.filter(s => s.subscriber_id !== params[0]);
            }
            return { success: true };
          },
        };
      },
    };
    const origFetch = globalThis.fetch;
    const origWarn = console.warn;
    const warnings = [];
    globalThis.fetch = async url => {
      assert.ok(String(url).startsWith('https://oauth2.googleapis.com/token'));
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    };
    console.warn = (...args) => warnings.push(args);
    try {
      await module.dispatchDuePushJobs({
        RATE_LIMITS: mockDb,
        FIREBASE_PROJECT_ID: 'app-viaggio-di-nozze',
        FIREBASE_SERVICE_ACCOUNT_EMAIL: 'sa-cron-test@example.iam.gserviceaccount.com',
        FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
        VAPID_PUBLIC_KEY: 'B' + 'A'.repeat(60),
        VAPID_PRIVATE_KEY: 'x'.repeat(32),
        VAPID_SUBJECT: 'mailto:test@example.invalid',
      });
    } finally {
      globalThis.fetch = origFetch;
      console.warn = origWarn;
    }
    assert.equal(state.sentCount, 1);
    assert.equal(state.subscriptions.length, 1);
    assert.equal(state.jobs[0].attempts, 1);
    assert.ok(state.jobs[0].due_at > Date.now());
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][1].reason, 'FIREBASE_SERVICE_ACCOUNT_DENIED:invalid_grant');
    assert.equal(JSON.stringify(warnings).includes('PRIVATE KEY'), false);
  });

  await asyncTest('cron verifica firma JWT e membership Firestore prima di ogni invio (revoca bloccata)', async () => {
    const crypto = require('node:crypto');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const env = {
      FIREBASE_PROJECT_ID: 'app-viaggio-di-nozze',
      FIREBASE_SERVICE_ACCOUNT_EMAIL: 'sa-verify@app-viaggio-di-nozze.iam.gserviceaccount.com',
      FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
    };
    const origFetch = globalThis.fetch;
    let verifiedJwt = false;
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (target === 'https://oauth2.googleapis.com/token') {
        const params = new URLSearchParams(init.body);
        const assertion = params.get('assertion');
        const [hdr, pay, sig] = assertion.split('.');
        const claims = JSON.parse(Buffer.from(pay, 'base64url').toString('utf8'));
        assert.equal(claims.iss, env.FIREBASE_SERVICE_ACCOUNT_EMAIL);
        assert.equal(claims.scope, 'https://www.googleapis.com/auth/datastore');
        verifiedJwt = crypto.verify(
          'RSA-SHA256',
          Buffer.from(`${hdr}.${pay}`),
          publicKey,
          Buffer.from(sig, 'base64url'),
        );
        assert.equal(verifiedJwt, true);
        return new Response(JSON.stringify({ access_token: 'temp-oauth-token', expires_in: 3600 }), { status: 200 });
      }
      assert.equal(init?.headers?.Authorization, 'Bearer temp-oauth-token');
      if (target.endsWith('/documents/trips/0000')) {
        return new Response(JSON.stringify({ fields: { ownerUid: { stringValue: 'uid-owner' } } }), { status: 200 });
      }
      if (target.endsWith('/documents/trips/0000/members/uid-revoked')) {
        return new Response(JSON.stringify({ fields: { role: { stringValue: 'viewer' } } }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    };
    try {
      assert.equal(await helpers.stillAuthorized('uid-owner', '0000', env), true);
      assert.equal(await helpers.stillAuthorized('uid-revoked', '0000', env), false);
      assert.equal(verifiedJwt, true);

      // Verifica che dispatchDuePushJobs elimini la subscription revocata senza consumare quota
      let deletedSub = null;
      let sendQuotaTouched = false;
      const mockDb = {
        prepare(sql) {
          let params = [];
          return {
            bind(...args) { params = args; return this; },
            async all() {
              if (sql.includes('FROM push_jobs')) {
                return { results: [{ job_id: 'j-rev', trip_id: '0000', subscriber_id: 'sub-rev', kind: 'activity_start', due_at: 1, attempts: 0 }] };
              }
              return { results: [] };
            },
            async first() {
              if (sql.includes('FROM push_subscriptions')) {
                return {
                  subscriber_id: 'sub-rev',
                  trip_id: '0000',
                  uid: 'uid-revoked',
                  enabled: 1,
                  subscription_json: '{}',
                  preferences_json: JSON.stringify({ activities: true }),
                };
              }
              if (sql.includes('push_daily_usage')) sendQuotaTouched = true;
              return null;
            },
            async run() {
              if (sql.includes('DELETE FROM push_subscriptions')) deletedSub = params[0];
              return { success: true };
            },
          };
        },
      };
      await module.dispatchDuePushJobs({ ...env, RATE_LIMITS: mockDb });
      assert.equal(deletedSub, 'sub-rev');
      assert.equal(sendQuotaTouched, false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  await asyncTest('payload descrittivo categoria/titolo/ora/luogo con sanitizzazione PII e fallback legacy', async () => {
    const now = Date.UTC(2027, 0, 2, 23, 15, 0);
    const eventAt = now + 15 * 60_000;
    const rich = helpers.genericPayload('activity_start', {
      category: 'Attività',
      title: 'Ritrovo TAO PNR: AB12CD',
      localTime: '07:30',
      place: 'El Nido test@example.com +39 333 1234567 €120',
      eventAt,
      now,
    });
    assert.equal(rich.title, 'Attività: Ritrovo TAO');
    assert.equal(rich.body, 'Ore 07:30 · El Nido · Tra 15 minuti');
    assert.equal(rich.body.includes('test@example.com'), false);
    assert.equal(rich.body.includes('333'), false);
    assert.equal(rich.body.includes('120'), false);
    assert.equal(rich.title.includes('AB12CD'), false);

    const legacyFallback = helpers.genericPayload('activity_start', {});
    assert.equal(legacyFallback.title, 'Attività in programma');
    assert.equal(legacyFallback.body, 'Controlla orario e dettagli in HOUNIGO.');
  });

  console.log(`\n${passed}/${passed} verifiche push Cloudflare superate.`);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
