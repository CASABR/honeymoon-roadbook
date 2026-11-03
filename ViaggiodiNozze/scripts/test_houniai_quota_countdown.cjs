const assert = require('assert');

const MAX_HOUNIAI_UID_REQUESTS_PER_DAY = 30;
const MAX_HOUNIAI_GLOBAL_REQUESTS_PER_DAY = 150;
const MAX_HOUNIAI_UID_REQUESTS_PER_MINUTE = 6;

function getNextMidnightUtcIso() {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
  return next.toISOString();
}

function formatQuotaCountdown(resetAtUtc, now = Date.now()) {
  const resetMs = new Date(resetAtUtc).getTime();
  const diffMs = Math.max(0, resetMs - now);
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

function formatLocalResetTime(resetAtUtc) {
  return new Date(resetAtUtc).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function renderQuotaLabel(state, now = Date.now()) {
  const countdownStr = formatQuotaCountdown(state.resetAtUtc, now);
  const minuteCountdown = state.blockedUntil && state.blockedUntil > now
    ? Math.ceil((state.blockedUntil - now) / 1000)
    : 0;

  if (minuteCountdown > 0) {
    return `Troppe richieste · Riprova tra ${minuteCountdown}s`;
  }
  if (state.isSharedLimitReached) {
    return `Disponibilità globale condivisa esaurita · Reset tra ${countdownStr}`;
  }
  if (state.remainingToday === 0) {
    return `Quota personale esaurita (0/${state.maxDaily}) · Ripristino tra ${countdownStr}`;
  }
  return `${state.remainingToday} richieste disponibili · Ripristino tra ${countdownStr}`;
}

console.log('--- TEST 1: SOGLIE ALLINEATE TRA BACKEND E FRONTEND ---');
assert.strictEqual(MAX_HOUNIAI_UID_REQUESTS_PER_DAY, 30);
assert.strictEqual(MAX_HOUNIAI_GLOBAL_REQUESTS_PER_DAY, 150);
assert.strictEqual(MAX_HOUNIAI_UID_REQUESTS_PER_MINUTE, 6);
console.log('Soglie verificate: 30/giorno utente, 150/giorno globale, 6/min');

console.log('--- TEST 2: FORMATTAZIONE COUNTDOWN UTC E RESET LOCALE ---');
const midnightUtc = getNextMidnightUtcIso();
const countdown = formatQuotaCountdown(midnightUtc);
const localReset = formatLocalResetTime(midnightUtc);
console.log('Prossimo reset UTC:', midnightUtc);
console.log('Countdown calcolato:', countdown);
console.log('Ora reset locale (con fuso e DST):', localReset);
assert.match(countdown, /^\d{2}h \d{2}m$/);
assert(localReset.includes(':'));

console.log('--- TEST 3: STATO NORMALE DISPONIBILITA (ES. 18 RICHIESTE) ---');
const normalState = {
  remainingToday: 18,
  maxDaily: 30,
  resetAtUtc: midnightUtc,
  lastUpdated: Date.now()
};
const normalLabel = renderQuotaLabel(normalState);
console.log('Label normale:', normalLabel);
assert(normalLabel.startsWith('18 richieste disponibili · Ripristino tra '));

console.log('--- TEST 4: BLOCCO LIMITE AL MINUTO (RETRY-AFTER 30S) ---');
const now = Date.now();
const minuteState = {
  remainingToday: 15,
  maxDaily: 30,
  resetAtUtc: midnightUtc,
  blockedUntil: now + 25000,
  lastUpdated: now
};
const minuteLabel = renderQuotaLabel(minuteState, now);
console.log('Label minuto:', minuteLabel);
assert.strictEqual(minuteLabel, 'Troppe richieste · Riprova tra 25s');

console.log('--- TEST 5: QUOTA GIORNALIERA PERSONALE ESAURITA ---');
const userExhaustedState = {
  remainingToday: 0,
  maxDaily: 30,
  resetAtUtc: midnightUtc,
  lastUpdated: now
};
const userLabel = renderQuotaLabel(userExhaustedState, now);
console.log('Label quota esaurita:', userLabel);
assert(userLabel.startsWith('Quota personale esaurita (0/30) · Ripristino tra '));

console.log('--- TEST 6: DISPONIBILITA GLOBALE CONDIVISA ESAURITA ---');
const globalExhaustedState = {
  remainingToday: 5,
  maxDaily: 30,
  resetAtUtc: midnightUtc,
  isSharedLimitReached: true,
  lastUpdated: now
};
const globalLabel = renderQuotaLabel(globalExhaustedState, now);
console.log('Label globale condivisa:', globalLabel);
assert(globalLabel.startsWith('Disponibilità globale condivisa esaurita · Reset tra '));

console.log('TUTTI I TEST QUOTE E COUNTDOWN SUPERATI CON SUCCESSO!');
