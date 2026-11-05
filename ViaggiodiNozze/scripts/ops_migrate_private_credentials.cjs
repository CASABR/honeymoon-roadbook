/**
 * HOUNIGO — OPS: SCRIPT MIGRAZIONE E SEGREGAZIONE CREDENZIALI (P0)
 * 
 * Trasferisce in modo atomico, idempotente e verificato i dati sensibili
 * dalle collezioni condivise alla cassaforte protetta /private_credentials/{vaultId}.
 * 
 * GARANZIE DI SICUREZZA:
 * 1. Default DRY-RUN: nessuna modifica se non specificato --apply.
 * 2. Blocco anti-errore: per il viaggio 0000 richiede esplicitamente --confirm-trip-0000.
 * 3. Idempotente e riprendibile: se interrotta, può essere rieseguita senza duplicazioni né perdite.
 * 4. Verifica record-by-record: la cancellazione dei dati sensibili dal documento pubblico
 *    avviene SOLO dopo aver accertato con lettura di ritorno che la cassaforte contiene
 *    tutti i campi sensibili integri.
 * 5. Sanitizzazione rigorosa: nessun dato privato rimane nel documento pubblico.
 * 
 * USO:
 *   node scripts/ops_migrate_private_credentials.cjs --tripId 0000                                 (DRY-RUN)
 *   node scripts/ops_migrate_private_credentials.cjs --tripId 0000 --apply --confirm-trip-0000    (MIGRAZIONE REALE)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Import delle utility di sicurezza e segregazione
const {
  splitEntitySecurityData,
  sanitizePublicDocument,
  getVaultDocId,
  normalizeEntityType,
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
const isApply = hasFlag('--apply') || hasFlag('--execute');
const isDryRun = !isApply;
const confirmTripFlag = hasFlag(`--confirm-trip-${tripId}`);
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
console.log(`HOUNIGO — MIGRAZIONE OPERATIVA SEGREGAZIONE P0 [Viaggio ${tripId}]`);
console.log('========================================================================');
console.log(`Modalità: ${isDryRun ? '🔍 DRY-RUN (simulazione sicura in sola lettura)' : '⚡ LIVE APPLY (scrittura su Firestore)'}`);

if (isApply) {
  if (tripId === '0000' && !confirmTripFlag) {
    console.error('\n❌ ERRORE DI SICUREZZA: Per applicare le modifiche al viaggio reale 0000');
    console.error('è obbligatorio passare il flag esplicito: --confirm-trip-0000');
    console.error('Esempio:');
    console.error('  node scripts/ops_migrate_private_credentials.cjs --tripId 0000 --apply --confirm-trip-0000');
    process.exit(1);
  }
  console.log('⚠️  ATTENZIONE: Autorizzazione confermata. Scritture reali abilitate.');
} else {
  console.log('ℹ️  Nessuna scrittura verrà effettuata su Firestore.');
}
console.log('------------------------------------------------------------------------');

// Verifica backup preventivo (se fornito)
if (backupFileArg) {
  console.log(`\nVerifica file di backup: ${backupFileArg}...`);
  if (!fs.existsSync(backupFileArg)) {
    console.error(`❌ ERRORE: File di backup non trovato: ${backupFileArg}`);
    process.exit(1);
  }
  const shaFile = `${backupFileArg}.sha256`;
  if (fs.existsSync(shaFile)) {
    const expectedHash = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0];
    const actualData = fs.readFileSync(backupFileArg, 'utf8');
    const actualHash = crypto.createHash('sha256').update(actualData, 'utf8').digest('hex');
    if (expectedHash !== actualHash) {
      console.error('❌ ERRORE: Checksum SHA-256 del backup non valido! Interruzione per sicurezza.');
      process.exit(1);
    }
    console.log(`✅ Backup convalidato con SHA-256: ${actualHash.substring(0, 16)}...`);
  } else {
    console.log('⚠️  File .sha256 non presente, backup letto senza verifica checksum.');
  }
}

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

async function runMigration() {
  const db = initFirebase();
  const tripRef = db.collection('trips').doc(tripId);
  const vaultColRef = tripRef.collection('private_credentials');

  const tripSnap = await tripRef.get();
  if (!tripSnap.exists) {
    console.error(`❌ ERRORE: Viaggio ${tripId} non trovato in Firestore.`);
    process.exit(1);
  }

  console.log(`\nInizio scansione collezioni per il viaggio ${tripId}...`);
  
  const stats = {
    scanned: 0,
    sensitiveFound: 0,
    alreadyMigrated: 0,
    migratedSuccess: 0,
    errors: 0
  };

  const migrationPlan = [];

  for (const colName of OPERATIONAL_COLLECTIONS) {
    const colRef = tripRef.collection(colName);
    const snap = await colRef.get();
    
    for (const doc of snap.docs) {
      stats.scanned++;
      const data = doc.data();
      const docId = doc.id;
      const docWithId = { id: docId, ...data };
      
      const { publicDoc, privateCredentialsDoc } = splitEntitySecurityData(colName, tripId, docWithId);
      const vaultDocId = getVaultDocId(colName, docId);

      if (privateCredentialsDoc) {
        const sensitiveKeys = SENSITIVE_KEYS.filter(k => privateCredentialsDoc[k] !== undefined);
        stats.sensitiveFound++;
        migrationPlan.push({
          collection: colName,
          docId,
          vaultDocId,
          sensitiveKeys,
          publicDoc,
          privateCredentialsDoc,
          alreadyInVault: false
        });
      } else {
        // Verifica se è già stato migrato nella cassaforte
        const vaultCheck = await vaultColRef.doc(vaultDocId).get();
        if (vaultCheck.exists) {
          stats.alreadyMigrated++;
        }
      }
    }
  }

  console.log(`\nRisultato scansione:`);
  console.log(`- Documenti totali esaminati:              ${stats.scanned}`);
  console.log(`- Documenti con dati sensibili da migrare: ${stats.sensitiveFound}`);
  console.log(`- Documenti già segregati in cassaforte:   ${stats.alreadyMigrated}`);

  if (migrationPlan.length === 0) {
    console.log('\n✅ NESSUNA OPERAZIONE NECESSARIA: Nessun dato sensibile riscontrato nelle collezioni condivise.');
    return;
  }

  console.log('\n--- DETTAGLIO PIANO DI MIGRAZIONE ---');
  for (const item of migrationPlan) {
    console.log(`• [${item.collection}/${item.docId}] -> Vault [${item.vaultDocId}]`);
    console.log(`  Chiavi sensibili (${item.sensitiveKeys.length}): ${item.sensitiveKeys.join(', ')}`);
  }

  if (isDryRun) {
    console.log('\n========================================================================');
    console.log('✅ SIMULAZIONE DRY-RUN COMPLETATA CON SUCCESSO');
    console.log(`Rilevati ${migrationPlan.length} record pronti per la segregazione.`);
    console.log('Nessuna modifica è stata effettuata su Firestore.');
    console.log('\nPer procedere con la migrazione effettiva, esegui:');
    console.log(`  node scripts/ops_migrate_private_credentials.cjs --tripId ${tripId} --apply --confirm-trip-${tripId}`);
    console.log('========================================================================\n');
    return;
  }

  console.log('\n--- ESECUZIONE TRANSAZIONALE RECORD-BY-RECORD ---');
  const now = new Date().toISOString();

  for (const item of migrationPlan) {
    const { collection, docId, vaultDocId, sensitiveKeys, publicDoc, privateCredentialsDoc } = item;
    const docRef = tripRef.collection(collection).doc(docId);
    const vaultRef = vaultColRef.doc(vaultDocId);

    try {
      console.log(`\nMigrazione [${collection}/${docId}] -> [${vaultDocId}]...`);

      // 1. Lettura stato precedente della cassaforte se esistente
      const prevVaultSnap = await vaultRef.get();
      const existingVaultData = prevVaultSnap.exists ? prevVaultSnap.data() : {};

      // 2. Scrittura in cassaforte (merge dei dati sensibili)
      const vaultPayload = {
        ...existingVaultData,
        ...privateCredentialsDoc,
        id: vaultDocId,
        entityId: docId,
        entityType: normalizeEntityType(collection),
        tripId,
        updatedAt: now,
        lastMigratedAt: now
      };

      await vaultRef.set(vaultPayload, { merge: true });

      // 3. VERIFICA DI RITORNO IMMEDIATA DALLA CASSAFORTE
      const verifyVaultSnap = await vaultRef.get();
      if (!verifyVaultSnap.exists) {
        throw new Error(`La cassaforte ${vaultDocId} non risulta esistente dopo la scrittura!`);
      }
      const verifiedVaultData = verifyVaultSnap.data();
      for (const k of sensitiveKeys) {
        if (verifiedVaultData[k] === undefined) {
          throw new Error(`Chiave sensibile '${k}' mancante nella cassaforte dopo la scrittura!`);
        }
      }

      // 4. SOLO DOPO AVER ACCERTATO LA CASSAFORTE: Sanitizzazione documento pubblico
      // Usiamo sanitizePublicDocument per pulire sia root che nodi annidati
      const cleanPublicData = sanitizePublicDocument(publicDoc);
      cleanPublicData.updatedAt = now;
      cleanPublicData.lastSanitizedAt = now;

      // Sostituzione atomica del documento pubblico con la versione sanitizzata
      await docRef.set(cleanPublicData);

      // 5. Verifica del documento pubblico sanitizzato
      const verifyPublicSnap = await docRef.get();
      const verifiedPublicData = verifyPublicSnap.data();
      for (const k of sensitiveKeys) {
        if (verifiedPublicData[k] !== undefined) {
          throw new Error(`CRITICO: La chiave sensibile '${k}' è ancora presente nel documento pubblico ${docId}!`);
        }
      }

      stats.migratedSuccess++;
      console.log(`  ✅ Record migrato e verificato con successo (Cassaforte OK, Pubblico Sanitizzato OK).`);
    } catch (recordError) {
      stats.errors++;
      console.error(`  ❌ ERRORE durante migrazione di [${collection}/${docId}]: ${recordError.message}`);
      console.error('  Procedura interrotta per sicurezza. Correggere l\'errore prima di riprendere.');
      process.exit(1);
    }
  }

  console.log('\n========================================================================');
  console.log('🎉 MIGRAZIONE COMPLETATA CON SUCCESSO');
  console.log(`- Documenti migrati e verificati: ${stats.migratedSuccess}/${migrationPlan.length}`);
  console.log(`- Errori riscontrati:            ${stats.errors}`);
  console.log('Tutti i campi sensibili sono ora protetti nella cassaforte.');
  console.log('I documenti pubblici sono stati sanitizzati senza perdita di prenotazioni.');
  console.log('========================================================================\n');
}

runMigration().catch(err => {
  console.error('❌ ERRORE FATALE MIGRAZIONE:', err);
  process.exit(1);
});
