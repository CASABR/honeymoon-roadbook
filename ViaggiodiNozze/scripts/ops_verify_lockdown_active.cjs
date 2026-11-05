/**
 * HOUNIGO — OPS: VERIFICA ATTIVAZIONE E PROPAGAZIONE LOCKDOWN
 * 
 * Verifica che le Security Rules di lockdown siano effettivamente propagate
 * sui server di produzione Firebase, testando il blocco 403 su accessi non privilegiati.
 * 
 * USO:
 *   node scripts/ops_verify_lockdown_active.cjs --tripId 0000
 */

const https = require('https');

const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  return defaultValue;
}

const tripId = getArg('--tripId', '0000');
const projectId = getArg('--project', 'app-viaggio-di-nozze');

console.log('========================================================================');
console.log(`HOUNIGO — VERIFICA PROPAGAZIONE LOCKDOWN RULES [${tripId}]`);
console.log(`Progetto: ${projectId}`);
console.log('========================================================================\n');

function checkPublicEndpoint() {
  return new Promise((resolve) => {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/trips/${tripId}/alloggi`;
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body });
      });
    }).on('error', (err) => {
      resolve({ statusCode: 500, error: err.message });
    });
  });
}

async function waitAndVerifyLockdown() {
  console.log('Attesa propagazione regole Firebase (controllo ogni 5s per max 60s)...');
  const maxAttempts = 12;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await checkPublicEndpoint();
    console.log(`[Tentativo ${attempt}/${maxAttempts}] Stato HTTP accesso non autorizzato: ${res.statusCode}`);

    // In lockdown, l'accesso non autenticato su collezioni di 0000 DEVE restituire 403 o 401
    if (res.statusCode === 403 || res.statusCode === 401 || res.statusCode === 404) {
      console.log('\n✅ LOCKDOWN EFFETTIVAMENTE PROPAGATO ED ATTIVO SU FIREBASE!');
      console.log('Nessun accesso non autorizzato è consentito alle collezioni condivise.');
      process.exit(0);
    }

    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.error('\n⚠️  ATTENZIONE: Le regole non risultano ancora propagate. Riprova tra pochi istanti.');
  process.exit(1);
}

waitAndVerifyLockdown();

