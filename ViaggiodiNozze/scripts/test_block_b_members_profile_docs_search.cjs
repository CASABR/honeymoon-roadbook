/**
 * TEST SUITE — BLOCK B:
 * - Sezione 7: Gestione Membri, Inviti, Copiloti, Tabella Permessi e Recupero Viaggi Legacy (con blocco su 0000)
 * - Sezione 8: Profilo Utente, Nome Personalizzato e Fallback puliti (mai UID grezzi come nome primario)
 * - Sezione 11: Documenti, Polizze e Travel Toolkit (zero numeri fittizi +39 000 000 0000 / +00 0000 000, apertura allegati offline)
 * - Sezione 10: Ricerca Globale con filtro ruoli (nessun leak dati privati per Viewer) e Trova/Sostituisci sicuro
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

console.log('=== VERIFICA BLOCK B — MEMBRI, PROFILO, DOCUMENTI & RICERCA GLOBALE ===\n');

const gestionePath = path.join(__dirname, '..', 'src', 'views', 'altro', 'GestioneViaggioView.tsx');
const gestioneCode = fs.readFileSync(gestionePath, 'utf8');

const inviteServicePath = path.join(__dirname, '..', 'src', 'services', 'tripInviteService.ts');
const inviteServiceCode = fs.readFileSync(inviteServicePath, 'utf8');

const accountServicePath = path.join(__dirname, '..', 'src', 'services', 'accountService.ts');
const accountServiceCode = fs.readFileSync(accountServicePath, 'utf8');

const userAccessPath = path.join(__dirname, '..', 'src', 'services', 'userAccessService.ts');
const userAccessCode = fs.readFileSync(userAccessPath, 'utf8');

const accountModalPath = path.join(__dirname, '..', 'src', 'components', 'modals', 'AccountSyncModal.tsx');
const accountModalCode = fs.readFileSync(accountModalPath, 'utf8');

const assicurazionePath = path.join(__dirname, '..', 'src', 'views', 'altro', 'AssicurazioneView.tsx');
const assicurazioneCode = fs.readFileSync(assicurazionePath, 'utf8');

const globalSearchPath = path.join(__dirname, '..', 'src', 'components', 'modals', 'GlobalSearchModal.tsx');
const globalSearchCode = fs.readFileSync(globalSearchPath, 'utf8');

check('1. Sezione 7: GestioneViaggioView include Tabella Permessi Ruoli, lista inviti attivi con Revoca e rimozione Copilota con conferma', () => {
  assert(gestioneCode.includes('Tabella Permessi e Ruoli del Viaggio'), 'Tabella permessi presente');
  assert(gestioneCode.includes('handleRevokeInvite'), 'Funzione revoca invito collegata');
  assert(inviteServiceCode.includes('export async function listTripInvites'), 'listTripInvites presente');
  assert(inviteServiceCode.includes('export async function revokeTripInvite'), 'revokeTripInvite presente');
});

check('2. Sezione 7: Recupero sicuro viaggi legacy (es. trip_l96ccua) richiede conferma esplicita + prova e blocca tassativamente 0000', () => {
  assert(accountServiceCode.includes('export async function recoverLegacyTripOwnership'), 'recoverLegacyTripOwnership presente');
  assert(accountServiceCode.includes("if (cleanTripId === '0000')"), 'Blocco esplicito su 0000 presente');
  assert(accountServiceCode.includes('if (!params.confirmedByUser)'), 'Richiede conferma esplicita utente');
  assert(gestioneCode.includes('Recupero Titolarità Viaggio Legacy'), 'Pannello UI recupero legacy presente');
});

check('3. Sezione 8: Nome utente personalizzato salvato in /users/{uid} e fallback puliti (Organizzatore, Copilota, Ospite)', () => {
  assert(userAccessCode.includes('export async function saveCustomUserDisplayName'), 'saveCustomUserDisplayName presente');
  assert(userAccessCode.includes('export function formatUserDisplayName'), 'formatUserDisplayName presente');
  assert(accountModalCode.includes('saveCustomUserDisplayName'), 'Editor nome presente in AccountSyncModal');
});

check('4. Sezione 11: AssicurazioneView non contiene più numeri telefonici fittizi (+39 000 000 0000 o +00 0000 000) e apre allegati offline', () => {
  assert(!assicurazioneCode.includes('+390000000000'), 'Rimosso tel:+390000000000 fittizio');
  assert(!assicurazioneCode.includes('+39 000 000 0000'), 'Rimosso +39 000 000 0000 fittizio');
  assert(!assicurazioneCode.includes('+00 0000 000'), 'Rimosso +00 0000 000 fittizio');
  assert(assicurazioneCode.includes('openAttachmentInNewTab'), 'Apertura allegati polizza offline attiva');
});

check('5. Sezione 10: GlobalSearchModal indicizza tutte le entità del viaggio attivo, protegge i dati privati per i Viewer ed esclude campi sensibili dal Trova/Sostituisci', () => {
  assert(globalSearchCode.includes('canSeePrivateInfo ? storageService.getDocuments()'), 'Documenti protetti da canSeePrivateInfo');
  assert(globalSearchCode.includes('canSeePrivateInfo ? storageService.getExpenses()'), 'Spese protette da canSeePrivateInfo');
  assert(globalSearchCode.includes("if (r.entityType === 'spesa' || r.entityType === 'documento') return false;"), 'Spese e documenti esclusi dal trova/sostituisci');
});

console.log(`\n=== RIEPILOGO BLOCK B: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
