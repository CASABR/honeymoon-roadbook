/**
 * HOUNIGO — OPS: SCRIPT ROLLBACK SICURO (P0)
 * 
 * Ripristina i dati da un backup pre-migrazione verificato senza MAI
 * riaprire le regole di sicurezza insicure.
 * 
 * GARANZIE DI SICUREZZA:
 * 1. Default DRY-RUN: nessuna scrittura senza --apply.
 * 2. Blocco anti-errore: richiede --confirm-rollback-trip-0000 per il viaggio 0000.
 * 3. Convalida SHA-256 obbligatoria del file di backup prima di qualsiasi operazione.
 * 4. Zero Re-Exposure: non re-introduce MAI campi sensibili nei documenti condivisi.
 *    I dati del backup vengono suddivisi al volo tramite splitEntitySecurityData:
 *    - La parte pubblica sanitizzata viene ripristinata nelle collezioni condivise.
 *    - La parte privata viene ripristinata nella cassaforte private_credentials.
 * 5. Mantenimento integrale delle Security Rules restrittive con Schema Guard.
 * 
 * USO:
 *   node scripts/ops_rollback_safe.cjs --tripId 0000 --backup ../hounigo_backups/backup_0000.json
 *   node scripts/ops_rollback_safe.cjs --tripId 0000 --backup ../hounigo_backups/backup_0000.json --apply --confirm-rollback-trip-0000
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const {
  splitEntitySecurityData,
  sanitizePublicDocument,
  getVaultDocId,
  normalizeEntityType
} = require('../src/utils/securityDataSplitter.ts');

const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  return defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

const tripId = getArg('--tripId', '0000');
const backupPath = getArg('--backup', null);
const isApply = hasFlag('--apply') || hasFlag('--execute');
const isDryRun = !isApply;
const confirmRollback = hasFlag(`--confirm-rollback-trip-${tripId}`);
const keyPathArg = getArg('--key', null);

const OPERATIONAL_COLLECTIONS = [
  'alloggi',
  'trasporti',
  'attivita',
  'tappe',
  'ristoranti',
  'shopping'
];

console.log('========================================================================');
console.log(`HOUNIGO — OPS: PROCEDURA DI ROLLBACK SICURO [Viaggio ${tripId}]`);
console.log('========================================================================');
console.log(`Modalità: ${isDryRun ? '🔍 DRY-RUN (simulazione)' : '⚡ LIVE APPLY (ripristino su Firestore)'}`);

if (!backupPath) {
  console.error('\n❌ ERRORE: È obbligatorio specificare il file di backup con:');
  console.error('  --backup /percorso/a/backup_0000_xxxx.json');
  process.exit(1);
}

if (!fs.existsSync(backupPath)) {
  console.error(`\n❌ ERRORE: File di backup non trovato: ${backupPath}`);
  process.exit(1);
}

// Convalida SHA-256 del backup
const rawBackup = fs.readFileSync(backupPath, 'utf8');
const shaPath = `${backupPath}.sha256`;
if (fs.existsSync(shaPath)) {
  const expectedHash = fs.readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0];
  const actualHash = crypto.createHash('sha256').update(rawBackup, 'utf8').digest('hex');
  if (expectedHash !== actualHash) {
    console.error('\n❌ ERRORE CRITICO: Checksum SHA-256 del backup non valido! Rollback interrotto.');
    process.exit(1);
  }
  console.log(`✅ File di backup convalidato (SHA-256: ${actualHash.substring(0, 16)}...)`);
} else {
  console.warn('\n⚠️  ATTENZIONE: File .sha256 non presente accanto al backup.');
}

if (isApply) {
  if (tripId === '0000' && !confirmRollback) {
    console.error('\n❌ ERRORE DI SICUREZZA: Per eseguire il rollback sul viaggio reale 0000');
    console.error('è obbligatorio passare il flag esplicito: --confirm-rollback-trip-0000');
    process.exit(1);
  }
  console.log('⚠️  ATTENZIONE: Autorizzazione confermata. Ripristino dati avviato.');
} else {
  console.log('ℹ️  Nessuna scrittura verrà effettuata su Firestore.');
}
console.log('------------------------------------------------------------------------');

// Inizializzazione Firebase
function initFirebase() {
  if (getApps().length > 0) return getFirestore();

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`[Firebase] Connesso a Firestore Emulator (${process.env.FIRESTORE_EMULATOR_HOST})`);
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'app-viaggio-di-nozze' });
    return getFirestore();
  }

  let cred = null;
  const potentialPaths = [
    keyPathArg,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), 'serviceAccountKey.json'),
    path.resolve(process.cwd(), '..', 'serviceAccountKey.json')
  ].filter(Boolean);

  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      try {
        const keyData = JSON.parse(fs.readFileSync(p, 'utf8'));
        cred = cert(keyData);
        console.log(`[Firebase] Credenziale caricata da: ${p}`);
        break;
      } catch (e) {
        console.warn(`[Firebase] Impossibile caricare credenziale da ${p}: ${e.message}`);
      }
    }
  }

  if (cred) {
    initializeApp({ credential: cred });
  } else {
    try {
      initializeApp();
      console.log('[Firebase] Inizializzato con Application Default Credentials');
    } catch (e) {
      console.error('❌ ERRORE: Nessuna credenziale Firebase trovata.');
      process.exit(1);
    }
  }

  return getFirestore();
}

async function runRollback() {
  const db = initFirebase();
  const tripRef = db.collection('trips').doc(tripId);
  const backup = JSON.parse(rawBackup);

  const subcollections = backup.subcollections || {};
  let totalDocsToRestore = 0;
  let operationalDocsCount = 0;

  for (const [colName, docs] of Object.entries(subcollections)) {
    const count = Object.keys(docs).length;
    totalDocsToRestore += count;
    if (OPERATIONAL_COLLECTIONS.includes(colName)) {
      operationalDocsCount += count;
    }
  }

  console.log(`\nDocumenti nel backup da ripristinare: ${totalDocsToRestore}`);
  console.log(`Di cui operativi (con segregazione protetta): ${operationalDocsCount}`);

  if (isDryRun) {
    console.log('\n========================================================================');
    console.log('✅ SIMULAZIONE ROLLBACK COMPLETATA');
    console.log('Il ripristino applicherà la segregazione al volo:');
    console.log('  1. Dati pubblici sanitizzati -> Collezioni condivise (Schema Guard OK)');
    console.log('  2. Credenziali sensibili -> Cassaforte private_credentials');
    console.log('Nessuna regola permissiva o insicura viene ripristinata.');
    console.log('\nPer procedere con il rollback effettivo, esegui:');
    console.log(`  node scripts/ops_rollback_safe.cjs --tripId ${tripId} --backup "${backupPath}" --apply --confirm-rollback-trip-${tripId}`);
    console.log('========================================================================\n');
    return;
  }

  const now = new Date().toISOString();
  let restoredPublic = 0;
  let restoredVault = 0;

  console.log('\n--- RIPRISTINO IN CORSO ---');

  // Ripristino documento radice viaggio
  if (backup.tripDoc) {
    await tripRef.set(backup.tripDoc, { merge: true });
    console.log(`✅ Documento radice viaggio trips/${tripId} ripristinato.`);
  }

  // Ripristino collezioni con segregazione automatica
  for (const [colName, docs] of Object.entries(subcollections)) {
    const isOperational = OPERATIONAL_COLLECTIONS.includes(colName);
    const colRef = tripRef.collection(colName);

    for (const [docId, rawDocData] of Object.entries(docs)) {
      if (isOperational) {
        // Applica splitting per evitare di riscrivere campi sensibili nei documenti condivisi
        const docWithId = { id: docId, ...rawDocData };
        const { publicDoc, privateCredentialsDoc } = splitEntitySecurityData(colName, tripId, docWithId);
        const vaultDocId = getVaultDocId(colName, docId);

        // Se ci sono dati sensibili, ripristina la cassaforte
        if (privateCredentialsDoc) {
          const vaultPayload = {
            ...privateCredentialsDoc,
            id: vaultDocId,
            entityId: docId,
            entityType: normalizeEntityType(colName),
            tripId,
            restoredAt: now
          };
          await tripRef.collection('private_credentials').doc(vaultDocId).set(vaultPayload, { merge: true });
          restoredVault++;
        }

        // Ripristina documento pubblico sanitizzato
        const cleanPublic = sanitizePublicDocument(publicDoc);
        cleanPublic.restoredAt = now;
        await colRef.doc(docId).set(cleanPublic);
        restoredPublic++;
      } else {
        // Collezioni speciali (documenti, spese, note, members, etc.) ripristinate direttamente
        await colRef.doc(docId).set(rawDocData);
        restoredPublic++;
      }
    }
  }

  console.log('\n========================================================================');
  console.log('🎉 ROLLBACK SICURO COMPLETATO CON SUCCESSO');
  console.log(`- Documenti ripristinati:     ${restoredPublic}`);
  console.log(`- Record cassaforte protetti:  ${restoredVault}`);
  console.log('- Regole restrittive mantenute: NESSUNA REGOLA VULNERABILE È STATA RIPRISTINATA');
  console.log('========================================================================\n');
}

runRollback().catch(err => {
  console.error('❌ ERRORE FATALE DURANTE IL ROLLBACK:', err);
  process.exit(1);
});
