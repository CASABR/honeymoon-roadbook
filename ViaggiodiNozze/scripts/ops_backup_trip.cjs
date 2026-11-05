/**
 * HOUNIGO — OPS: SCRIPT BACKUP COMPLETO VIAGGIO (SPARK-COMPATIBLE)
 * 
 * Esegue il backup completo di un viaggio e di tutte le relative sottocollezioni
 * da Firestore, calcola l'hash SHA-256 e lo salva in una directory sicura.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { Firestore } = require('@google-cloud/firestore');
const { OAuth2Client } = require('google-auth-library');

const ALL_SUBCOLLECTIONS = [
  'alloggi', 'trasporti', 'attivita', 'tappe', 'ristoranti', 'shopping',
  'bagagli', 'giorni', 'settings', 'locks', 'devices', 'members',
  'documenti', 'spese', 'note', 'private_credentials', 'invites', 'inviteTokens'
];

const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  return defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

const tripId = getArg('--tripId', '0000');
const isExecute = hasFlag('--execute') || hasFlag('--apply');
const isDryRun = !isExecute;
const keyPathArg = getArg('--key', null);

// Risoluzione radice git reale per garantire che il backup sia FUORI dal repo
function getRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return path.resolve(process.cwd(), '..');
  }
}
const repoRoot = getRepoRoot();
const defaultExternalDir = path.resolve(repoRoot, '..', 'hounigo_backups');
const outDir = path.resolve(getArg('--out-dir', defaultExternalDir));

// Controllo di sicurezza: outDir NON deve trovarsi all'interno di repoRoot
const relPath = path.relative(repoRoot, outDir);
if (!relPath.startsWith('..') && !path.isAbsolute(relPath) && relPath !== '') {
  console.error(`❌ ERRORE CRITICO DI SICUREZZA: La cartella di backup (${outDir})`);
  console.error(`risulta all'interno del repository Git (${repoRoot})!`);
  console.error(`I backup devono essere salvati rigorosamente FUORI dal repository.`);
  process.exit(1);
}

console.log('========================================================================');
console.log(`HOUNIGO — BACKUP OPERATIVO VIAGGIO [${tripId}]`);
console.log('========================================================================');
console.log(`Git Top-Level:       ${repoRoot}`);
console.log(`Destinazione backup: ${outDir} (ESTERNA AL REPO)`);
console.log(`Modalità:            ${isDryRun ? '🔍 DRY-RUN' : '💾 EXECUTE'}`);
console.log('------------------------------------------------------------------------');

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
    path.resolve(process.cwd(), '..', 'serviceAccountKey.json'),
    path.resolve(repoRoot, 'serviceAccountKey.json')
  ].filter(Boolean);

  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      try {
        const keyData = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (keyData.project_id === 'app-viaggio-di-nozze') {
          cred = cert(keyData);
          console.log(`[Firebase] Credenziale caricata da: ${p} (Target: app-viaggio-di-nozze)`);
          break;
        } else {
          console.log(`[Firebase] Ignorata chiave ${path.basename(p)}: appartiene a '${keyData.project_id}', non a 'app-viaggio-di-nozze'`);
        }
      } catch (e) {
        console.warn(`[Firebase] Impossibile caricare credenziale da ${p}: ${e.message}`);
      }
    }
  }

  if (cred) {
    initializeApp({ credential: cred, projectId: 'app-viaggio-di-nozze' });
    return getFirestore();
  }

  // Fallback autorizzato: credenziali Firebase CLI per app-viaggio-di-nozze
  const fbConfigPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (fs.existsSync(fbConfigPath)) {
    try {
      const fbConfig = JSON.parse(fs.readFileSync(fbConfigPath, 'utf8'));
      if (fbConfig.tokens && fbConfig.tokens.access_token) {
        console.log(`[Firebase] Autenticato con credenziale Firebase CLI: ${fbConfig.user?.email || 'Admin'} (Target: app-viaggio-di-nozze)`);
        const authClient = new OAuth2Client();
        authClient.setCredentials({ access_token: fbConfig.tokens.access_token });
        return new Firestore({
          projectId: 'app-viaggio-di-nozze',
          authClient
        });
      }
    } catch (e) {
      console.warn(`[Firebase] Impossibile leggere token CLI da ${fbConfigPath}: ${e.message}`);
    }
  }

  try {
    initializeApp({ projectId: 'app-viaggio-di-nozze' });
    console.log('[Firebase] Inizializzato con Application Default Credentials');
    return getFirestore();
  } catch (e) {
    console.error('❌ ERRORE: Nessuna credenziale Firebase valida trovata per app-viaggio-di-nozze.');
    process.exit(1);
  }
}

async function runBackup() {
  const db = initFirebase();
  const tripRef = db.collection('trips').doc(tripId);

  const tripSnap = await tripRef.get();
  if (!tripSnap.exists) {
    console.error(`❌ ERRORE: Il viaggio '${tripId}' non esiste in Firestore!`);
    process.exit(1);
  }

  const tripData = tripSnap.data();
  console.log(`Viaggio trovato: "${tripData.name || tripData.title || tripId}"`);

  const subcollectionsData = {};
  const stats = { tripId, totalSubcollections: 0, totalDocuments: 0, countsBySubcollection: {} };

  for (const subcol of ALL_SUBCOLLECTIONS) {
    const snap = await tripRef.collection(subcol).get();
    const docs = {};
    snap.forEach(doc => { docs[doc.id] = doc.data(); });
    const count = snap.size;
    stats.countsBySubcollection[subcol] = count;
    if (count > 0) {
      subcollectionsData[subcol] = docs;
      stats.totalSubcollections++;
      stats.totalDocuments += count;
      console.log(` - ${subcol.padEnd(20)}: ${count} documenti`);
    }
  }

  console.log(`Totale documenti censiti: ${stats.totalDocuments}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPayload = {
    metadata: { version: '1.0.0', system: 'HOUNIGO_P0_BACKUP', tripId, exportedAt: new Date().toISOString(), stats },
    tripDoc: tripData,
    subcollections: subcollectionsData
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);
  const sha256Hash = crypto.createHash('sha256').update(jsonString, 'utf8').digest('hex');
  console.log(`Checksum SHA-256: ${sha256Hash}`);

  if (isDryRun) {
    console.log('\n✅ DRY-RUN COMPLETATO. Nessun file salvato.');
    return;
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const filenameBase = `backup_${tripId}_${timestamp}`;
  const jsonPath = path.join(outDir, `${filenameBase}.json`);
  const shaPath = path.join(outDir, `${filenameBase}.json.sha256`);

  fs.writeFileSync(jsonPath, jsonString, 'utf8');
  fs.writeFileSync(shaPath, `${sha256Hash}  ${path.basename(jsonPath)}\n`, 'utf8');

  const writtenData = fs.readFileSync(jsonPath, 'utf8');
  const verifyHash = crypto.createHash('sha256').update(writtenData, 'utf8').digest('hex');
  if (verifyHash !== sha256Hash) {
    console.error('❌ ERRORE: Checksum post-scrittura non valido!');
    process.exit(1);
  }

  console.log('\n🎉 BACKUP COMPLETATO E VERIFICATO');
  console.log(`Percorso: ${jsonPath}`);
  console.log(`SHA-256:  ${sha256Hash}`);
}

runBackup().catch(err => {
  console.error('❌ ERRORE FATALE BACKUP:', err);
  process.exit(1);
});
