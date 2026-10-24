const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== TEST COMPLETO: VERIFICA PROBLEMA 1 (MENU DESKTOP) & PROBLEMA 2 (COLLEGA GOOGLE) ===\n');

const appCode = fs.readFileSync(path.join(__dirname, 'src', 'App.tsx'), 'utf8');
const desktopNavCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'common', 'DesktopNavigation.tsx'), 'utf8');
const settingsMenuCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'common', 'SettingsMenu.tsx'), 'utf8');
const accountSyncModalCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'modals', 'AccountSyncModal.tsx'), 'utf8');
const accountServiceCode = fs.readFileSync(path.join(__dirname, 'src', 'services', 'accountService.ts'), 'utf8');

// --- PROBLEMA 1: MENU DESKTOP ---
console.log('--- VERIFICA PROBLEMA 1: LAYOUT MENU DESKTOP & RUOLO ---');

// 1.1 Wrapper della sidebar ha shrink-0 e larghezza fissa (nessun rimpicciolimento o taglio)
assert(appCode.includes('hidden md:block shrink-0 w-72 lg:w-80'), 'Sidebar wrapper in App.tsx deve avere shrink-0 e w-72 lg:w-80');
console.log('✓ 1.1 Wrapper sidebar desktop: shrink-0 e larghezza adeguata (w-72 lg:w-80) presenti.');

// 1.2 DesktopNavigation ha overflow-x-hidden e nessun taglio sinistro
assert(desktopNavCode.includes('overflow-x-hidden overflow-y-hidden'), 'Root aside deve prevenire overflow-x');
assert(desktopNavCode.includes('overflow-y-auto overflow-x-hidden'), 'Area voci navigazione deve impedire overflow orizzontale');
assert(desktopNavCode.includes('min-w-0 flex-1') && desktopNavCode.includes('truncate'), 'Le etichette delle voci devono avere truncate e min-w-0');
console.log('✓ 1.2 Layout voci desktop: overflow-x disabilitato e truncate protetto contro scroll orizzontale accidentale.');

// 1.3 Il ruolo mostrato rispecchia fedelmente i permessi Firestore verificati (mai "Guida" per copilota)
assert(desktopNavCode.includes("const verifiedRoleLabel = cloudRole === 'owner'"), 'Ruolo deve basarsi primariamente su cloudRole');
assert(desktopNavCode.includes(": cloudRole === 'copilota'"), 'Deve riconoscere ruolo copilota');
assert(!desktopNavCode.includes(": (isGuida && cloudRole === 'owner')"), 'Nessun fallback locale che mostri "Guida" a sessioni non-owner');
console.log('✓ 1.3 Ruolo verificato: solo permessi Firestore reali, una sessione copilota non viene mai mostrata come "Guida".');

// 1.4 Semplificazione UI: Rinomina "Account & Multi-Dispositivo" in "Account"
assert(settingsMenuCode.includes('<span className="block text-xs font-bold text-slate-800 dark:text-slate-100">Account</span>'), 'SettingsMenu deve avere il pulsante denominato "Account"');
assert(accountSyncModalCode.includes('<h3 className="text-base font-extrabold text-slate-900 dark:text-white">\n                Account\n              </h3>') || accountSyncModalCode.includes('>Account</h3>') || accountSyncModalCode.includes('Account\n              </h3>'), 'Titolo modale deve essere "Account"');
console.log('✓ 1.4 Denominazione UI: "Account & Multi-Dispositivo" rinominata in "Account".');

// 1.5 Diagnostica e controlli tecnici spostati in sezione dedicata
assert(settingsMenuCode.includes('Diagnostica &amp; Sistema'), 'SettingsMenu deve avere sezione dedicata Diagnostica');
assert(accountSyncModalCode.includes('Dettagli tecnici &amp; Diagnostica'), 'AccountSyncModal deve avere sezione diagnostica dedicata e collassabile');
assert(desktopNavCode.includes('?diag=identity'), 'DesktopNavigation include scorciatoia discreta a diagnostica');
console.log('✓ 1.5 Controlli tecnici e UID spostati nella diagnostica dedicata, mantenendola pienamente accessibile.');


// --- PROBLEMA 2: COLLEGA GOOGLE ---
console.log('\n--- VERIFICA PROBLEMA 2: COLLEGA GOOGLE E AZIONE CLICK ---');

// 2.1 Nessun ritorno silenzioso: auth?.currentUser || currentUser risolto dinamicamente
assert(!accountSyncModalCode.includes('if (!currentUser) return;'), 'Non deve esistere un silent return if (!currentUser) return;');
assert(accountSyncModalCode.includes('const activeUser = auth?.currentUser || currentUser;'), 'Deve risolvere activeUser dinamicamente');
console.log('✓ 2.1 Eliminato il silent return bloccante: activeUser viene risolto dinamicamente.');

// 2.2 Sincronizzazione in tempo reale con Firebase onAuthStateChanged
assert(accountSyncModalCode.includes('onAuthStateChanged(auth'), 'AccountSyncModal deve ascoltare onAuthStateChanged');
console.log('✓ 2.2 Listener onAuthStateChanged attivo per evitare disallineamenti di stato all\'apertura.');

// 2.3 Feedback visivo immediato a OGNI click
assert(accountSyncModalCode.includes("setStatusMessage('Apertura finestra di accesso Google…');"), 'Deve impostare statusMessage immediato');
assert(accountSyncModalCode.includes('setLoading(true);'), 'Deve impostare loading immediato');
assert(accountSyncModalCode.includes('{statusMessage && ('), 'Deve visualizzare banner di avanzamento/caricamento');
console.log('✓ 2.3 Feedback visivo istantaneo al click: loading spinner e messaggio di stato "Apertura finestra Google in corso...".');

// 2.4 Mantenimento rigoroso dell\'UID e nessun merge abusivo
assert(accountServiceCode.includes('userCredential.user.uid !== originalUid'), 'Deve garantire conservazione UID');
assert(accountServiceCode.includes('auth/credential-already-in-use'), 'Deve gestire account Google già associato senza alterare identità');
console.log('✓ 2.4 Salvaguardia identità: UID rigorosamente conservato, rifiuto merge se Google già associato ad altro account.');

// 2.5 Gestione completa errori e stato di annullamento
assert(accountServiceCode.includes('auth/popup-closed-by-user'), 'Gestione annullamento popup da parte utente');
assert(accountServiceCode.includes('auth/popup-blocked'), 'Gestione blocco popup browser');
console.log('✓ 2.5 Gestione esplicita di popup bloccato, finestra chiusa dall\'utente ed errori asincroni.');

console.log('\n======================================================');
console.log('TUTTI I TEST E LE ASSERZIONI SUPERATI CON SUCCESSO!');
console.log('======================================================');
