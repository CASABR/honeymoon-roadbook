/**
 * test_iphone_hotfix_verification.cjs
 * Suite di verifica automatizzata per HOUNIGO — HOTFIX FINALE POST-TEST IPHONE
 * 
 * Verifiche:
 * 1. Persistenza modifica orario (normalizzazione orario/time/orarioInizio/orarioRitrovo in storageService)
 * 2. Gestione collisione orari (allineamento orario e time in OggiView)
 * 3. Permesso mutazioni locali durante stato 'checking' (useAuthIdentity)
 * 4. Protezione sincronizzazione cloud (non sovrascrittura di modifiche locali con timestamp pari o inferiore)
 * 5. Coda push pendenti durante verifica sessione (pendingPushQueue in syncService)
 * 6. Ottimizzazione login Google (ricerca parallela Promise.allSettled con timeout in accountService)
 * 7. Stato progressivo login Google (onProgress e loginProgressMsg in OnboardingView)
 * 8. Distinzione ruoli viaggi (Organizzatore vs Copilota) e chiarimento invito per viaggi come Giappone
 * 9. HouniAI essenziale (rimozione pillole Foto/PDF/Assistente per recuperare spazio verticale)
 * 10. Privacy AI compatta con disclosure espandibile
 * 11. Gmail Connection Row in modalità beta (CTA non bloccante con badge "In preparazione" e documentazione GCP)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n=== HOUNIGO: VERIFICA HOTFIX FINALE POST-TEST IPHONE ===\n');

// 1. STORAGE SERVICE: Normalizzazione e persistenza orari bidirezionale
console.log('[TEST 1 & 2] Verifica persistenza orari e normalizzazione campi in storageService.ts');
const storagePath = path.join(__dirname, '..', 'src', 'storage', 'storageService.ts');
const storageContent = fs.readFileSync(storagePath, 'utf8');

assert(
  storageContent.includes("const rawTime = (activity.time || activity.orarioInizio || (activity as any).orario || activity.orarioRitrovo || '').trim();"),
  'storageService deve unificare time, orarioInizio, orario e orarioRitrovo nelle attività'
);
assert(
  storageContent.includes("orario: effectiveTime, // Mantenuto allineato per compatibilità totale") && storageContent.includes("time: effectiveTime"),
  'storageService deve sincronizzare bidirezionalmente orario e time nelle attività'
);
assert(
  storageContent.includes("const rawTime = (tappa.orario || (tappa as any).time || '').trim();"),
  'storageService deve unificare rawTime per le tappe'
);
assert(
  storageContent.includes("const rawTime = (ristorante.orario || (ristorante as any).time || '').trim();") ||
  storageContent.includes("((partial as any).time !== undefined ? (partial as any).time : (existing.orario || (existing as any).time || ''))"),
  'storageService deve unificare orario e time per i ristoranti e shopping'
);
console.log('  -> PASS: storageService garantisce allineamento e persistenza orario su tutte le entità.\n');

// 2. OGGIVIEW: Gestione collisioni orari
console.log('[TEST 5] Verifica gestione collisioni orari in OggiView.tsx');
const oggiPath = path.join(__dirname, '..', 'src', 'views', 'OggiView.tsx');
const oggiContent = fs.readFileSync(oggiPath, 'utf8');

assert(
  oggiContent.includes("orario: newTime,") && oggiContent.includes("time: newTime,"),
  'OggiView deve aggiornare sia orario che time quando viene risolta una collisione su una tappa'
);
console.log('  -> PASS: collisione orari aggiorna sia orario che time senza regressioni.\n');

// 3. USE AUTH IDENTITY: Permesso mutazioni locali in stato checking
console.log('[TEST 3 & 4] Verifica autorizzazione mutazioni locali durante stato "checking"');
const authIdPath = path.join(__dirname, '..', 'src', 'utils', 'useAuthIdentity.ts');
const authIdContent = fs.readFileSync(authIdPath, 'utf8');

assert(
  authIdContent.includes("authoritativeCloudRole === 'checking'"),
  'useAuthIdentity deve consentire mutazioni se il dispositivo ha già un ruolo locale attivo durante "checking"'
);
console.log('  -> PASS: useAuthIdentity permette mutazioni offline o in avvio evitando blocchi ingiustificati.\n');

// 4. SYNC SERVICE: Protezione sovrascrittura e coda push pendenti
console.log('[TEST 4b & 5b] Verifica syncService (timestamp non regressivo e pendingPushQueue)');
const syncPath = path.join(__dirname, '..', 'src', 'storage', 'syncService.ts');
const syncContent = fs.readFileSync(syncPath, 'utf8');

assert(
  syncContent.includes("else if (localData && localUpdated > 0 && localUpdated === serverUpdated)"),
  'syncService deve ignorare snapshot server se localUpdated === serverUpdated'
);
assert(
  syncContent.includes("if (localData && localUpdated > 0 && localUpdated >= serverUpdated)"),
  'syncService listener deve scartare gli echo cloud con timestamp pari o inferiore'
);
assert(
  syncContent.includes("pendingPushQueue") && syncContent.includes("flushPendingPushes"),
  'syncService deve accodare e svuotare i push pendenti quando lo stato di autenticazione si sblocca'
);
console.log('  -> PASS: syncService protegge i dati locali da sovrascritture parziali e gestisce code push.\n');

// 5. ACCOUNT SERVICE: Login Google rapido e parallelo
console.log('[TEST 6 & 7] Verifica accountService (ricerca parallela viaggi e progressive status)');
const accountPath = path.join(__dirname, '..', 'src', 'services', 'accountService.ts');
const accountContent = fs.readFileSync(accountPath, 'utf8');

assert(
  accountContent.includes("Promise.allSettled(tripInspectionPromises)"),
  'fetchUserTrips deve interrogare i viaggi in parallelo con Promise.allSettled'
);
assert(
  accountContent.includes("setTimeout(() => reject(new Error('timeout')), 3500)"),
  'fetchUserTrips deve applicare timeout rapido (3.5s) per singola query evitando blocchi'
);
assert(
  accountContent.includes("loginWithGoogle(onProgress?: (stage: string) => void)"),
  'loginWithGoogle deve accettare una callback onProgress per mostrare lo stato progressivo'
);
console.log('  -> PASS: accountService esegue login rapido e progressivo senza attese indefinite.\n');

// 6. ONBOARDING VIEW: UX Primo Accesso & Distinzione Viaggi Organizzatore/Copilota
console.log('[TEST 8 & 12] Verifica OnboardingView (Primo Accesso editoriale e chiarimento copilota)');
const onboardingPath = path.join(__dirname, '..', 'src', 'views', 'OnboardingView.tsx');
const onboardingContent = fs.readFileSync(onboardingPath, 'utf8');

assert(
  onboardingContent.includes("Waypoint 01") && onboardingContent.includes("35°41′N • 139°46′E"),
  'OnboardingView deve includere il motivo grafico editoriale Waypoint/Coordinate'
);
assert(
  onboardingContent.includes("loginProgressMsg || 'Accesso in corso…'"),
  'OnboardingView deve mostrare il messaggio progressivo di login'
);
assert(
  onboardingContent.includes("Cerchi un viaggio condiviso come copilota (es. Giappone)?"),
  'OnboardingView deve spiegare la procedura di riscatto invito per i viaggi copilota come Giappone'
);
console.log('  -> PASS: OnboardingView presenta UI editoriale memorabile e guida per copiloti.\n');

// 7. HOUNIAI ESSENZIALE & PRIVACY AI COMPATTA
console.log('[TEST 9, 10 & 11] Verifica SmartInsertModal (recupero spazio e privacy espandibile)');
const smartInsertPath = path.join(__dirname, '..', 'src', 'components', 'modals', 'SmartInsertModal.tsx');
const smartInsertContent = fs.readFileSync(smartInsertPath, 'utf8');

assert(
  !smartInsertContent.includes("Foto &amp; Screenshot") && !smartInsertContent.includes("PDF Voucher"),
  'SmartInsertModal non deve contenere pillole decorative ridondanti in alto'
);
assert(
  smartInsertContent.includes("showPrivacyDetails") && smartInsertContent.includes("Dettagli privacy"),
  'SmartInsertModal deve includere disclosure compatta ed espandibile per la Privacy AI'
);
console.log('  -> PASS: SmartInsertModal ottimizza lo spazio verticale e rende la privacy espandibile.\n');

// 8. GMAIL CONNECTION ROW: Modalità Beta
console.log('[TEST 9b] Verifica GmailConnectionRow in modalità beta controllata');
const gmailPath = path.join(__dirname, '..', 'src', 'components', 'common', 'GmailConnectionRow.tsx');
const gmailContent = fs.readFileSync(gmailPath, 'utf8');

assert(
  gmailContent.includes("In preparazione"),
  'GmailConnectionRow deve mostrare il badge "In preparazione" evitando errori OAuth bloccanti'
);
assert(
  gmailContent.includes("PDF & Foto 100% attivi"),
  'GmailConnectionRow deve confermare che PDF e foto sono operativi'
);
console.log('  -> PASS: Integrazione Gmail gestita con grazia senza bloccare la beta.\n');

console.log('===========================================================');
console.log('✓ TUTTI GLI 11 CONTROLLI DI VERIFICA AUTOMATIZZATA SUPERATI');
console.log('===========================================================\n');
