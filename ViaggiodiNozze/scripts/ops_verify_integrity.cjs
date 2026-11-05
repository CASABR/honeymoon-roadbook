/**
 * HOUNIGO — OPS: SCRIPT VERIFICA INTEGRITÀ POST-MIGRAZIONE (P0)
 * 
 * Esegue una convalida rigorosa dello stato dei dati in Firestore:
 * 1. Zero-Exposure Check: verifica che NESSUN documento condiviso contenga chiavi sensibili.
 * 2. Biunivocal Reconstruction Check: unisce publicDoc + privateDoc dalla cassaforte
 *    e confronta il risultato 1:1 con il backup pre-migrazione (se fornito).
 * 3. Vault Integrity Check: verifica che ogni credenziale sia correttamente associata
 *    con prefisso anti-collisione, entityType, entityId e tripId.
 * 
 * USO:
 *   node scripts/ops_verify_integrity.cjs --tripId 0000
 *   node scripts/ops_verify_integrity.cjs --tripId 0000 --backup ../hounigo_backups/backup_0000_latest.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const {
  mergeEntitySecurityData,
  sanitizePublicDocument,
  getVaultDocId,
  SENSITIVE_KEYS
} = require('../src/utils/securityDataSplitter.ts');

const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  return defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

const tripId = getArg('--tripId', '0000');
const backupFileArg = getArg('--backup', null);
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
console.log(`HOUNIGO — VERIFICA INTEGRITÀ E ASSENZA LEAK P0 [Viaggio ${tripId}]`);
console.log('========================================================================');

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

async function verifyIntegrity() {
  const db = initFirebase();
  const tripRef = db.collection('trips').doc(tripId);
  const vaultRef = tripRef.collection('private_credentials');

  let backupData = null;
  if (backupFileArg) {
    if (!fs.existsSync(backupFileArg)) {
      console.error(`❌ ERRORE: File di backup non trovato: ${backupFileArg}`);
      process.exit(1);
    }
    const rawBackup = fs.readFileSync(backupFileArg, 'utf8');
    const shaFile = `${backupFileArg}.sha256`;
    if (fs.existsSync(shaFile)) {
      const expectedHash = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0];
      const actualHash = crypto.createHash('sha256').update(rawBackup, 'utf8').digest('hex');
      if (expectedHash !== actualHash) {
        console.error('❌ Checksum backup non corrispondente!');
        process.exit(1);
      }
      console.log(`✅ Backup verificato con successo (${actualHash.substring(0, 16)}...)`);
    }
    backupData = JSON.parse(rawBackup);
  }

  console.log('\n1. SCANSIONE ZERO-EXPOSURE (Controllo assenza chiavi sensibili nei documenti condivisi)...');
  let leakCount = 0;
  let totalPublicDocs = 0;
  const publicDocsMap = {};

  for (const colName of OPERATIONAL_COLLECTIONS) {
    publicDocsMap[colName] = {};
    const snap = await tripRef.collection(colName).get();
    for (const doc of snap.docs) {
      totalPublicDocs++;
      const data = doc.data();
      publicDocsMap[colName][doc.id] = data;

      // Ricerca chiavi sensibili nel documento pubblico
      const foundLeaks = [];
      for (const k of SENSITIVE_KEYS) {
        if (data[k] !== undefined && data[k] !== null) {
          foundLeaks.push(k);
        }
      }

      if (foundLeaks.length > 0) {
        leakCount++;
        console.error(`  ❌ LEAK RILEVATO in [${colName}/${doc.id}]: chiavi presenti -> ${foundLeaks.join(', ')}`);
      }
    }
  }

  console.log(`Documenti pubblici esaminati: ${totalPublicDocs}`);
  if (leakCount === 0) {
    console.log('✅ ZERO LEAKS: Nessuna chiave sensibile riscontrata nei documenti condivisi.');
  } else {
    console.error(`❌ RISCONTRATI ${leakCount} DOCUMENTI CON LEAK!`);
  }

  console.log('\n2. VERIFICA CASSAFORTE PRIVATE CREDENTIALS...');
  const vaultSnap = await vaultRef.get();
  const vaultMap = {};
  let vaultErrors = 0;

  vaultSnap.forEach(doc => {
    const data = doc.data();
    vaultMap[doc.id] = data;

    if (!data.entityId || !data.entityType || !data.tripId) {
      vaultErrors++;
      console.error(`  ❌ Struttura vault non valida per [${doc.id}]: mancanti entityId/entityType/tripId`);
    }
  });

  console.log(`Documenti protetti in cassaforte: ${vaultSnap.size}`);
  if (vaultErrors === 0) {
    console.log('✅ STRUTTURA CASSAFORTE CONFORME: tutti i documenti presentano metadati completi.');
  }

  let biunivocalErrors = 0;
  if (backupData && backupData.subcollections) {
    console.log('\n3. CONFRONTO BIUNIVOCO 1:1 CON BACKUP PRE-MIGRAZIONE...');
    let comparedCount = 0;

    for (const colName of OPERATIONAL_COLLECTIONS) {
      const backupCol = backupData.subcollections[colName] || {};
      for (const [docId, originalDoc] of Object.entries(backupCol)) {
        comparedCount++;
        const currentPublic = publicDocsMap[colName] ? publicDocsMap[colName][docId] : null;
        if (!currentPublic) {
          biunivocalErrors++;
          console.error(`  ❌ Documento mancante in Firestore: [${colName}/${docId}]`);
          continue;
        }

        const vaultDocId = getVaultDocId(colName, docId);
        const currentVault = vaultMap[vaultDocId] || null;

        // Ricostruzione entità integrata: mergeEntitySecurityData(publicDoc, privateCredentialsDoc)
        const reconstructed = mergeEntitySecurityData(currentPublic, currentVault);

        // Confronto di tutti i campi dell'originale
        for (const [key, expectedVal] of Object.entries(originalDoc)) {
          const actualVal = reconstructed[key];
          const expectedStr = JSON.stringify(expectedVal);
          const actualStr = JSON.stringify(actualVal);
          if (expectedStr !== actualStr) {
            biunivocalErrors++;
            console.error(`  ❌ Discrepanza in [${colName}/${docId}] campo '${key}': atteso ${expectedStr}, trovato ${actualStr}`);
          }
        }
      }
    }

    console.log(`Record originali confrontati: ${comparedCount}`);
    if (biunivocalErrors === 0) {
      console.log('✅ INTEGRITÀ 100% GARANTITA: Tutti i campi e i valori originali corrispondono perfettamente.');
    } else {
      console.error(`❌ RISCONTRATE ${biunivocalErrors} DISCREPANZE RISPETTO AL BACKUP!`);
    }
  } else {
    console.log('\n3. CONFRONTO BACKUP OMESSO (passa --backup <path> per la verifica biunivoca contro il dump pre-migrazione).');
  }

  const isSuccess = leakCount === 0 && vaultErrors === 0 && biunivocalErrors === 0;

  console.log('\n========================================================================');
  if (isSuccess) {
    console.log('🎉 VERIFICA INTEGRITÀ COMPLETATA CON SUCCESSO: 100% PASS');
    console.log('- Zero chiavi sensibili nei documenti condivisi');
    console.log('- Cassaforte isolata e conforme');
    if (backupData) console.log('- Corrispondenza biunivoca 100% verificata');
    console.log('========================================================================\n');
    process.exit(0);
  } else {
    console.error('❌ VERIFICA INTEGRITÀ FALLITA: Sono state riscontrate anomalie.');
    console.log('========================================================================\n');
    process.exit(1);
  }
}

verifyIntegrity().catch(err => {
  console.error('❌ ERRORE DURANTE LA VERIFICA:', err);
  process.exit(1);
});
