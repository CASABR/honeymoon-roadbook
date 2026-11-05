/**
 * HOUNIGO — OPS: SCRIPT BACKUP COMPLETO VIAGGIO (SPARK-COMPATIBLE)
 * 
 * Esegue il backup completo di un viaggio e di tutte le relative sottocollezioni
 * da Firestore, calcola l'hash SHA-256 e lo salva in una directory sicura.
 * 
 * CARATTERISTICHE DI SICUREZZA:
 * - Default DRY-RUN (nessuna scrittura su disco senza flag --execute)
 * - Compatibile 100% con Firebase Spark (letture documentali standard senza Cloud Functions)
 * - Nessuna credenziale hardcoded (usa GOOGLE_APPLICATION_CREDENTIALS, --key <path> o serviceAccountKey.json locale)
 * - Output predefinito in cartella ESTERNA al repository git
 * - Calcolo e verifica automatica SHA-256
 * 
 * USO:
 *   node scripts/ops_backup_trip.cjs --tripId 0000                      (DRY-RUN)
 *   node scripts/ops_backup_trip.cjs --tripId 0000 --execute            (SALVATAGGIO REALE)
 *   node scripts/ops_backup_trip.cjs --tripId 0000 --out-dir C:/backups --execute
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Sottocollezioni censite per un viaggio HOUNIGO
const ALL_SUBCOLLECTIONS = [
  'alloggi',
  'trasporti',
  'attivita',
  'tappe',
  'ristoranti',
  'shopping',
  'bagagli',
  'giorni',
  'settings',
  'locks',
  'devices',
  'members',
  'documenti',
  'spese',
  'note',
  'private_credentials',
  'invites',
  'inviteTokens'
];

// Parsing argomenti CLI
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

// Cartella di output predefinita FUORI dal repository git
const defaultExternalDir = path.resolve(process.cwd(), '..', 'hounigo_backups');
const outDir = path.resolve(getArg('--out-dir', defaultExternalDir));

console.log('========================================================================');
console.log(`HOUNIGO — BACKUP OPERATIVO VIAGGIO [${tripId}]`);
console.log('========================================================================');
console.log(`Modalità: ${isDryRun ? '🔍 DRY-RUN (simulazione sola lettura)' : '💾 EXECUTE (salvataggio effettivo)'}`);
console.log(`Destinazione backup: ${outDir}`);
console.log('------------------------------------------------------------------------');

// Inizializzazione Firebase Admin
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
      console.error('Fornisci una credenziale con:');
      console.error('  --key /percorso/a/serviceAccountKey.json');
      console.error('  oppure imposta la variabile GOOGLE_APPLICATION_CREDENTIALS');
      process.exit(1);
    }
  }

  return getFirestore();
}

async function runBackup() {
  const db = initFirebase();
  const tripRef = db.collection('trips').doc(tripId);

  console.log(`\n1. Verifica esistenza viaggio ${tripId}...`);
  const tripSnap = await tripRef.get();
  if (!tripSnap.exists) {
    console.error(`❌ ERRORE: Il viaggio '${tripId}' non esiste in Firestore!`);
    process.exit(1);
  }

  const tripData = tripSnap.data();
  console.log(`   Viaggio trovato: "${tripData.name || tripData.title || tripId}" (Owner: ${tripData.ownerUid || tripData.ownerId})`);

  console.log(`\n2. Scansione di tutte le sottocollezioni (${ALL_SUBCOLLECTIONS.length})...`);
  const subcollectionsData = {};
  const stats = {
    tripId,
    totalSubcollections: 0,
    totalDocuments: 0,
    countsBySubcollection: {}
  };

  for (const subcol of ALL_SUBCOLLECTIONS) {
    const colRef = tripRef.collection(subcol);
    const snap = await colRef.get();
    const docs = {};
    snap.forEach(doc => {
      docs[doc.id] = doc.data();
    });

    const count = snap.size;
    stats.countsBySubcollection[subcol] = count;
    if (count > 0) {
      subcollectionsData[subcol] = docs;
      stats.totalSubcollections++;
      stats.totalDocuments += count;
      console.log(`   - ${subcol.padEnd(20)}: ${count} documenti`);
    } else {
      console.log(`   - ${subcol.padEnd(20)}: (vuota)`);
    }
  }

  console.log(`\nTotale documenti censiti: ${stats.totalDocuments}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPayload = {
    metadata: {
      version: '1.0.0',
      system: 'HOUNIGO_P0_BACKUP',
      tripId,
      exportedAt: new Date().toISOString(),
      stats
    },
    tripDoc: tripData,
    subcollections: subcollectionsData
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);
  const sha256Hash = crypto.createHash('sha256').update(jsonString, 'utf8').digest('hex');

  console.log(`\nChecksum SHA-256 calcolato: ${sha256Hash}`);

  if (isDryRun) {
    console.log('\n========================================================================');
    console.log('✅ DRY-RUN COMPLETATO CON SUCCESSO');
    console.log('Nessun file è stato salvato su disco.');
    console.log('Per eseguire il salvataggio effettivo del backup, esegui:');
    console.log(`  node scripts/ops_backup_trip.cjs --tripId ${tripId} --execute`);
    console.log('========================================================================\n');
    return;
  }

  // Creazione cartella se non esiste
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`\nCreata directory di backup: ${outDir}`);
  }

  const filenameBase = `backup_${tripId}_${timestamp}`;
  const jsonPath = path.join(outDir, `${filenameBase}.json`);
  const shaPath = path.join(outDir, `${filenameBase}.json.sha256`);

  fs.writeFileSync(jsonPath, jsonString, 'utf8');
  fs.writeFileSync(shaPath, `${sha256Hash}  ${path.basename(jsonPath)}\n`, 'utf8');

  // Verifica immediata del file scritto
  const writtenData = fs.readFileSync(jsonPath, 'utf8');
  const verifyHash = crypto.createHash('sha256').update(writtenData, 'utf8').digest('hex');

  if (verifyHash !== sha256Hash) {
    console.error('❌ ERRORE CRITICO: Il file scritto su disco non corrisponde al checksum calcolato!');
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log('🎉 BACKUP COMPLETATO E VERIFICATO');
  console.log(`File JSON:    ${jsonPath}`);
  console.log(`File SHA-256: ${shaPath}`);
  console.log(`Dimensione:   ${(Buffer.byteLength(jsonString, 'utf8') / 1024).toFixed(2)} KB`);
  console.log(`SHA-256:      ${sha256Hash}`);
  console.log('========================================================================\n');
}

runBackup().catch(err => {
  console.error('❌ ERRORE DURANTE IL BACKUP:', err);
  process.exit(1);
});
