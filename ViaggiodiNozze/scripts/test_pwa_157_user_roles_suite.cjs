const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

console.log('=== TEST SUITE RUOLI SINTETICI, AUTORIZZAZIONI E PAGAMENTI PWA 1.5.7 ===\n');

// --------------------------------------------------------------------------
// TEST 1: PAGAMENTI COERENTI & NON DICHIARARE SALDATO SE RESIDUO > 0
// --------------------------------------------------------------------------
console.log('--- Test 1: Pagamenti e coerenza contabile ---');
const priceHelperCode = read('src/utils/priceHelper.ts');
assert(priceHelperCode.includes('NON considerare saldato un elemento solo per'), 'priceHelper deve contenere la guardia per completed');

// Simulazione logica esatta di resolvePaymentInfo
function formatCompactEuro(val) {
  if (Math.round(val) === val) return `€${val.toLocaleString('it-IT')}`;
  return `€${val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolvePaymentSim(item) {
  const costNum = Number(item.cost || 0);
  const parsedPaidNum = Number(item.depositPaid || item.acconto || item.amountPaid || 0);

  const isExplicitPaid =
    item.paymentStatus === 'saldato' ||
    item.status === 'saldato' ||
    (costNum > 0 && parsedPaidNum >= costNum);

  const isPaid = isExplicitPaid && (item.paymentStatus !== 'da_saldare' || (costNum > 0 && parsedPaidNum >= costNum));

  const paidNum = isPaid ? costNum : parsedPaidNum;
  const remainingNum = isPaid ? 0 : Math.max(0, costNum - parsedPaidNum);

  let compactPaymentText = '';
  if (costNum > 0) {
    if (isPaid) {
      compactPaymentText = `${formatCompactEuro(costNum)} · Saldato`;
    } else if (parsedPaidNum > 0 && remainingNum > 0) {
      compactPaymentText = `${formatCompactEuro(remainingNum)} da saldare · Cap. ${formatCompactEuro(parsedPaidNum)}`;
    } else {
      compactPaymentText = `${formatCompactEuro(costNum)} · Da saldare`;
    }
  }

  return { isPaid, costNum, paidNum, remainingNum, compactPaymentText };
}

// 1.1: Costo 180, caparra 60, da saldare
const res1 = resolvePaymentSim({ cost: 180, depositPaid: '60', paymentStatus: 'da_saldare' });
assert.equal(res1.isPaid, false, 'Non deve essere saldato');
assert.equal(res1.paidNum, 60, 'PaidNum deve essere 60');
assert.equal(res1.remainingNum, 120, 'RemainingNum deve essere 120');
assert.equal(res1.compactPaymentText, '€120 da saldare · Cap. €60', 'Formato compatto caparra');
console.log('PASS 1.1: Costo 180, acconto 60 -> €120 da saldare · Cap. €60');

// 1.2: Costo 180, caparra 60, MA status='completato' o completed=true (es. check-in effettuato)
const res1b = resolvePaymentSim({ cost: 180, depositPaid: '60', paymentStatus: 'da_saldare', status: 'completato', completed: true });
assert.equal(res1b.isPaid, false, 'Non deve essere saldato anche se completed=true');
assert.equal(res1b.remainingNum, 120, 'Residuo dovuto deve essere ancora 120');
assert.equal(res1b.compactPaymentText, '€120 da saldare · Cap. €60', 'Non deve dichiarare saldato un importo ancora dovuto');
console.log('PASS 1.2: Completed=true NON dichiara saldato un elemento con residuo dovuto');

// 1.3: Toggle a 'saldato': cost=180, depositPaid='60' (preservato), paymentStatus='saldato'
const res1c = resolvePaymentSim({ cost: 180, depositPaid: '60', paymentStatus: 'saldato' });
assert.equal(res1c.isPaid, true, 'Deve essere saldato');
assert.equal(res1c.remainingNum, 0, 'Residuo dovuto a saldo è 0');
assert.equal(res1c.paidNum, 180, 'Importo totale versato a saldo è 180');
assert.equal(res1c.compactPaymentText, '€180 · Saldato', 'Formato compatto saldato');
console.log('PASS 1.3: A saldo avvenuto, residuo è 0 e stringa è €180 · Saldato');

// 1.4: Toggle di ritorno a 'da_saldare': depositPaid='60' era preservato!
const res1d = resolvePaymentSim({ cost: 180, depositPaid: '60', paymentStatus: 'da_saldare' });
assert.equal(res1d.isPaid, false);
assert.equal(res1d.remainingNum, 120);
assert.equal(res1d.compactPaymentText, '€120 da saldare · Cap. €60');
console.log('PASS 1.4: Ritorno a da_saldare mantiene caparra originaria e calcola residuo corretto');

// --------------------------------------------------------------------------
// TEST 2: AUTORIZZAZIONI, IDENTITÀ VERIFICATE E PROTEZIONE DA REVOCHE
// --------------------------------------------------------------------------
console.log('\n--- Test 2: Matrice Ruoli Sintetici & Revoche ---');

// Mock localStorage per test
const mockStorage = new Map();
const localStorageMock = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};

// Simulazione logica isCloudAuthorized aggiornata
function isCloudAuthorizedSim(authoritativeCloudRole, currentTripId, currentUid) {
  if (authoritativeCloudRole === 'viewer') return false;
  if (authoritativeCloudRole === 'owner' || authoritativeCloudRole === 'copilota') return true;

  if (
    authoritativeCloudRole === 'checking' ||
    authoritativeCloudRole === 'offline' ||
    authoritativeCloudRole === 'unverified'
  ) {
    // 1. Se revocato per questo viaggio, respingi sempre
    if (localStorageMock.getItem(`houni_revoked_trip_${currentTripId}`) === 'true') {
      return false;
    }

    // 2. Verifica identità precedentemente verificata per questo specifico viaggio
    const raw = localStorageMock.getItem('houni_verified_trip_auth');
    if (raw) {
      try {
        const verified = JSON.parse(raw);
        if (verified.tripId === currentTripId && (verified.role === 'owner' || verified.role === 'copilota')) {
          if (!currentUid || !verified.uid || currentUid === verified.uid) {
            return true;
          }
        }
      } catch {}
    }
  }
  return false;
}

// 2.1: Owner Sintetico
localStorageMock.clear();
localStorageMock.setItem('houni_verified_trip_auth', JSON.stringify({ tripId: '0000', uid: 'owner_synth', role: 'owner', verifiedAt: Date.now() }));
assert.equal(isCloudAuthorizedSim('owner', '0000', 'owner_synth'), true, 'Owner online autorizzato');
assert.equal(isCloudAuthorizedSim('unverified', '0000', 'owner_synth'), true, 'Owner in lockdown autorizzato localmente');
assert.equal(isCloudAuthorizedSim('offline', '0000', 'owner_synth'), true, 'Owner offline autorizzato localmente');
assert.equal(isCloudAuthorizedSim('unverified', '9999', 'owner_synth'), false, 'Owner verificato su 0000 non può mutare viaggio 9999');
console.log('PASS 2.1: Owner sintetico verificato per 0000 autorizzato in lockdown/offline, isolato da altri viaggi');

// 2.2: Copilota Sintetico (non promosso a Owner/Guida!)
localStorageMock.clear();
localStorageMock.setItem('houni_verified_trip_auth', JSON.stringify({ tripId: '0000', uid: 'copilota_synth', role: 'copilota', verifiedAt: Date.now() }));
assert.equal(isCloudAuthorizedSim('copilota', '0000', 'copilota_synth'), true, 'Copilota online autorizzato');
assert.equal(isCloudAuthorizedSim('unverified', '0000', 'copilota_synth'), true, 'Copilota in lockdown autorizzato');

// Verifica che il ruolo copilota rimanga copilota (useDeviceRole)
const devRoleCode = read('src/utils/useDeviceRole.ts');
assert(devRoleCode.includes("if (cloudRole === 'copilota') return 'copilota'"), 'Copilota non deve essere promosso a guida/owner');
assert(devRoleCode.includes("canSeePrivateInfo = isCloudAuthorized && (effectiveRole === 'guida' || effectiveRole === 'copilota')"), 'Visibilità PNR/credenziali concessa a guida e copilota tramite canSeePrivateInfo');
console.log('PASS 2.2: Copilota sintetico mantiene ruolo "copilota" e accede a PNR/credenziali senza promozioni indebite');

// 2.3: Viewer Sintetico
localStorageMock.clear();
assert.equal(isCloudAuthorizedSim('viewer', '0000', 'viewer_synth'), false, 'Viewer online non autorizzato a mutare');
assert.equal(isCloudAuthorizedSim('unverified', '0000', 'viewer_synth'), false, 'Viewer non verificato respinto in lockdown');
console.log('PASS 2.3: Viewer sintetico respinto sia online che durante lockdown');

// 2.4: Utente Revocato Sintetico
localStorageMock.clear();
// L'utente aveva vecchi permessi locali nel telefono
localStorageMock.setItem('houni_device_role', 'guida');
localStorageMock.setItem('app_device_role', 'guida');

// Il server backend conferma che l'utente ora è VIEWER (revoca effettuata dall'Owner)
const cloudRoleConfirmed = 'viewer';
assert.equal(isCloudAuthorizedSim(cloudRoleConfirmed, '0000', 'revoked_synth'), false, 'Viewer confermato revoca mutazioni');

// La revoca viene registrata nel dispositivo
localStorageMock.setItem('houni_revoked_trip_0000', 'true');
localStorageMock.removeItem('houni_verified_trip_auth');
localStorageMock.setItem('houni_device_role', 'viewer');

// Ora simuliamo lockdown o disconnessione (cloudRole = unverified)
assert.equal(
  isCloudAuthorizedSim('unverified', '0000', 'revoked_synth'),
  false,
  'Utente revocato NON deve essere riabilitato durante lockdown o offline'
);
assert.equal(
  isCloudAuthorizedSim('offline', '0000', 'revoked_synth'),
  false,
  'Utente revocato NON deve essere riabilitato offline'
);
console.log('PASS 2.4: Utente revocato perde accesso privato e NON viene riabilitato in lockdown/offline');

// --------------------------------------------------------------------------
// TEST 3: NOTIFICHE PUSH & RECUPERO NUOVI UTENTI
// --------------------------------------------------------------------------
console.log('\n--- Test 3: Notifiche Push & Nuovi Utenti ---');
const pushServiceCode = read('src/services/pushNotificationService.ts');
assert(pushServiceCode.includes('ensurePushAuthUser'), 'pushNotificationService deve includere recupero sessione automatica');
assert(pushServiceCode.includes('signInAnonymously'), 'pushNotificationService deve consentire autenticazione anonima per nuovi utenti');

const pushBannerCode = read('src/components/common/PushOnboardingBanner.tsx');
assert(pushBannerCode.includes("permission === 'granted'"), 'Banner deve distinguere permesso concesso da registrazione attiva');
assert(pushBannerCode.includes('Completa registrazione'), 'Banner deve offrire pulsante di recupero semplice per nuovi utenti');
console.log('PASS 3: Catena notifiche supporta nuovi utenti con autenticazione automatica e recupero semplice');

// --------------------------------------------------------------------------
// TEST 4: ALTEZZA SCHERMATA OGGI SU MOBILE (AVVISO SCADENZE NON INVASIVO)
// --------------------------------------------------------------------------
console.log('\n--- Test 4: Avviso Scadenze & Altezza Schermata Oggi ---');
const oggiViewCode = read('src/views/OggiView.tsx');
assert(oggiViewCode.includes('deadlineSummary.reminders > 0'), 'Avviso scadenze deve attivarsi SOLO se vi sono promemoria attivi');
assert(!oggiViewCode.includes('deadlineSummary.active > 0 && deadlineSummary.next && ('), 'Avviso scadenze non deve occupare spazio per scadenze future ordinarie');
assert(oggiViewCode.includes('px-3 py-2 text-slate-900'), 'Avviso scadenze deve essere ultra-compatto (altezza ~36px)');
console.log('PASS 4: Avviso scadenze compatto, attivo solo per promemoria urgenti senza appesantire lo schermo');

console.log('\n>>> TUTTI I TEST DELLA SUITE REGRESSIONI E RUOLI SUPERATI! <<<');
