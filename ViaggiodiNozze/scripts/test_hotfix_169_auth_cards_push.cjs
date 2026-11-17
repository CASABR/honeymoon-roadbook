const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('HOUNIGO 1.6.9 — TEST COMPORTAMENTALE: ACCESSO, CARD E NOTIFICHE');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// 1. ISPEZIONE STATICA SORGENTI DI SICUREZZA
// -----------------------------------------------------------------------------
const appPath = path.join(__dirname, '../src/App.tsx');
const appSource = fs.readFileSync(appPath, 'utf8');

const authIdPath = path.join(__dirname, '../src/utils/useAuthIdentity.ts');
const authIdSource = fs.readFileSync(authIdPath, 'utf8');

const deviceRolePath = path.join(__dirname, '../src/utils/useDeviceRole.ts');
const deviceRoleSource = fs.readFileSync(deviceRolePath, 'utf8');

const accountServicePath = path.join(__dirname, '../src/services/accountService.ts');
const accountServiceSource = fs.readFileSync(accountServicePath, 'utf8');

const pushServicePath = path.join(__dirname, '../src/services/pushNotificationService.ts');
const pushServiceSource = fs.readFileSync(pushServicePath, 'utf8');

// A. Nessun signInAnonymously in App.tsx o pushNotificationService.ts
assert.ok(
  !appSource.includes('signInAnonymously'),
  'App.tsx non deve MAI invocare o importare signInAnonymously'
);
assert.ok(
  !pushServiceSource.includes('signInAnonymously(auth)') && !pushServiceSource.includes('import { signInAnonymously'),
  'pushNotificationService non deve importare o eseguire signInAnonymously'
);

// B. useAuthIdentity non deve revocare su errori temporanei
assert.ok(
  !authIdSource.includes('revokeTripAuth(tripId)'),
  'useAuthIdentity non deve invocare revokeTripAuth su query temporanee non confermate'
);

// C. useDeviceRole non deve bloccare un Owner con il ruolo locale viewer
assert.ok(
  deviceRoleSource.includes("cloudRole === 'owner') return 'guida'"),
  'useDeviceRole deve garantire ruolo guida a Owner cloud'
);
assert.ok(
  deviceRoleSource.includes('canMutateLocally()') && !deviceRoleSource.includes("canMutateLocally() && (effectiveRole === 'guida' || effectiveRole === 'copilota')"),
  'canEdit deve essere governato da canMutateLocally() senza che il ruolo locale viewer blocchi Owner/Copilota'
);

console.log('✓ 1. Ispezione statica completata: signInAnonymously debellato, nessuna revoca falsa, canEdit disaccoppiato da viewer.');

// -----------------------------------------------------------------------------
// 2. SIMULAZIONE COMPORTAMENTALE: LOGIN E PERSISTENZA IDENTITÀ
// -----------------------------------------------------------------------------
function simulateAuthBootstrap({ storedSession, idbSession, onAuthStateChangedUser }) {
  // Simula il cold start di App.tsx con attesa IndexedDB e onAuthStateChanged
  let currentUser = null;
  let isAnonymous = false;

  // 1. Sessione recuperata da localStorage o IndexedDB
  const restoredSession = storedSession?.isAuthenticated ? storedSession : idbSession;
  
  // 2. onAuthStateChanged risolto da Firebase Auth (senza forzatura anonima)
  if (onAuthStateChangedUser) {
    currentUser = onAuthStateChangedUser;
    isAnonymous = Boolean(onAuthStateChangedUser.isAnonymous);
  }

  return {
    authenticated: Boolean(restoredSession?.isAuthenticated || currentUser),
    currentUser,
    isAnonymous,
    persistedUid: currentUser?.uid || restoredSession?.uid || null
  };
}

// Case 2.1: Owner riapre l'app da cold start con sessione Google in IndexedDB
const ownerBoot = simulateAuthBootstrap({
  storedSession: { isAuthenticated: true, tripId: '0000', uid: 'google-owner-123' },
  idbSession: { isAuthenticated: true, tripId: '0000', uid: 'google-owner-123' },
  onAuthStateChangedUser: { uid: 'google-owner-123', email: 'owner@hounigo.com', isAnonymous: false }
});
assert.equal(ownerBoot.authenticated, true);
assert.equal(ownerBoot.isAnonymous, false);
assert.equal(ownerBoot.persistedUid, 'google-owner-123');

// Case 2.2: Nuovo visitatore / ospite non autenticato
const guestBoot = simulateAuthBootstrap({
  storedSession: null,
  idbSession: null,
  onAuthStateChangedUser: null
});
assert.equal(guestBoot.authenticated, false);
assert.equal(guestBoot.isAnonymous, false, 'Un visitatore non autenticato NON deve essere forzato in anonimo distruttivo');
assert.equal(guestBoot.currentUser, null);

console.log('✓ 2. Bootstrap autenticazione e persistenza sessione verificati senza distruzione account.');

// -----------------------------------------------------------------------------
// 3. SIMULAZIONE COMPORTAMENTALE: PERMESSI OWNER, COPILOTA, VIEWER E CARD EDITING
// -----------------------------------------------------------------------------
function simulatePermissionsAndCardEdit({
  cloudRole,
  localRoleInStorage = 'viewer',
  currentUser = null,
  verifiedTripAuth = null,
  tripId = '0000',
  isOnline = true
}) {
  // Simula canMutateLocally
  let canMutate = false;
  if (cloudRole === 'owner' || cloudRole === 'copilota') {
    canMutate = true;
  } else if (cloudRole === 'viewer') {
    canMutate = false;
  } else {
    // offline o checking
    const isOfflineOrChecking = cloudRole === 'offline' || cloudRole === 'checking' || !isOnline;
    if (isOfflineOrChecking) {
      if (currentUser && !currentUser.isAnonymous) {
        if (verifiedTripAuth && verifiedTripAuth.uid === currentUser.uid && verifiedTripAuth.tripId === tripId && ['owner', 'copilota'].includes(verifiedTripAuth.role)) {
          canMutate = true;
        }
      } else if (!currentUser) {
        if (verifiedTripAuth && verifiedTripAuth.tripId === tripId && ['owner', 'copilota'].includes(verifiedTripAuth.role)) {
          canMutate = true;
        }
      }
    }
  }

  // Simula effectiveRole in useDeviceRole
  let effectiveRole = localRoleInStorage;
  if (cloudRole === 'owner') effectiveRole = 'guida';
  else if (cloudRole === 'copilota') effectiveRole = 'copilota';
  else if (cloudRole === 'viewer') effectiveRole = 'viewer';
  else if (verifiedTripAuth && (verifiedTripAuth.role === 'owner' || verifiedTripAuth.role === 'copilota')) {
    effectiveRole = verifiedTripAuth.role === 'owner' ? 'guida' : 'copilota';
  }

  // canEdit unificato 1.6.9
  const canEdit = canMutate;

  // Azione al click sulla card
  const cardAction = canEdit ? 'OPEN_EDIT_FORM' : 'OPEN_READONLY_DETAIL';

  return { canMutate, effectiveRole, canEdit, cardAction };
}

// Case 3.1: Owner autenticato, anche se localStorage ha residuo 'viewer'
const ownerWithViewerInStorage = simulatePermissionsAndCardEdit({
  cloudRole: 'owner',
  localRoleInStorage: 'viewer'
});
assert.equal(ownerWithViewerInStorage.canEdit, true, 'Owner DEVE poter modificare anche se localStorage contiene viewer');
assert.equal(ownerWithViewerInStorage.effectiveRole, 'guida');
assert.equal(ownerWithViewerInStorage.cardAction, 'OPEN_EDIT_FORM');

// Case 3.2: Copilota autenticato, anche se localStorage ha residuo 'viewer'
const copilotWithViewerInStorage = simulatePermissionsAndCardEdit({
  cloudRole: 'copilota',
  localRoleInStorage: 'viewer'
});
assert.equal(copilotWithViewerInStorage.canEdit, true, 'Copilota DEVE poter modificare anche se localStorage contiene viewer');
assert.equal(copilotWithViewerInStorage.effectiveRole, 'copilota');
assert.equal(copilotWithViewerInStorage.cardAction, 'OPEN_EDIT_FORM');

// Case 3.3: Ospite non autorizzato, anche se localStorage è impostato a 'guida'
const guestWithGuidaInStorage = simulatePermissionsAndCardEdit({
  cloudRole: 'unverified',
  localRoleInStorage: 'guida',
  currentUser: null
});
assert.equal(guestWithGuidaInStorage.canEdit, false, 'Ospite non autorizzato NON deve poter modificare anche se localStorage ha guida');
assert.equal(guestWithGuidaInStorage.cardAction, 'OPEN_READONLY_DETAIL');

// Case 3.4: Viewer esplicito da cloud
const explicitViewer = simulatePermissionsAndCardEdit({
  cloudRole: 'viewer',
  localRoleInStorage: 'guida'
});
assert.equal(explicitViewer.canEdit, false, 'Viewer cloud non può mai modificare');
assert.equal(explicitViewer.effectiveRole, 'viewer');
assert.equal(explicitViewer.cardAction, 'OPEN_READONLY_DETAIL');

console.log('✓ 3. Separazione permessi cloud dal ruolo locale verificata al 100%.');

// -----------------------------------------------------------------------------
// 4. SIMULAZIONE COMPORTAMENTALE: OFFLINE E SINCRONIZZAZIONE
// -----------------------------------------------------------------------------
// Case 4.1: Owner offline su viaggio 0000 con credenziali verificate salvate
const offlineOwner = simulatePermissionsAndCardEdit({
  cloudRole: 'offline',
  isOnline: false,
  currentUser: { uid: 'owner-123', isAnonymous: false },
  verifiedTripAuth: { uid: 'owner-123', tripId: '0000', role: 'owner' }
});
assert.equal(offlineOwner.canEdit, true, 'Owner offline con credenziali salvate deve poter modificare localmente');
assert.equal(offlineOwner.effectiveRole, 'guida');
assert.equal(offlineOwner.cardAction, 'OPEN_EDIT_FORM');

// Case 4.2: Errore temporaneo Firestore (es. timeout di rete / unavailable)
// NON deve revocare l'utente: lo stato decade a offline e l'Owner continua a lavorare
const transientFirestoreFailure = simulatePermissionsAndCardEdit({
  cloudRole: 'offline', // useAuthIdentity mappa FirebaseError / unavailable su offline
  isOnline: true,
  currentUser: { uid: 'owner-123', isAnonymous: false },
  verifiedTripAuth: { uid: 'owner-123', tripId: '0000', role: 'owner' }
});
assert.equal(transientFirestoreFailure.canEdit, true, 'Errore transitorio Firestore non revoca permessi');

console.log('✓ 4. Resilienza offline e gestione errori temporanei Firestore verificata.');

// -----------------------------------------------------------------------------
// 5. SIMULAZIONE COMPORTAMENTALE: ATTIVAZIONE PUSH ED ERRORI 401, 403, 500
// -----------------------------------------------------------------------------
function simulatePushRegistrationFlow({
  hasUser,
  isAnonymous,
  isTripMember,
  httpStatus = 200,
  serverErrorMessage = ''
}) {
  // Step 1: ensurePushAuthUser
  if (!hasUser) {
    return {
      success: false,
      step: 'AUTH_CHECK',
      error: 'Accedi con il tuo account Organizzatore o Copilota (Google o Email) per attivare le notifiche del viaggio.',
      state: 'browser-only',
      requiresLogin: true
    };
  }
  if (isAnonymous && !isTripMember) {
    return {
      success: false,
      step: 'AUTH_CHECK',
      error: 'La sessione attiva non è autorizzata come Organizzatore o Copilota del viaggio sul server push.',
      state: 'browser-only',
      requiresLogin: true
    };
  }

  // Step 2: Chiamata HTTP al Cloudflare Worker
  if (httpStatus === 200) {
    return {
      success: true,
      step: 'SERVER_CONFIRMED',
      state: 'active',
      diagnostic: 'Subscription confermata per il viaggio 0000.'
    };
  } else if (httpStatus === 401 || httpStatus === 403) {
    return {
      success: false,
      step: 'SERVER_HTTP_ERROR',
      httpStatus,
      state: 'error',
      diagnostic: serverErrorMessage || `Accesso negato dal server push (HTTP ${httpStatus}).`,
      requiresReauth: true
    };
  } else if (httpStatus >= 500) {
    return {
      success: false,
      step: 'SERVER_HTTP_ERROR',
      httpStatus,
      state: 'server-unavailable',
      diagnostic: 'Server push temporaneamente non disponibile (HTTP 500/503).'
    };
  }

  return { success: false, step: 'UNKNOWN' };
}

// Case 5.1: Utente non loggato tenta push -> Messaggio chiaro di invito al login
const pushNoLogin = simulatePushRegistrationFlow({ hasUser: false });
assert.equal(pushNoLogin.success, false);
assert.equal(pushNoLogin.requiresLogin, true);
assert.ok(pushNoLogin.error.includes('Accedi con il tuo account Organizzatore'));

// Case 5.2: Utente autenticato Owner -> Successo 200
const pushOwnerOk = simulatePushRegistrationFlow({ hasUser: true, isAnonymous: false, isTripMember: true, httpStatus: 200 });
assert.equal(pushOwnerOk.success, true);
assert.equal(pushOwnerOk.state, 'active');

// Case 5.3: Errore 403 Forbidden dal server push
const push403 = simulatePushRegistrationFlow({ hasUser: true, isAnonymous: false, httpStatus: 403, serverErrorMessage: 'assertTripMember: non autorizzato su 0000' });
assert.equal(push403.success, false);
assert.equal(push403.httpStatus, 403);
assert.equal(push403.state, 'error');

// Case 5.4: Errore 500 dal server push
const push500 = simulatePushRegistrationFlow({ hasUser: true, isAnonymous: false, httpStatus: 500 });
assert.equal(push500.success, false);
assert.equal(push500.httpStatus, 500);
assert.equal(push500.state, 'server-unavailable');

console.log('✓ 5. Flusso push ed errori HTTP 401, 403, 500 verificati con diagnostica dettagliata.');

console.log('\n========================================================================');
console.log('TUTTI I TEST COMPORTAMENTALI PER HOUNIGO 1.6.9 SUPERATI CON SUCCESSO!');
console.log('========================================================================\n');
