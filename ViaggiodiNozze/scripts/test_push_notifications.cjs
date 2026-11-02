const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const core = require(path.join(root, 'functions/lib/pushCore.js'));

let passed = 0;
function test(name, callback) {
  callback();
  passed += 1;
  console.log(`[PASS ${passed}] ${name}`);
}

test('Preferenze non valide tornano a valori sicuri', () => {
  assert.deepEqual(core.normalizePushPreferences({ activities: false, reminderMinutes: 17 }), {
    transports: true,
    activities: false,
    lodging: true,
    deadlines: true,
    collaboration: true,
    reminderMinutes: 60,
  });
});

test('Validazione fusi IANA', () => {
  assert.equal(core.isValidTimeZone('Europe/Rome'), true);
  assert.equal(core.isValidTimeZone('Pacific/Auckland'), true);
  assert.equal(core.isValidTimeZone('Italia/Roma'), false);
});

test('Conversione Europe/Rome in inverno', () => {
  assert.equal(core.zonedDateTimeToUtc('2099-01-15', '10:00', 'Europe/Rome'), Date.UTC(2099, 0, 15, 9, 0));
});

test('Conversione Pacific/Auckland in estate', () => {
  assert.equal(core.zonedDateTimeToUtc('2099-01-15', '10:00', 'Pacific/Auckland'), Date.UTC(2099, 0, 14, 21, 0));
});

test('Nessun promemoria senza fuso o orario certo', () => {
  assert.equal(core.buildReminderCandidates('attivita', {
    status: 'prenotato', date: '2099-01-15', time: '10:00',
  }).length, 0);
  assert.equal(core.buildReminderCandidates('alloggi', {
    status: 'prenotato', checkIn: '2099-01-15', timeZone: 'Europe/Rome',
  }).length, 0);
});

test('Trasporto e riconsegna producono due promemoria', () => {
  const reminders = core.buildReminderCandidates('trasporti', {
    status: 'prenotato', type: 'auto', date: '2099-01-15', departureTime: '10:00',
    departureTimeZone: 'Europe/Rome', dropoffDate: '2099-01-20', dropoffTime: '09:00',
    dropoffTimeZone: 'Pacific/Auckland',
  });
  assert.deepEqual(reminders.map(item => item.kind), ['transport_departure', 'rental_return']);
});

test('Scadenze push richiedono data ora fuso e verifica', () => {
  assert.equal(core.buildDeadlineReminderCandidate({
    recordKind: 'scadenza', status: 'da_fare', dateVerified: false,
    dueDate: '2099-01-15', dueTime: '10:00', timeZone: 'Europe/Rome', reminderMinutesBefore: 60,
  }).length, 0);
  const reminders = core.buildDeadlineReminderCandidate({
    recordKind: 'scadenza', status: 'da_fare', dateVerified: true,
    dueDate: '2099-01-15', dueTime: '10:00', timeZone: 'Europe/Rome', reminderMinutesBefore: 1440,
  });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].kind, 'deadline_due');
  assert.equal(reminders[0].leadMinutes, 1440);
  assert.equal(reminders[0].url.endsWith('?pushView=scadenze'), true);
});

test('Payload generici non contengono categorie sensibili', () => {
  const reminders = [
    ...core.buildReminderCandidates('trasporti', { status: 'prenotato', date: '2099-01-15', departureTime: '10:00', departureTimeZone: 'Europe/Rome' }),
    ...core.buildReminderCandidates('attivita', { status: 'prenotato', date: '2099-01-15', time: '10:00', timeZone: 'Europe/Rome' }),
    ...core.buildReminderCandidates('alloggi', { status: 'prenotato', checkIn: '2099-01-15', checkInTime: '15:00', checkOut: '2099-01-16', checkOutTime: '10:00', timeZone: 'Europe/Rome' }),
  ];
  assert.ok(reminders.length >= 4);
  assert.ok(reminders.every(item => !core.containsSensitivePushContent(`${item.title} ${item.body}`)));
});

const functionsSource = read('functions/src/pushFunctions.ts');
const hookSource = read('src/hooks/usePushNotifications.ts');
const serviceSource = read('src/services/pushNotificationService.ts');
const syncSource = read('src/storage/syncService.ts');
const workerSource = read('public/push-sw.js');
const rulesSource = read('firestore.rules');
const legacySender = read('scripts/send-update-notification.cjs');
const oggiSource = read('src/views/OggiView.tsx');

test('Chiavi private assenti dai fallback sorgente', () => {
  assert.equal(/VAPID_PRIVATE_KEY\s*\|\|\s*['"][^'"]+/.test(legacySender), false);
  assert.equal(functionsSource.includes("defineSecret('VAPID_PRIVATE_KEY')"), true);
});

test('Subscription attiva solo dopo conferma server', () => {
  assert.equal(serviceSource.includes("if (data.active !== true) throw new Error"), true);
  assert.equal(hookSource.includes("setState('active')"), true);
  assert.equal(hookSource.includes('registerPushOnServer(subscription, preferences)'), true);
});

test('Permesso negato revoca la registrazione server quando possibile', () => {
  assert.equal(hookSource.includes("currentPermission === 'denied'"), true);
  assert.equal(hookSource.includes('unregisterPushOnServer(stored.subscriberId)'), true);
});

test('Identità subscription lega utente viaggio e dispositivo', () => {
  assert.equal(serviceSource.includes('`${uid}\\n${tripId}\\n${deviceId}`'), true);
  assert.equal(functionsSource.includes('expectedSubscriberId(uid, tripId, deviceId)'), true);
});

test('Mittente richiede autenticazione e membership', () => {
  assert.equal((functionsSource.match(/if \(!request\.auth\)/g) || []).length >= 5, true);
  assert.equal(functionsSource.includes('await assertTripMember'), true);
});

test('Callable push protette da App Check', () => {
  assert.equal((functionsSource.match(/onCall\(\{ cors: true, enforceAppCheck: true/g) || []).length >= 5, true);
});

test('Collaborazione esclude autore e limita Owner Copilota', () => {
  assert.equal(functionsSource.includes('subscriber.uid === data.actorUid'), true);
  assert.equal(functionsSource.includes("currentRole !== 'owner' && currentRole !== 'copilota'"), true);
});

test('Deduplicazione e rate limit sono persistenti', () => {
  assert.equal(functionsSource.includes("hash(`mutation|${tripId}|${mutationId}`)"), true);
  assert.equal(functionsSource.includes('Date.now() - lastSentAt < 30_000'), true);
});

test('Nessuna scansione globale dei viaggi per i promemoria', () => {
  assert.equal(functionsSource.includes("collection('trips').get()"), false);
  assert.equal(functionsSource.includes(".collection(collection)\n      .where(dateField, '>=', fromDate)"), true);
  assert.equal(functionsSource.includes('.limit(100)'), true);
  assert.equal(functionsSource.includes("collection('note')\n    .where('dueDate', '>=', fromDate)"), true);
});

test('Scadenze usano job deterministici e payload generico', () => {
  assert.equal(functionsSource.includes("await replaceEntityJobs(db, tripId, 'note', entityId, candidates)"), true);
  assert.equal(functionsSource.includes('item.leadMinutes ?? preferences.reminderMinutes'), true);
  const deadline = core.buildDeadlineReminderCandidate({
    recordKind: 'scadenza', status: 'da_fare', dateVerified: true,
    dueDate: '2099-01-15', dueTime: '10:00', timeZone: 'Europe/Rome', reminderMinutesBefore: 60,
  })[0];
  assert.equal(core.containsSensitivePushContent(`${deadline.title} ${deadline.body}`), false);
});

test('Regole negano accesso client alle code push', () => {
  for (const collection of ['push_subscribers', 'push_jobs', 'push_dispatches']) {
    const section = rulesSource.slice(rulesSource.indexOf(`match /${collection}`));
    assert.equal(section.slice(0, 180).includes('allow read, write: if false;'), true);
  }
});

test('Service Worker usa scope PWA e deep link controllati', () => {
  assert.equal(workerSource.includes('self.registration.scope'), true);
  assert.equal(workerSource.includes('target.origin !== scopeUrl.origin'), true);
  assert.equal(workerSource.includes('!target.pathname.startsWith(scopeUrl.pathname)'), true);
});

test('Il hook non registra un Service Worker concorrente', () => {
  assert.equal(hookSource.includes('navigator.serviceWorker.register'), false);
  assert.equal(hookSource.includes('navigator.serviceWorker.ready'), true);
});

test('Solo mutazioni locali esplicite richiedono collaborazione', () => {
  assert.equal(syncSource.includes('source === \'cloud\''), true);
  assert.equal(syncSource.includes('{ notifyCollaborators: true, mutationId }'), true);
  assert.equal(syncSource.includes("this.pushToCloud(entityType, 'save', localData);"), true);
});

test('Menu desktop è un portale sopra le card e resta nel viewport', () => {
  assert.equal(oggiSource.includes('createPortal('), true);
  assert.equal(oggiSource.includes('z-[100000]'), true);
  assert.equal(oggiSource.includes("transform: insertMenuPosition.openAbove ? 'translateY(-100%)'"), true);
  assert.equal(oggiSource.includes('max-h-[calc(100vh-1.5rem)] overflow-y-auto'), true);
});

console.log(`\n${passed}/${passed} verifiche push e desktop mirate superate.`);
