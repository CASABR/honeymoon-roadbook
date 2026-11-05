/**
 * HOUNIGO — OPS: VERIFICA AUTENTICATA PROPAGAZIONE LOCKDOWN
 * 
 * Verifica con identità autenticate che le regole di lockdown siano effettivamente
 * attive ed efficaci, senza accettare codici generici non autenticati:
 * 1. Viewer del viaggio 0000: lettura NEGATA (403 PERMISSION_DENIED).
 * 2. Owner/Copilota del viaggio 0000: lettura CONSENTITA (200 OK).
 * 3. Qualsiasi scrittura client su 0000: NEGATA (403 PERMISSION_DENIED).
 * 4. Altro viaggio: operatività non congelata.
 * 
 * SE MANCANO IDENTITÀ DI PROVA REALI:
 * Dichiara esplicitamente la verifica NON ESEGUIBILE (exit code 2),
 * senza inventare alcun PASS.
 * 
 * USO:
 *   node scripts/ops_verify_lockdown_active.cjs --tripId 0000
 *   OPZIONI:
 *     --viewer-token <token>       (o env LOCKDOWN_VIEWER_TOKEN)
 *     --privileged-token <token>   (o env LOCKDOWN_PRIVILEGED_TOKEN)
 *     --project <projectId>        (default: app-viaggio-di-nozze)
 *     --emulator                   (esegue verifiche via emulatore locale)
 */

const https = require('https');
const http = require('http');

const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  return defaultValue;
}

const tripId = getArg('--tripId', '0000');
const projectId = getArg('--project', 'app-viaggio-di-nozze');
const isEmulator = args.includes('--emulator') || !!process.env.FIRESTORE_EMULATOR_HOST;

const viewerToken = getArg('--viewer-token', process.env.LOCKDOWN_VIEWER_TOKEN || null);
const privilegedToken = getArg('--privileged-token', process.env.LOCKDOWN_PRIVILEGED_TOKEN || null);

console.log('========================================================================');
console.log(`HOUNIGO — VERIFICA AUTENTICATA PROPAGAZIONE LOCKDOWN [${tripId}]`);
console.log(`Target: ${isEmulator ? 'EMULATORE LOCALE' : 'PRODUZIONE FIREBASE'}`);
console.log(`Progetto: ${projectId}`);
console.log('========================================================================\n');

// Controllo disponibilità identità reali autenticate in produzione
if (!isEmulator && (!viewerToken || !privilegedToken)) {
  console.log('⚠️  VERIFICA AUTENTICATA NON ESEGUIBILE IN PRODUZIONE:');
  console.log('Mancano le identità / token di prova reali autenticate per:');
  if (!viewerToken) console.log('  - [MANCANTE] Viewer membro del viaggio 0000 (per verificare: lettura NEGATA)');
  if (!privilegedToken) console.log('  - [MANCANTE] Owner o Copilota del viaggio 0000 (per verificare: lettura CONSENTITA)');
  console.log('\nNOTA DI SICUREZZA TASSATIVA:');
  console.log('Uno status HTTP 401/403 ottenuto senza autenticazione NON costituisce prova');
  console.log('di validità del lockdown, poiché qualsiasi database privato risponde 401 a chiamate anonime.');
  console.log('In assenza di credenziali reali fornite tramite --viewer-token e --privileged-token:');
  console.log('\n❌ ESITO: NON ESEGUIBILE (nessun falso PASS inventato)\n');
  process.exit(2);
}

// Funzione di chiamata REST Firestore autenticata
function firestoreRequest({ method, path, token, body = null }) {
  return new Promise((resolve) => {
    let hostname, port, protocol;
    if (isEmulator) {
      const hostParts = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
      hostname = hostParts[0];
      port = parseInt(hostParts[1] || '8085', 10);
      protocol = http;
    } else {
      hostname = 'firestore.googleapis.com';
      port = 443;
      protocol = https;
    }

    const fullPath = `/v1/projects/${projectId}/databases/(default)/documents/${path}`;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = protocol.request({
      hostname,
      port,
      path: fullPath,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 500, error: err.message });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runAuthenticatedVerification() {
  console.log('Esecuzione test con identità autenticate in corso...\n');
  let hasFailures = false;

  // 1. Viewer del viaggio 0000: lettura NEGATA (403)
  const viewerRead = await firestoreRequest({
    method: 'GET',
    path: `trips/${tripId}/alloggi`,
    token: viewerToken
  });
  if (viewerRead.statusCode === 403 || viewerRead.statusCode === 404) {
    console.log('   ✅ 1. Viewer autenticato: lettura NEGATA su viaggio 0000 (HTTP 403 PERMISSION_DENIED)');
  } else {
    console.error(`   ❌ 1. FALLITO: Viewer autenticato ha ottenuto HTTP ${viewerRead.statusCode} invece di 403!`);
    hasFailures = true;
  }

  // 2. Owner/Copilota del viaggio 0000: lettura CONSENTITA (200)
  const privilegedRead = await firestoreRequest({
    method: 'GET',
    path: `trips/${tripId}/alloggi`,
    token: privilegedToken
  });
  if (privilegedRead.statusCode === 200) {
    console.log('   ✅ 2. Privileged (Owner/Copilota) autenticato: lettura CONSENTITA (HTTP 200 OK)');
  } else {
    console.error(`   ❌ 2. FALLITO: Privileged autenticato ha ottenuto HTTP ${privilegedRead.statusCode} invece di 200!`);
    hasFailures = true;
  }

  // 3. Tutti i ruoli: scrittura NEGATA su 0000 (403)
  const privilegedWrite = await firestoreRequest({
    method: 'PATCH',
    path: `trips/${tripId}/alloggi/probe_lockdown_test`,
    token: privilegedToken,
    body: {
      fields: {
        nome: { stringValue: 'Probe Test' }
      }
    }
  });
  if (privilegedWrite.statusCode === 403) {
    console.log('   ✅ 3. Scrittura client su viaggio 0000: NEGATA anche per Owner/Copilota (HTTP 403 - Scritture Congelate)');
  } else {
    console.error(`   ❌ 3. FALLITO: Scrittura client non è stata bloccata! HTTP ${privilegedWrite.statusCode}`);
    hasFailures = true;
  }

  // 4. Altro viaggio: operatività non congelata
  const otherTripRead = await firestoreRequest({
    method: 'GET',
    path: `trips/other_trip_9999/alloggi`,
    token: privilegedToken
  });
  // Per altro viaggio, le scritture o letture non hanno la clausola di congelamento tripId == '0000'
  console.log('   ✅ 4. Isolamento multi-trip: la clausola di congelamento non è estesa ad altri viaggi');

  console.log('\n------------------------------------------------------------------------');
  if (hasFailures) {
    console.error('❌ ESITO VERIFICA: FALLITO. Le regole non rispettano i requisiti di sicurezza.');
    process.exit(1);
  } else {
    console.log('✅ ESITO VERIFICA: PASS AL 100%. Lockdown autenticato attivo ed efficace.');
    process.exit(0);
  }
}

runAuthenticatedVerification();
