/**
 * Automated Test Suite: Beta Google Login, Copilot Notes Icon, PWA Updates & Security
 *
 * Checks:
 * 1. Google Login flow: new account, pre-existing account handling with credentialFromError.
 * 2. Error handling: popup-blocked, popup-closed-by-user, empty trip state vs authorized trips list.
 * 3. Pending invite preservation during OAuth flow.
 * 4. Copilot notes icon semantics: gray when empty, emerald (green) when present, removal reverts to gray.
 * 5. PWA update & build version consistency: commit hash and build timestamp defined dynamically.
 * 6. Security verification: offline local role vs Firestore rules & timestamp conflict resolution.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

console.log('\n============================================================');
console.log('🧪 HOUNIGO BETA TEST SUITE: GOOGLE LOGIN, COPILOT & PWA');
console.log('============================================================\n');

// ─── 1. GOOGLE LOGIN FLOW & TRANSITION TESTS ───
console.log('--- Gruppo 1: Flusso Login Google e Gestione Errori ---');

runTest('1.1 OnboardingView imposta mode=account_login dopo login Google riuscito', () => {
  const onboardingFile = fs.readFileSync(path.join(__dirname, '../src/views/OnboardingView.tsx'), 'utf-8');
  // Deve chiamare setMode('account_login') dentro handleGoogleLogin
  const match = onboardingFile.match(/handleGoogleLogin\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?setMode\('account_login'\);[\s\S]*?await inspectUserTrips/);
  assert.ok(match, 'handleGoogleLogin deve impostare setMode("account_login") prima o durante inspectUserTrips');
});

runTest('1.2 accountService gestisce auth/credential-already-in-use con credentialFromError', () => {
  const accountServiceFile = fs.readFileSync(path.join(__dirname, '../src/services/accountService.ts'), 'utf-8');
  assert.ok(
    accountServiceFile.includes('GoogleAuthProvider.credentialFromError(linkErr)'),
    'accountService deve estrarre la credenziale da linkErr per evitare il secondo popup bloccato'
  );
  assert.ok(
    accountServiceFile.includes('signInWithCredential(auth, credential)'),
    'accountService deve eseguire signInWithCredential per accedere senza secondo popup'
  );
});

runTest('1.3 accountService include checkPendingRedirectResult per iOS Safari e PWA standalone', () => {
  const accountServiceFile = fs.readFileSync(path.join(__dirname, '../src/services/accountService.ts'), 'utf-8');
  assert.ok(
    accountServiceFile.includes('export async function checkPendingRedirectResult'),
    'accountService deve esportare checkPendingRedirectResult per recuperare redirect OAuth'
  );
  assert.ok(
    accountServiceFile.includes('getRedirectResult(auth)'),
    'checkPendingRedirectResult deve interrogare getRedirectResult(auth)'
  );
});

runTest('1.4 OnboardingView mostra banner di errore con pulsante Riprova in modalità select', () => {
  const onboardingFile = fs.readFileSync(path.join(__dirname, '../src/views/OnboardingView.tsx'), 'utf-8');
  assert.ok(
    onboardingFile.includes('Riprova con Google ↻'),
    'La schermata select deve mostrare un banner di errore con pulsante Riprova'
  );
  assert.ok(
    onboardingFile.includes('Accedi con Email'),
    'La schermata select deve offrire fallback ad accesso Email se Google fallisce'
  );
});

runTest('1.5 Preservazione invito pendente tra redirect OAuth e sessioni', () => {
  const onboardingFile = fs.readFileSync(path.join(__dirname, '../src/views/OnboardingView.tsx'), 'utf-8');
  assert.ok(
    onboardingFile.includes("sessionStorage.setItem('houni_pending_invite'"),
    'OnboardingView deve salvare l\'invito pendente in sessionStorage'
  );
  assert.ok(
    onboardingFile.includes("sessionStorage.getItem('houni_pending_invite')"),
    'OnboardingView deve ripristinare l\'invito pendente da sessionStorage se non presente in URL'
  );
  assert.ok(
    onboardingFile.includes("sessionStorage.removeItem('houni_pending_invite')"),
    'OnboardingView deve ripulire l\'invito pendente al completamento'
  );
});

runTest('1.6 account_login mostra stato vuoto utile quando trips.length === 0', () => {
  const onboardingFile = fs.readFileSync(path.join(__dirname, '../src/views/OnboardingView.tsx'), 'utf-8');
  assert.ok(
    onboardingFile.includes('Nessun viaggio trovato nella cronologia di questo account.'),
    'Lo stato vuoto deve essere esplicito e comunicare che il login è riuscito ma non ci sono viaggi'
  );
  assert.ok(
    onboardingFile.includes('Crea il tuo primo viaggio'),
    'Lo stato vuoto deve consentire la creazione di un viaggio'
  );
  assert.ok(
    onboardingFile.includes('Partecipa con un codice viaggio'),
    'Lo stato vuoto deve consentire l\'adesione con un codice'
  );
});

// ─── 2. NOTE COPILOTA ICON SEMANTICS & PERSISTENCE ───
console.log('\n--- Gruppo 2: Icona Note Copilota ---');

runTest('2.1 TappaCard: icona verde/emerald se note presenti, grigia/slate se assenti', () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/components/cards/TappaCard.tsx'), 'utf-8');
  assert.ok(
    file.includes('bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'),
    'TappaCard deve usare emerald quando hasCopilotNotes è true'
  );
  assert.ok(
    !file.includes('bg-amber-50 dark:bg-amber-950/40 border-amber-200'),
    'TappaCard non deve più usare amber per note presenti'
  );
  assert.ok(
    file.includes('Note Copilota presenti'),
    'TappaCard deve avere title informativo coerente'
  );
});

runTest('2.2 TrasportoCard: icona verde/emerald se note presenti, grigia/slate se assenti', () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/components/cards/TrasportoCard.tsx'), 'utf-8');
  assert.ok(
    file.includes('bg-emerald-50 hover:bg-emerald-100 border-emerald-200'),
    'TrasportoCard deve usare emerald quando hasCopilotNotes è true'
  );
  assert.ok(
    !file.includes('bg-amber-50 dark:bg-amber-950/60 border-amber-200'),
    'TrasportoCard non deve più usare amber per note presenti'
  );
});

runTest('2.3 AttivitaCard: icona verde/emerald se note presenti, grigia/slate se assenti', () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/components/cards/AttivitaCard.tsx'), 'utf-8');
  assert.ok(
    file.includes('bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'),
    'AttivitaCard deve usare emerald quando hasCopilotNotes è true'
  );
  assert.ok(
    !file.includes('bg-amber-50 dark:bg-amber-950/40 border-amber-200'),
    'AttivitaCard non deve più usare amber per note presenti'
  );
});

runTest('2.4 AlloggioCard: icona verde/emerald se note presenti, grigia/slate se assenti', () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/components/cards/AlloggioCard.tsx'), 'utf-8');
  assert.ok(
    file.includes('bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'),
    'AlloggioCard deve usare emerald quando hasCopilotNotes è true'
  );
  assert.ok(
    !file.includes('bg-amber-50 dark:bg-amber-950/40 border-amber-200'),
    'AlloggioCard non deve più usare amber per note presenti'
  );
});

runTest('2.5 Sincronizzazione immediata dello stato React in tutte le schede (0ms UI latency)', () => {
  const tappaFile = fs.readFileSync(path.join(__dirname, '../src/components/cards/TappaCard.tsx'), 'utf-8');
  const trasportoFile = fs.readFileSync(path.join(__dirname, '../src/components/cards/TrasportoCard.tsx'), 'utf-8');
  const attivitaFile = fs.readFileSync(path.join(__dirname, '../src/components/cards/AttivitaCard.tsx'), 'utf-8');
  const alloggioFile = fs.readFileSync(path.join(__dirname, '../src/components/cards/AlloggioCard.tsx'), 'utf-8');

  assert.ok(tappaFile.includes('setCopilotNotes(clean);'), 'TappaCard deve aggiornare lo stato locale immediatamente');
  assert.ok(trasportoFile.includes('setCopilotNotes(clean);'), 'TrasportoCard deve aggiornare lo stato locale immediatamente');
  assert.ok(attivitaFile.includes('setCopilotNotes(clean);'), 'AttivitaCard deve aggiornare lo stato locale immediatamente');
  assert.ok(alloggioFile.includes('setCopilotNotes(clean);'), 'AlloggioCard deve aggiornare lo stato locale immediatamente');
});

// ─── 3. PWA VERSION & AGGIORNAMENTI ───
console.log('\n--- Gruppo 3: Versione PWA e Aggiornamenti Controllati ---');

runTest('3.1 vite.config.ts definisce __COMMIT_HASH__ e __BUILD_TIME__ dinamicamente', () => {
  const viteConfig = fs.readFileSync(path.join(__dirname, '../vite.config.ts'), 'utf-8');
  assert.ok(viteConfig.includes('git rev-parse --short HEAD'), 'vite.config.ts deve estrarre commitHash tramite git');
  assert.ok(viteConfig.includes('__COMMIT_HASH__: JSON.stringify(commitHash)'), 'vite.config.ts deve definire __COMMIT_HASH__');
  assert.ok(viteConfig.includes('__BUILD_TIME__: JSON.stringify'), 'vite.config.ts deve definire __BUILD_TIME__');
});

runTest('3.2 LocalIdentityDiagnostics visualizza versione, commit e verifica SW', () => {
  const diagFile = fs.readFileSync(path.join(__dirname, '../src/components/dev/LocalIdentityDiagnostics.tsx'), 'utf-8');
  assert.ok(diagFile.includes('__COMMIT_HASH__'), 'LocalIdentityDiagnostics deve mostrare commit hash');
  assert.ok(diagFile.includes('__BUILD_TIME__'), 'LocalIdentityDiagnostics deve mostrare build time');
  assert.ok(diagFile.includes('handleCheckSwUpdate'), 'LocalIdentityDiagnostics deve includere controllo SW');
  assert.ok(diagFile.includes('reg.update()'), 'Controllo SW deve interrogare reg.update()');
});

runTest('3.3 SettingsMenu include controllo aggiornamenti PWA controllato (senza clearSiteData)', () => {
  const settingsFile = fs.readFileSync(path.join(__dirname, '../src/components/common/SettingsMenu.tsx'), 'utf-8');
  assert.ok(settingsFile.includes('Verifica aggiornamenti PWA'), 'SettingsMenu deve avere il pulsante aggiornamento PWA');
  assert.ok(settingsFile.includes('reg.update()'), 'SettingsMenu deve usare reg.update()');
  assert.ok(!settingsFile.includes('clearSiteData'), 'SettingsMenu NON deve eseguire clearSiteData');
  assert.ok(!settingsFile.includes('unregister'), 'SettingsMenu NON deve unregistrare indiscriminatamente il SW');
});

// ─── 4. SICUREZZA OFFLINE E MEMBERSHIP ───
console.log('\n--- Gruppo 4: Verifica Sicurezza Ruolo Offline e Sincronizzazione ---');

runTest('4.1 useAuthIdentity.ts mantiene controllo autorizzazione cloud rigoroso online', () => {
  const authIdFile = fs.readFileSync(path.join(__dirname, '../src/utils/useAuthIdentity.ts'), 'utf-8');
  assert.ok(
    authIdFile.includes("authoritativeCloudRole === 'owner' || authoritativeCloudRole === 'copilota'"),
    'Online deve verificare rigorosamente authoritativeCloudRole dal backend'
  );
});

runTest('4.2 SyncService non esegue push a Firestore per sessioni revocati o non autorizzate', () => {
  const syncFile = fs.readFileSync(path.join(__dirname, '../src/storage/syncService.ts'), 'utf-8');
  assert.ok(
    syncFile.includes('if (!isCloudAuthorized())'),
    'SyncService deve bloccare il push se la sessione non è autorizzata'
  );
});

runTest('4.3 Risoluzione conflitti temporali (last-write-wins basata su updatedAt)', () => {
  const syncFile = fs.readFileSync(path.join(__dirname, '../src/storage/syncService.ts'), 'utf-8');
  assert.ok(
    syncFile.includes('localUpdated > serverUpdated'),
    'SyncService deve spingere al cloud solo se locale è strettamente più recente del server'
  );
  assert.ok(
    syncFile.includes('await idbPut(store, itemToStore);'),
    'SyncService deve salvare localmente se il cloud è più recente, senza sovrascriverlo'
  );
});

console.log('\n============================================================');
console.log(`📊 RISULTATO FINALE: ${testsPassed} superati, ${testsFailed} falliti`);
console.log('============================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
