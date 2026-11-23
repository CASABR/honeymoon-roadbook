const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');
const ts = require(path.join(projectRoot, 'node_modules/typescript'));

function loadTsGraph(entryRelPath, mocks = {}) {
  const cache = new Map();
  function loadFile(absPath) {
    const normalized = path.normalize(absPath);
    if (cache.has(normalized)) return cache.get(normalized).exports;
    const mod = { exports: {} };
    cache.set(normalized, mod);
    const src = fs.readFileSync(normalized, 'utf8');
    const transpiled = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    const fn = new Function('require', 'module', 'exports', transpiled.outputText);
    fn((id) => {
      if (mocks[id]) return mocks[id];
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(normalized), id);
        for (const ext of ['', '.ts', '.tsx', '.js']) {
          if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) {
            return loadFile(base + ext);
          }
        }
      }
      return require(id);
    }, mod, mod.exports);
    return mod.exports;
  }
  return loadFile(path.join(projectRoot, entryRelPath));
}

class InMemoryD1 {
  constructor() {
    this.subscriptions = [];
    this.jobs = [];
    this.dispatches = new Map();
    this.dailyUsage = new Map();
  }

  prepare(sql) {
    let params = [];
    const db = this;
    const norm = sql.replace(/\s+/g, ' ').trim();
    return {
      bind(...args) { params = args; return this; },
      async first() {
        if (norm.startsWith('INSERT OR IGNORE INTO push_dispatches')) {
          const [key, tripId, createdAt] = params;
          if (db.dispatches.has(key)) return null;
          db.dispatches.set(key, { dispatch_key: key, trip_id: tripId, created_at: createdAt });
          return { dispatch_key: key };
        }
        if (norm.startsWith('SELECT dispatch_key FROM push_dispatches WHERE dispatch_key = ?1')) {
          const hit = db.dispatches.get(params[0]);
          return hit ? { dispatch_key: hit.dispatch_key } : null;
        }
        if (norm.startsWith('SELECT count(*) as total FROM push_dispatches')) {
          const [tripId, since] = params;
          let total = 0;
          for (const d of db.dispatches.values()) {
            if (d.trip_id === tripId && d.created_at > since) total += 1;
          }
          return { total };
        }
        if (norm.startsWith('SELECT created_at FROM push_dispatches WHERE dispatch_key = ?1')) {
          const hit = db.dispatches.get(params[0]);
          return hit ? { created_at: hit.created_at } : null;
        }
        if (norm.startsWith('INSERT INTO push_daily_usage')) {
          const [day] = params;
          const next = (db.dailyUsage.get(day) || 0) + 1;
          db.dailyUsage.set(day, next);
          return { sent_count: next };
        }
        if (norm.startsWith('SELECT * FROM push_subscriptions WHERE subscriber_id = ?1 AND enabled = 1')) {
          return db.subscriptions.find(s => s.subscriber_id === params[0] && s.enabled === 1) || null;
        }
        if (norm.startsWith('SELECT * FROM push_subscriptions WHERE subscriber_id = ?1')) {
          return db.subscriptions.find(s => s.subscriber_id === params[0]) || null;
        }
        return null;
      },
      async all() {
        if (norm.startsWith('SELECT subscriber_id, preferences_json FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1')) {
          return {
            results: db.subscriptions
              .filter(s => s.trip_id === params[0] && s.enabled === 1)
              .map(s => ({ subscriber_id: s.subscriber_id, preferences_json: s.preferences_json })),
          };
        }
        if (norm.startsWith('SELECT subscriber_id, subscription_json FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1')) {
          return { results: db.subscriptions.filter(s => s.trip_id === params[0] && s.enabled === 1) };
        }
        if (norm.startsWith('SELECT * FROM push_subscriptions WHERE trip_id = ?1 AND enabled = 1')) {
          return { results: db.subscriptions.filter(s => s.trip_id === params[0] && s.enabled === 1) };
        }
        if (norm.startsWith("SELECT job_id, entity_key, kind, event_at, lead_minutes, due_at, attempts FROM push_jobs WHERE trip_id = ?1 AND kind <> 'collaboration'")) {
          return { results: db.jobs.filter(j => j.trip_id === params[0] && j.kind !== 'collaboration') };
        }
        if (norm.startsWith('SELECT dispatch_key FROM push_dispatches WHERE trip_id = ?1')) {
          const results = [];
          for (const d of db.dispatches.values()) {
            if (d.trip_id === params[0]) results.push({ dispatch_key: d.dispatch_key });
          }
          return { results };
        }
        if (norm.startsWith('SELECT * FROM push_jobs WHERE due_at <= ?1')) {
          return {
            results: db.jobs
              .filter(j => j.due_at <= params[0])
              .sort((a, b) => a.due_at - b.due_at)
              .slice(0, params[1]),
          };
        }
        return { results: [] };
      },
      async run() {
        if (norm.startsWith('INSERT OR IGNORE INTO push_dispatches')) {
          const [key, tripId, createdAt] = params;
          if (!db.dispatches.has(key)) {
            db.dispatches.set(key, { dispatch_key: key, trip_id: tripId, created_at: createdAt });
          }
        } else if (norm.startsWith('DELETE FROM push_subscriptions WHERE subscriber_id = ?1')) {
          db.subscriptions = db.subscriptions.filter(s => s.subscriber_id !== params[0]);
        } else if (norm.startsWith('DELETE FROM push_subscriptions WHERE endpoint_hash = ?1')) {
          db.subscriptions = db.subscriptions.filter(s => !(s.endpoint_hash === params[0] && s.subscriber_id !== params[1]));
        } else if (norm.startsWith('INSERT OR REPLACE INTO push_subscriptions')) {
          const [subscriber_id, trip_id, uid, device_id, endpoint_hash, subscription_json, preferences_json, updated_at] = params;
          db.subscriptions = db.subscriptions.filter(s => s.subscriber_id !== subscriber_id);
          db.subscriptions.push({
            subscriber_id, trip_id, uid, device_id, endpoint_hash,
            subscription_json, preferences_json, enabled: 1, updated_at,
          });
        } else if (norm.startsWith("DELETE FROM push_jobs WHERE trip_id = ?1 AND entity_key = ?2 AND kind <> 'collaboration'")) {
          db.jobs = db.jobs.filter(j => !(j.trip_id === params[0] && j.entity_key === params[1] && j.kind !== 'collaboration'));
        } else if (norm.startsWith('DELETE FROM push_jobs WHERE job_id = ?1')) {
          db.jobs = db.jobs.filter(j => j.job_id !== params[0]);
        } else if (norm.startsWith('INSERT OR REPLACE INTO push_jobs')) {
          const [job_id, trip_id, subscriber_id, entity_key, kind, event_at, lead_minutes, due_at, created_at] = params;
          db.jobs = db.jobs.filter(j => j.job_id !== job_id);
          db.jobs.push({
            job_id, trip_id, subscriber_id, actor_uid: null, entity_key, kind,
            event_at, lead_minutes, due_at, attempts: 0, created_at,
          });
        } else if (norm.startsWith('INSERT INTO push_jobs') && norm.includes("'collaboration'")) {
          const [job_id, trip_id, actor_uid, entity_key, due_at, created_at] = params;
          const existing = db.jobs.find(j => j.job_id === job_id);
          if (existing) {
            existing.due_at = Math.min(existing.created_at + 300000, due_at);
          } else {
            db.jobs.push({
              job_id, trip_id, subscriber_id: null, actor_uid, entity_key,
              kind: 'collaboration', event_at: null, lead_minutes: null, due_at, attempts: 0, created_at,
            });
          }
        } else if (norm.startsWith("DELETE FROM push_jobs WHERE subscriber_id = ?1 AND kind <> 'deadline_due'")) {
          const [subscriberId, leadMin, nowTs] = params;
          db.jobs = db.jobs.filter(j => !(j.subscriber_id === subscriberId && j.kind !== 'deadline_due' && j.event_at != null && (j.event_at - leadMin * 60_000) <= nowTs));
        } else if (norm.startsWith('UPDATE push_jobs SET due_at = event_at -')) {
          const [subscriberId, leadMin] = params;
          for (const j of db.jobs) {
            if (j.subscriber_id === subscriberId && j.kind !== 'deadline_due' && j.event_at != null) {
              j.lead_minutes = leadMin;
              j.due_at = j.event_at - leadMin * 60_000;
            }
          }
        } else if (norm.startsWith('UPDATE push_jobs SET due_at = MAX(?3,')) {
          const [subscriberId, leadMin, minDue] = params;
          for (const j of db.jobs) {
            if (j.subscriber_id === subscriberId && j.kind !== 'deadline_due' && j.event_at != null) {
              j.lead_minutes = leadMin;
              j.due_at = Math.max(minDue, j.event_at - leadMin * 60_000);
            }
          }
        }
        return { success: true };
      },
    };
  }

  async batch(statements) {
    const out = [];
    for (const stmt of statements) {
      out.push(await stmt.run());
    }
    return out;
  }
}

(async () => {
  const tz = loadTsGraph('src/utils/reliableTimeZone.ts');
  const remindersMod = loadTsGraph('src/utils/pushReminders.ts');
  const workerPush = await import(pathToFileURL(path.join(projectRoot, 'cloudflare/houniai-worker/src/push.js')).href);

  let passed = 0;
  const check = (name, fn) => { fn(); passed += 1; console.log(`[PASS ${passed}] ${name}`); };
  const asyncCheck = async (name, fn) => { await fn(); passed += 1; console.log(`[PASS ${passed}] ${name}`); };

  check('1. Fusi IANA rigorosi senza invenzioni su aree sconosciute o parole italiane ("PER")', () => {
    assert.equal(tz.getStrictTimeZoneFromCoordinates(-36.85, 174.76), 'Pacific/Auckland');
    assert.equal(tz.getStrictTimeZoneFromCoordinates(-35.77, 137.21), 'Australia/Adelaide');
    assert.equal(tz.getStrictTimeZoneFromCoordinates(-37.81, 144.96), 'Australia/Melbourne');
    assert.equal(tz.getStrictTimeZoneFromCoordinates(-33.86, 151.21), 'Australia/Sydney');
    assert.equal(tz.getStrictTimeZoneFromCoordinates(-27.47, 153.02), 'Australia/Brisbane');
    assert.equal(tz.getStrictTimeZoneFromCoordinates(39.90, 116.39), 'Asia/Shanghai');
    assert.equal(tz.getStrictTimeZoneFromCoordinates(14.59, 120.98), 'Asia/Manila');
    assert.equal(tz.getStrictTimeZoneFromCoordinates(45.46, 9.19), 'Europe/Rome');
    assert.equal(tz.getStrictTimeZoneFromCoordinates(51.50, -0.12), null);
    assert.equal(tz.resolveUnambiguousPlaceTimeZone('TRASFERTA PER MILANO'), 'Europe/Rome');
    assert.equal(tz.resolveUnambiguousPlaceTimeZone('Pechino -> Auckland'), null);
    assert.equal(tz.resolveUnambiguousPlaceTimeZone('Luogo Misterioso'), null);
    assert.equal(tz.resolveReliableIataTimeZone('PER'), 'Australia/Perth');
  });

  const fixedNow = Date.UTC(2026, 10, 29, 8, 0, 0);
  check('2. Tutte le categorie future con orario confermato producono reminder UTC corretti', () => {
    const context = {
      nowMs: fixedNow,
      dayLocationsByDate: remindersMod.buildDayLocationsMap([
        { date: '2026-12-05', location: 'Rotorua, Nuova Zelanda' },
        { date: '2026-12-01', location: 'Pechino -> Auckland' },
      ]),
    };

    // Volo senza departureTimeZone manuale ma con IATA MXP
    const volo = remindersMod.buildClientPushReminders('trasporti', {
      id: 'flt_mxp_pek', type: 'volo', status: 'prenotato', timeStatus: 'confermato',
      date: '2026-11-30', departureTime: '13:10', departureLocation: 'Milano Malpensa', departureIata: 'MXP',
      arrivalLocation: 'Pechino PEK',
    }, context);
    assert.equal(volo.length, 1);
    assert.equal(volo[0].kind, 'transport_departure');
    assert.equal(volo[0].eventAt, Date.UTC(2026, 10, 30, 12, 10));

    // Attività con timeStatus confermato anche se status = libero, dedotta da coordinate Hobbiton
    const actFreeConfirmed = remindersMod.buildClientPushReminders('attivita', {
      id: 'act_hobbiton', status: 'libero', timeStatus: 'confermato',
      date: '2026-12-05', orarioInizio: '10:00', coordinate: { lat: -37.8721, lng: 175.6829 },
    }, context);
    assert.equal(actFreeConfirmed.length, 1);
    assert.equal(actFreeConfirmed[0].kind, 'activity_start');
    assert.equal(actFreeConfirmed[0].eventAt, Date.UTC(2026, 11, 4, 21, 0));

    // Attività prenotata ma orario esplicitamente indicativo -> 0 reminder
    assert.equal(remindersMod.buildClientPushReminders('attivita', {
      id: 'act_ind', status: 'prenotato', timeStatus: 'indicativo',
      date: '2026-12-05', orarioInizio: '11:00', timeZone: 'Pacific/Auckland',
    }, context).length, 0);

    // Alloggio con arrivalTime previsto e checkOutTime (dedotto da giorno Rotorua)
    const acc = remindersMod.buildClientPushReminders('alloggi', {
      id: 'acc_rot', status: 'prenotato', checkIn: '2026-12-05', checkInTime: '15:00', arrivalTime: '18:30',
      checkOut: '2026-12-06', checkOutTime: '10:00', location: 'Rotorua',
    }, context);
    assert.deepEqual(acc.map(r => r.kind), ['lodging_checkin', 'lodging_checkout']);
    assert.equal(acc[0].eventAt, Date.UTC(2026, 11, 5, 5, 30));

    // Ristorante, Tappa (spot), Shopping con orario confermato -> generati! Indicativo -> escluso
    assert.equal(remindersMod.buildClientPushReminders('ristoranti', {
      id: 'rst_1', data: '2026-12-05', orario: '19:30', timeStatus: 'confermato', indirizzo: 'Rotorua',
    }, context).length, 1);
    assert.equal(remindersMod.buildClientPushReminders('tappe', {
      id: 'tap_1', data: '2026-12-05', orario: '17:00', timeStatus: 'confermato', titolo: 'Spot lago Rotorua',
    }, context).length, 1);
    assert.equal(remindersMod.buildClientPushReminders('shopping', {
      id: 'shp_1', data: '2026-12-05', orario: '11:00', timeStatus: 'confermato', indirizzo: 'Auckland CBD',
    }, context).length, 1);
    assert.equal(remindersMod.buildClientPushReminders('tappe', {
      id: 'tap_ind', data: '2026-12-05', orario: '17:00', timeStatus: 'indicativo', titolo: 'Spot lago Rotorua',
    }, context).length, 0);

    // Card senza indizi geografici e su giorno multi-fuso ambiguo (2026-12-01 Pechino -> Auckland) -> NON inventa fuso
    assert.equal(remindersMod.buildClientPushReminders('tappe', {
      id: 'tap_ambig', data: '2026-12-01', orario: '12:00', timeStatus: 'confermato', titolo: 'Evento generico',
    }, context).length, 0);

    // Evento passato o completato -> nessun promemoria retroattivo
    assert.equal(remindersMod.buildClientPushReminders('trasporti', {
      id: 'flt_past', type: 'volo', status: 'prenotato', date: '2026-11-28', departureTime: '10:00', departureTimeZone: 'Europe/Rome',
    }, context).length, 0);
  });

  await asyncCheck('3. Worker backfill idempotente (/v1/push/sync-reminders), finestra -60m, eventi imminenti, niente retroattive né spam collaborazione', async () => {
    const db = new InMemoryD1();
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const webpushPath = require.resolve('web-push', { paths: [projectRoot, path.join(projectRoot, 'cloudflare/houniai-worker')] });
    const webpush = require(webpushPath);
    const vapidKeys = webpush.generateVAPIDKeys();
    const p256Ecdh = crypto.createECDH('prime256v1');
    p256Ecdh.generateKeys();
    const clientP256dh = p256Ecdh.getPublicKey().toString('base64url');
    const clientAuth = crypto.randomBytes(16).toString('base64url');
    const p256Ecdh2 = crypto.createECDH('prime256v1');
    p256Ecdh2.generateKeys();
    const clientP256dh2 = p256Ecdh2.getPublicKey().toString('base64url');
    const clientAuth2 = crypto.randomBytes(16).toString('base64url');
    const env = {
      RATE_LIMITS: db,
      FIREBASE_PROJECT_ID: 'app-viaggio-di-nozze',
      FIREBASE_SERVICE_ACCOUNT_EMAIL: 'sa@test.invalid',
      FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
      VAPID_PUBLIC_KEY: vapidKeys.publicKey,
      VAPID_PRIVATE_KEY: vapidKeys.privateKey,
      VAPID_SUBJECT: 'mailto:test@example.invalid',
    };
    const sha = v => crypto.createHash('sha256').update(v).digest('hex');
    const tripId = 'synth-trip-p1';
    const uidOwner = 'uid-owner-synth';
    const uidCopilot = 'uid-copilota-synth';
    const subOwner = sha(`${uidOwner}\n${tripId}\ndev_owner_01`).slice(0, 48);
    const subCopilot = sha(`${uidCopilot}\n${tripId}\ndev_copilot_02`).slice(0, 48);

    const realDateNow = Date.now;
    let simNow = Date.UTC(2026, 11, 5, 4, 0, 0); // 04:00 UTC = 17:00 NZDT
    Date.now = () => simNow;

    try {
      await workerPush.handlePushRequest('/v1/push/register', uidOwner, tripId, {
        deviceId: 'dev_owner_01', subscriberId: subOwner,
        subscription: { endpoint: 'https://web.push.apple.com/owner', keys: { p256dh: clientP256dh, auth: clientAuth } },
        preferences: { transports: true, activities: true, lodging: true, deadlines: true, collaboration: true, reminderMinutes: 60 },
      }, env);
      await workerPush.handlePushRequest('/v1/push/register', uidCopilot, tripId, {
        deviceId: 'dev_copilot_02', subscriberId: subCopilot,
        subscription: { endpoint: 'https://web.push.apple.com/copilota', keys: { p256dh: clientP256dh2, auth: clientAuth2 } },
        preferences: { transports: true, activities: true, lodging: true, deadlines: true, collaboration: true, reminderMinutes: 30 },
      }, env);

      const dinnerAt = Date.UTC(2026, 11, 5, 6, 30, 0); // 19:30 NZDT -> due Owner 05:30 UTC (-60m), Copilota 06:00 UTC (-30m)
      const imminentAt = simNow + 25 * 60_000; // tra 25 minuti (dentro finestra 60m)
      const staleEventAt = Date.UTC(2026, 11, 5, 6, 40, 0); // 19:40 NZDT -> usato per verificare zero invio se cron passa dopo inizio
      const items = remindersMod.collectTripPushReminderItems({
        giorni: [{ date: '2026-12-05', location: 'Auckland' }],
        ristoranti: [{ id: 'rist_synth_1', data: '2026-12-05', orario: '19:30', timeStatus: 'confermato', timeZone: 'Pacific/Auckland' }],
        attivita: [
          { id: 'act_imminent', date: '2026-12-05', orarioInizio: '17:25', timeStatus: 'confermato', timeZone: 'Pacific/Auckland', status: 'libero' },
          { id: 'act_stale_later', date: '2026-12-05', orarioInizio: '19:40', timeStatus: 'confermato', timeZone: 'Pacific/Auckland', status: 'confermato' === 'confermato' ? 'libero' : 'libero' },
        ],
      }, simNow);
      assert.equal(items.length, 3);

      // First backfill: act_imminent (+25m) ha -60m e -30m gia passati -> nessun job retroattivo
      const sync1 = await workerPush.handlePushRequest('/v1/push/sync-reminders', uidOwner, tripId, { tripId, items }, env);
      assert.equal(sync1.synced, true);
      assert.equal(sync1.scheduledCount, 4); // 2 card future x 2 subscriber (nessun job retroattivo per act_imminent)
      assert.equal(db.jobs.filter(j => j.kind === 'collaboration').length, 0, 'Backfill non deve generare notifiche collaborazione');

      const ownerDinnerJob = db.jobs.find(j => j.subscriber_id === subOwner && j.entity_key === 'ristoranti:rist_synth_1');
      const ownerImminentJob = db.jobs.find(j => j.subscriber_id === subOwner && j.entity_key === 'attivita:act_imminent');
      assert.equal(ownerDinnerJob.due_at, dinnerAt - 60 * 60_000);
      assert.equal(ownerImminentJob, undefined, 'Evento con preavviso gia passato non crea job immediato retroattivo');

      // Idempotenza: secondo backfill identico non riscrive ne duplica
      const sync2 = await workerPush.handlePushRequest('/v1/push/sync-reminders', uidOwner, tripId, { tripId, items }, env);
      assert.equal(sync2.scheduledCount, 0);
      assert.equal(db.jobs.length, 4);

      // Simula cron invio a T0: parte SOLO l'evento imminente, NON la cena alle 19:30
      const https = require('node:https');
      const { EventEmitter } = require('node:events');
      const realHttpsRequest = https.request;
      const realFetch = globalThis.fetch;
      https.request = (urlOrOpts, optsOrCb, maybeCb) => {
        const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
        const req = new EventEmitter();
        req.write = () => true;
        req.end = () => {
          const res = new EventEmitter();
          res.statusCode = 201;
          res.headers = {};
          res.setEncoding = () => {};
          if (cb) cb(res);
          res.emit('end');
        };
        req.setTimeout = () => {};
        req.destroy = () => {};
        return req;
      };
      globalThis.fetch = async (url) => {
        const u = String(url);
        if (u === 'https://oauth2.googleapis.com/token') {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
        }
        if (u.includes('/documents/trips/')) {
          return new Response(JSON.stringify({ fields: { ownerUid: { stringValue: uidOwner }, role: { stringValue: 'copilota' } } }), { status: 200 });
        }
        return new Response('', { status: 201 });
      };
      const usageDay = new Date().toISOString().slice(0, 10);
      try {
        await workerPush.dispatchDuePushJobs(env);
        assert.equal(db.dailyUsage.get(usageDay) || 0, 0, 'Nessuna push immediata a T0 per evento con preavviso gia passato');

        // Tick esattamente a -60m per Owner sulla cena (05:30 UTC): parte SOLO Owner (60m), non Copilota (30m)
        simNow = dinnerAt - 60 * 60_000;
        await workerPush.dispatchDuePushJobs(env);
        assert.equal(db.dailyUsage.get(usageDay), 1, 'Cena notificata esattamente a -60m per Owner');

        // Salta DOPO l'inizio di act_stale_later (19:45 NZDT > 19:40 NZDT) senza essere passato a -60m -> NON manda retroattiva
        simNow = staleEventAt + 5 * 60_000;
        db.jobs = db.jobs.filter(j => j.entity_key === 'attivita:act_stale_later');
        assert.equal(db.jobs.length, 2);
        const sentBeforeLateTick = db.dailyUsage.get(usageDay);
        await workerPush.dispatchDuePushJobs(env);
        assert.equal(db.dailyUsage.get(usageDay), sentBeforeLateTick, 'Nessuna push retroattiva dopo inizio evento');
        assert.equal(db.jobs.length, 0, 'Job scaduto rimosso senza invio');

        // Conserva admin-send dryRun funzionante
        const adminDry = await workerPush.handlePushRequest('/v1/push/admin-send', uidOwner, tripId, {
          tripId, title: 'Avviso manuale', body: 'Testo test', dryRun: true,
        }, env);
        assert.equal(adminDry.success, true);
        assert.equal(adminDry.dryRun, true);
        assert.equal(adminDry.recipientCount, 2);
      } finally {
        globalThis.fetch = realFetch;
        https.request = realHttpsRequest;
      }
    } finally {
      Date.now = realDateNow;
    }
  });

  await asyncCheck('4. Modifica card esistente (+65 min, confermato, vecchia date vs nuova data) sostituisce il job senza duplicati', async () => {
    const baseNow = Date.UTC(2026, 10, 23, 7, 30, 0); // 08:30 Europe/Rome
    const realDateNow = Date.now;
    Date.now = () => baseNow;
    try {
      const remindersMod = loadTsGraph('src/utils/pushReminders.ts');
      const editedAtPlus65 = baseNow + 65 * 60_000; // 09:35 Europe/Rome
      const editedReminders = remindersMod.buildClientPushReminders('shopping', {
        id: 'shop_existing_1',
        nome: 'Mercato Test',
        date: '2026-12-20', // vecchio campo residuo
        data: '2026-11-23', // nuova data salvata dal form
        orario: '09:35',
        timeStatus: 'confermato',
        timeZone: 'Europe/Rome',
      }, { nowMs: baseNow });
      assert.equal(editedReminders.length, 1);
      assert.equal(editedReminders[0].eventAt, editedAtPlus65);

      const db = new InMemoryD1();
      const env = { RATE_LIMITS: db };
      const uidOwner = 'owner_edit_test';
      const tripId = 'trip_edit_test';
      const subOwner = crypto.createHash('sha256').update(`${uidOwner}\n${tripId}\ndev_edit_1`).digest('hex').slice(0, 48);
      await workerPush.handlePushRequest('/v1/push/register', uidOwner, tripId, {
        deviceId: 'dev_edit_1', subscriberId: subOwner,
        subscription: { endpoint: 'https://web.push.apple.com/edit1', keys: { p256dh: 'x'.repeat(40), auth: 'y'.repeat(16) } },
        preferences: { transports: true, activities: true, lodging: true, deadlines: true, collaboration: true, reminderMinutes: 60 },
      }, env);

      // Vecchia schedulazione
      await workerPush.handlePushRequest('/v1/push/mutation', uidOwner, tripId, {
        entityType: 'shopping', action: 'save', entityId: 'shop_existing_1', mutationId: 'mut-old-0001',
        reminders: [{ kind: 'activity_start', eventAt: baseNow + 10 * 86400_000 }],
      }, env);
      // Modifica a +65 min
      await workerPush.handlePushRequest('/v1/push/mutation', uidOwner, tripId, {
        entityType: 'shopping', action: 'save', entityId: 'shop_existing_1', mutationId: 'mut-new-0002',
        reminders: editedReminders,
      }, env);

      const remJobs = db.jobs.filter(j => j.entity_key === 'shopping:shop_existing_1' && j.kind === 'activity_start');
      assert.equal(remJobs.length, 1, 'La modifica deve sostituire il vecchio job senza duplicati');
      assert.equal(remJobs[0].event_at, editedAtPlus65);
      assert.equal(remJobs[0].due_at, editedAtPlus65 - 60 * 60_000);

      // Verifica preferenza 15 minuti su card + pruneRemoved=false (>200 elementi) non elimina job validi
      await workerPush.handlePushRequest('/v1/push/register', uidOwner, tripId, {
        deviceId: 'dev_edit_1', subscriberId: subOwner,
        subscription: { endpoint: 'https://web.push.apple.com/edit1', keys: { p256dh: 'x'.repeat(40), auth: 'y'.repeat(16) } },
        preferences: { transports: true, activities: true, lodging: true, deadlines: true, collaboration: true, reminderMinutes: 15 },
      }, env);
      const updatedJob15 = db.jobs.find(j => j.entity_key === 'shopping:shop_existing_1' && j.kind === 'activity_start');
      assert.equal(updatedJob15.lead_minutes, 15);
      assert.equal(updatedJob15.due_at, editedAtPlus65 - 15 * 60_000);

      const syncNoPrune = await workerPush.handlePushRequest('/v1/push/sync-reminders', uidOwner, tripId, {
        tripId, items: [], pruneRemoved: false,
      }, env);
      assert.equal(syncNoPrune.removedCount, 0);
      assert.equal(db.jobs.filter(j => j.entity_key === 'shopping:shop_existing_1' && j.kind === 'activity_start').length, 1, 'pruneRemoved=false preserva job validi oltre limite 200');
    } finally {
      Date.now = realDateNow;
    }
  });

  await asyncCheck('5. Risoluzione fuso da tappa del giorno, diagnostica missing_timezone e sync idempotente post-flush', async () => {
    const remindersMod = loadTsGraph('src/utils/pushReminders.ts');
    const nowMs = Date.UTC(2026, 10, 23, 10, 0, 0); // 11:00 Europe/Rome

    // 5a. Attività generica su data fuori giorni usa località della tappa del giorno
    const itemsViaTappa = remindersMod.collectTripPushReminderItems({
      giorni: [],
      tappe: [{ id: 'tap_oggi', data: '2026-11-23', indirizzo: 'Roma, Italia' }],
      attivita: [{ id: 'act_oggi', date: '2026-11-23', orarioInizio: '12:00', timeStatus: 'confermato', location: 'Ritrovo centro' }],
    }, nowMs);
    assert.equal(itemsViaTappa.length, 1);
    assert.equal(itemsViaTappa[0].reminders[0].eventAt, Date.UTC(2026, 10, 23, 11, 0, 0));

    // 5b. Fuso estero (Auckland) non viene mai sovrascritto
    const foreignDiag = remindersMod.diagnoseClientPushReminders('attivita', {
      id: 'act_akl', date: '2026-12-05', orarioInizio: '10:00', timeStatus: 'confermato', location: 'Auckland',
    }, { nowMs });
    assert.equal(foreignDiag.skipReason, 'ok');
    assert.equal(foreignDiag.reminders[0].eventAt, Date.UTC(2026, 11, 4, 21, 0, 0)); // 10:00 NZDT (+13) = 21:00 UTC prev day

    // 5c. Fuso assente produce motivo esplicito missing_timezone
    const missingTzDiag = remindersMod.diagnoseClientPushReminders('attivita', {
      id: 'act_notz', date: '2026-11-23', orarioInizio: '12:00', timeStatus: 'confermato', location: 'Parco generico',
    }, { nowMs });
    assert.equal(missingTzDiag.reminders.length, 0);
    assert.equal(missingTzDiag.skipReason, 'missing_timezone');

    // 5d. SyncService garantisce syncPushRemindersFromStorage e diagnostica errori non nascosti
    const syncSrc = fs.readFileSync(path.join(projectRoot, 'src/storage/syncService.ts'), 'utf8');
    assert.ok(syncSrc.includes('syncPushRemindersFromStorage'), 'SyncService deve garantire syncPushRemindersFromStorage dopo sync');
    assert.ok(syncSrc.includes("stage: 'sync_deferred'") && syncSrc.includes("stage: 'cloud_sync_error'"), 'SyncService deve tracciare errori/differimenti');
  });

  await asyncCheck('6. Fusi automatici (Italia, Pechino, NZ), cambio fuso, recupero eventi futuri con cap/dedup e zero recupero passati', async () => {
    const remindersMod = loadTsGraph('src/utils/pushReminders.ts');
    const nowMs = Date.UTC(2026, 11, 2, 7, 0, 0); // 2026-12-02 07:00 UTC

    // 6a. Priorità fusi: card_explicit > card_place > day_or_stage > device_fallback
    const explicitDiag = remindersMod.diagnoseClientPushReminders('attivita', {
      id: 'act_rome_exp', date: '2026-12-02', orarioInizio: '10:00', timeStatus: 'confermato', timeZone: 'Europe/Rome', location: 'Pechino',
    }, { nowMs, deviceTimeZone: 'Pacific/Auckland' });
    assert.equal(explicitDiag.appliedTimeZone, 'Europe/Rome');
    assert.equal(explicitDiag.timeZoneSource, 'card_explicit');
    assert.equal(explicitDiag.reminders[0].eventAt, Date.UTC(2026, 11, 2, 9, 0, 0));

    const pechinoDiag = remindersMod.diagnoseClientPushReminders('attivita', {
      id: 'act_pek_place', date: '2026-12-02', orarioInizio: '18:00', timeStatus: 'confermato', location: 'Città Proibita, Pechino',
    }, { nowMs, deviceTimeZone: 'Europe/Rome' });
    assert.equal(pechinoDiag.appliedTimeZone, 'Asia/Shanghai');
    assert.equal(pechinoDiag.timeZoneSource, 'card_place');
    assert.equal(pechinoDiag.reminders[0].eventAt, Date.UTC(2026, 11, 2, 10, 0, 0)); // 18:00 CST (+8)

    const nzDayDiag = remindersMod.diagnoseClientPushReminders('attivita', {
      id: 'act_nz_day', date: '2026-12-05', orarioInizio: '10:00', timeStatus: 'confermato', location: 'Parco locale',
    }, { nowMs, dayLocationsByDate: { '2026-12-05': 'Auckland, Nuova Zelanda' }, deviceTimeZone: 'Europe/Rome' });
    assert.equal(nzDayDiag.appliedTimeZone, 'Pacific/Auckland');
    assert.equal(nzDayDiag.timeZoneSource, 'day_or_stage');
    assert.equal(nzDayDiag.reminders[0].eventAt, Date.UTC(2026, 11, 4, 21, 0, 0)); // 10:00 NZDT (+13)

    // 6b. Cambio fuso telefono (Europe/Rome -> Asia/Shanghai -> Pacific/Auckland):
    // Le prenotazioni con destinazione certa restano ancorate; solo card odierna senza fuso usa device_fallback,
    // mentre una card futura senza fuso in contesto estero non riceve un fuso arbitrario del telefono.
    const collections = {
      giorni: [{ data: '2026-12-03', luogo: 'Pechino' }],
      attivita: [
        { id: 'act_pek_fixed', date: '2026-12-03', orarioInizio: '18:00', timeStatus: 'confermato', location: 'Pechino' },
        { id: 'act_nz_fixed', date: '2026-12-06', orarioInizio: '11:00', timeStatus: 'confermato', location: 'Auckland' },
        { id: 'act_today_generic', date: '2026-12-02', orarioInizio: '22:00', timeStatus: 'confermato', location: 'Ritrovo' },
        { id: 'act_future_unknown', date: '2026-12-08', orarioInizio: '12:00', timeStatus: 'confermato', location: 'Ritrovo' },
      ],
    };
    const itemsFromRome = remindersMod.collectTripPushReminderItems(collections, nowMs, { deviceTimeZone: 'Europe/Rome', recoverIfMissed: false });
    const itemsFromAuckland = remindersMod.collectTripPushReminderItems(collections, nowMs, { deviceTimeZone: 'Pacific/Auckland', recoverIfMissed: true });

    const byIdRome = new Map(itemsFromRome.map(i => [i.entityId, i]));
    const byIdAkl = new Map(itemsFromAuckland.map(i => [i.entityId, i]));
    assert.equal(byIdRome.get('act_pek_fixed').reminders[0].eventAt, byIdAkl.get('act_pek_fixed').reminders[0].eventAt, 'Pechino non deve cambiare con fuso telefono');
    assert.equal(byIdRome.get('act_nz_fixed').reminders[0].eventAt, byIdAkl.get('act_nz_fixed').reminders[0].eventAt, 'Auckland non deve cambiare con fuso telefono');
    assert.ok(byIdRome.has('act_today_generic'), 'Card odierna senza fuso usa fallback dispositivo');
    assert.equal(byIdRome.has('act_future_unknown'), false, 'Card futura estera senza fuso non deve usare fallback Europe/Rome');
    assert.equal(byIdAkl.has('act_future_unknown'), false, 'Card futura estera senza fuso non deve usare fallback Pacific/Auckland');
    assert.equal(byIdRome.get('act_today_generic').reminders[0].eventAt, Date.UTC(2026, 11, 2, 21, 0, 0));

    // 6c. Recupero Worker: futuri recuperati con cap=2, passati ignorati, duplicati bloccati da push_dispatches
    const db = new InMemoryD1();
    const env = { RATE_LIMITS: db };
    const realDateNow = Date.now;
    Date.now = () => nowMs;
    try {
      const uid = 'owner_tz_rec';
      const tripId = 'trip_tz_rec';
      const subId = crypto.createHash('sha256').update(`${uid}\n${tripId}\ndev_tz_1`).digest('hex').slice(0, 48);
      await workerPush.handlePushRequest('/v1/push/register', uid, tripId, {
        deviceId: 'dev_tz_1', subscriberId: subId,
        subscription: { endpoint: 'https://web.push.apple.com/tz1', keys: { p256dh: 'x'.repeat(40), auth: 'y'.repeat(16) } },
        preferences: { transports: true, activities: true, lodging: true, deadlines: true, collaboration: true, reminderMinutes: 60 },
      }, env);

      const future20m = nowMs + 20 * 60_000;
      const future25m = nowMs + 25 * 60_000;
      const future30m = nowMs + 30 * 60_000;
      const future35mAlreadySent = nowMs + 35 * 60_000;
      const pastEvent = nowMs - 10 * 60_000;

      // Pre-popola push_dispatches per future35mAlreadySent per verificare deduplica
      const sentDispatchKey = crypto.createHash('sha256')
        .update(`sent-rem|${subId}|attivita:act_dup|activity_start|${future35mAlreadySent}`)
        .digest('hex').slice(0, 56);
      db.dispatches.set(sentDispatchKey, { dispatch_key: sentDispatchKey, trip_id: tripId, created_at: nowMs - 5000 });

      const syncRes = await workerPush.handlePushRequest('/v1/push/sync-reminders', uid, tripId, {
        tripId,
        items: [
          { entityType: 'attivita', entityId: 'act_past', reminders: [{ kind: 'activity_start', eventAt: pastEvent, recoverIfMissed: true }] },
          { entityType: 'attivita', entityId: 'act_dup', reminders: [{ kind: 'activity_start', eventAt: future35mAlreadySent, recoverIfMissed: true }] },
          { entityType: 'attivita', entityId: 'act_rec_1', reminders: [{ kind: 'activity_start', eventAt: future20m, recoverIfMissed: true }] },
          { entityType: 'attivita', entityId: 'act_rec_2', reminders: [{ kind: 'activity_start', eventAt: future25m, recoverIfMissed: true }] },
          { entityType: 'attivita', entityId: 'act_rec_3', reminders: [{ kind: 'activity_start', eventAt: future30m, recoverIfMissed: true }] },
        ],
      }, env);

      assert.equal(syncRes.recoveredCount, 2, 'Il recupero deve essere limitato a max 2 reminder per sync');
      assert.equal(syncRes.skippedAlreadySentCount, 1, 'Il reminder già inviato non deve essere recuperato');
      assert.equal(db.jobs.filter(j => j.entity_key === 'attivita:act_past').length, 0, 'Eventi passati mai recuperati');
      assert.equal(db.jobs.filter(j => j.entity_key === 'attivita:act_dup').length, 0, 'Duplicati già inviati mai rischedulati');
      assert.equal(db.jobs.filter(j => j.entity_key === 'attivita:act_rec_3').length, 0, 'Terzo recupero oltre il cap deve essere saltato');
      const rec1Job = db.jobs.find(j => j.entity_key === 'attivita:act_rec_1');
      assert.equal(rec1Job.due_at, nowMs, 'Il recupero deve schedulare due_at = now');
    } finally {
      Date.now = realDateNow;
    }
  });

  await asyncCheck('7. Destinazione prima: TAO 03/01 Asia/Manila, Imbarco 09/01 Asia/Taipei, 01/12 multi-fuso senza fallback, coerenza Owner/Copilota e riconciliazione D1', async () => {
    const remindersMod = loadTsGraph('src/utils/pushReminders.ts');
    const nowMs = Date.UTC(2026, 10, 23, 12, 0, 0); // 2026-11-23 13:00 Europe/Rome

    const tripCollections = {
      giorni: [
        { date: '2026-12-01', location: 'Pechino -> Auckland' },
        { date: '2027-01-03', location: 'El Nido' },
        { date: '2027-01-09', location: 'Cebu -> Taipei -> Roma' },
      ],
      trasporti: [
        { id: 'trn_03_volo_ca783', date: '2026-12-01', departureTime: '00:25', departureIata: 'PEK', timeStatus: 'confermato' },
        { id: 'trn_20270103_desert_rose_tao', date: '2027-01-03', departureTime: '06:45', departureLocation: 'El Nido, Palawan', timeStatus: 'confermato' },
        { id: 'trn_16_ceb_tpe_ci706', date: '2027-01-09', departureTime: '12:10', departureIata: 'CEB', timeStatus: 'confermato' },
        { id: 'trn_16_ceb_tpe_fco', date: '2027-01-09', departureTime: '23:25', departureIata: 'TPE', arrivalIata: 'FCO', timeStatus: 'confermato' },
      ],
      tappe: [
        { id: 'tappa_20270103_ritrovo_tao', data: '2027-01-03', orario: '07:30', titolo: 'Ritrovo TAO', indirizzo: 'Palawan', timeStatus: 'confermato' },
        { id: 'tappa_20270109_imbarco_fco', data: '2027-01-09', orario: '20:55', titolo: 'Imbarco volo TPE -> FCO', indirizzo: 'Taoyuan', timeStatus: 'confermato' },
      ],
      attivita: [
        { id: 'attivita_1793365094188_qlzg2', date: '2026-12-01', orarioInizio: '21:00', titolo: 'Attività senza luogo', timeStatus: 'confermato' },
      ],
    };

    const ownerItems = remindersMod.collectTripPushReminderItems(tripCollections, nowMs, { deviceTimeZone: 'Europe/Rome' });
    const copilotaItems = remindersMod.collectTripPushReminderItems(tripCollections, nowMs, { deviceTimeZone: 'Pacific/Auckland' });

    const ownerMap = new Map(ownerItems.map(i => [`${i.entityType}:${i.entityId}`, i]));
    const copMap = new Map(copilotaItems.map(i => [`${i.entityType}:${i.entityId}`, i]));

    // 7a. TAO 03/01 07:30 -> Asia/Manila (2027-01-02 23:30 UTC), identico tra Owner e Copilota
    const expectedTaoUtc = Date.UTC(2027, 0, 2, 23, 30, 0);
    assert.equal(ownerMap.get('tappe:tappa_20270103_ritrovo_tao').reminders[0].eventAt, expectedTaoUtc, 'TAO 03/01 deve essere 07:30 Asia/Manila');
    assert.equal(copMap.get('tappe:tappa_20270103_ritrovo_tao').reminders[0].eventAt, expectedTaoUtc, 'Owner e Copilota devono avere identico UTC per TAO');

    // 7b. Imbarco 09/01 20:55 -> Asia/Taipei (2027-01-09 12:55 UTC), non FCO/Europe/Rome
    const expectedImbarcoUtc = Date.UTC(2027, 0, 9, 12, 55, 0);
    assert.equal(ownerMap.get('tappe:tappa_20270109_imbarco_fco').reminders[0].eventAt, expectedImbarcoUtc, 'Imbarco 09/01 deve essere 20:55 Asia/Taipei');
    assert.equal(copMap.get('tappe:tappa_20270109_imbarco_fco').reminders[0].eventAt, expectedImbarcoUtc, 'Owner e Copilota devono avere identico UTC per Imbarco Taipei');

    // 7c. Attività 01/12 senza luogo su giorno multi-fuso non deve usare Europe/Rome né Auckland
    assert.equal(ownerMap.has('attivita:attivita_1793365094188_qlzg2'), false, 'Attività 01/12 senza luogo su giorno multi-fuso non va programmata in Europe/Rome');
    assert.equal(copMap.has('attivita:attivita_1793365094188_qlzg2'), false, 'Attività 01/12 senza luogo non va programmata nemmeno dal Copilota');

    // 7d. Verifica riconciliazione D1 tramite sync-reminders: corregge i job errati e rimuove quello spurio senza toccare altri job
    const db = new InMemoryD1();
    const env = { RATE_LIMITS: db };
    const realDateNow = Date.now;
    Date.now = () => nowMs;
    try {
      const uid = 'owner_reconcile';
      const tripId = 'trip_reconcile';
      const subId = crypto.createHash('sha256').update(`${uid}\n${tripId}\ndev_rec_1`).digest('hex').slice(0, 48);
      await workerPush.handlePushRequest('/v1/push/register', uid, tripId, {
        deviceId: 'dev_rec_1', subscriberId: subId,
        subscription: { endpoint: 'https://web.push.apple.com/rec1', keys: { p256dh: 'x'.repeat(40), auth: 'y'.repeat(16) } },
        preferences: { transports: true, activities: true, lodging: true, deadlines: true, collaboration: true, reminderMinutes: 60 },
      }, env);

      // Simula stato D1 pre-fix con TAO e Imbarco sballati di +7h e attivita_01_12 spuria
      await workerPush.handlePushRequest('/v1/push/sync-reminders', uid, tripId, {
        tripId,
        items: [
          { entityType: 'tappe', entityId: 'tappa_20270103_ritrovo_tao', reminders: [{ kind: 'activity_start', eventAt: Date.UTC(2027, 0, 3, 6, 30, 0) }] },
          { entityType: 'tappe', entityId: 'tappa_20270109_imbarco_fco', reminders: [{ kind: 'activity_start', eventAt: Date.UTC(2027, 0, 9, 19, 55, 0) }] },
          { entityType: 'attivita', entityId: 'attivita_1793365094188_qlzg2', reminders: [{ kind: 'activity_start', eventAt: Date.UTC(2026, 11, 1, 20, 0, 0) }] },
          { entityType: 'trasporti', entityId: 'trn_20270103_desert_rose_tao', reminders: [{ kind: 'transport_departure', eventAt: Date.UTC(2027, 0, 2, 22, 45, 0) }] },
        ],
      }, env);

      // Riconciliazione tramite normale sync-reminders post-fix
      const recRes = await workerPush.handlePushRequest('/v1/push/sync-reminders', uid, tripId, {
        tripId,
        items: ownerItems,
        pruneRemoved: true,
      }, env);

      assert.equal(db.jobs.find(j => j.entity_key === 'tappe:tappa_20270103_ritrovo_tao').event_at, expectedTaoUtc, 'TAO riconciliato in D1 a Asia/Manila');
      assert.equal(db.jobs.find(j => j.entity_key === 'tappe:tappa_20270109_imbarco_fco').event_at, expectedImbarcoUtc, 'Imbarco riconciliato in D1 a Asia/Taipei');
      assert.equal(db.jobs.filter(j => j.entity_key === 'attivita:attivita_1793365094188_qlzg2').length, 0, 'Job spurio 01/12 rimosso in riconciliazione');
      assert.equal(db.jobs.find(j => j.entity_key === 'trasporti:trn_20270103_desert_rose_tao').event_at, Date.UTC(2027, 0, 2, 22, 45, 0), 'Job valido preesistente preservato');
      assert.ok(recRes.removedCount >= 1);
    } finally {
      Date.now = realDateNow;
    }
  });

  console.log(`\n=== TEST P1 COMPLETATI: ${passed}/${passed} PASS ===`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
