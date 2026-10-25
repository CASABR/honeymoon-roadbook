/**
 * HOUNIGO — TEST FASE 1: RICONCILIAZIONE DELLA VERSIONE PUBBLICATA
 * 
 * Verifica online (in sola lettura):
 * 1. Versione attiva su GitHub Pages (commit 6a7f785 su origin/gh-pages)
 * 2. Corrispondenza bundle JS (index-DxxPChKC.js) e CSS (index-DdMy2aXy.css)
 * 3. Manifest PWA (name, standalone, icone) e Service Worker (sw.js, precache)
 * 4. Caricamento iniziale e struttura DOM (root element, viewport)
 * 5. Verifica assenza di errori o riferimenti rotti a vecchi bundle
 * 6. Cache busting e Service Worker revisions
 * 7. Routing con parametri URL diretti: ?invite=TOKEN, ?join=1, ?tripId=TEST, ?live=1, ?admin=1
 * 8. Verifica integrità snapshot rollback (docs/firestore.rules.active-production-before-hotfix)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const BASE_URL = 'https://casabr.github.io/honeymoon-roadbook/';

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const client = u.protocol === 'https:' ? https : http;
      const req = client.get(u, {
        headers: {
          'User-Agent': 'Hounigo-QA-Reconciliation/1.0',
          'Accept': '*/*',
          ...(options.headers || {})
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.setTimeout(options.timeout || 15000, () => req.destroy(new Error(`Timeout verso ${url}`)));
    } catch (e) {
      reject(e);
    }
  });
}

async function runPhase1() {
  console.log('======================================================================');
  console.log('HOUNIGO — FASE 1: RICONCILIAZIONE DELLA VERSIONE PUBBLICATA');
  console.log(`Target URL: ${BASE_URL}`);
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assertCheck(cond, desc) {
    total++;
    if (cond) {
      passed++;
      console.log(`  [PASS ${passed.toString().padStart(2, '0')}] ${desc}`);
    } else {
      console.error(`  [FAIL ${total.toString().padStart(2, '0')}] ${desc}`);
      process.exitCode = 1;
    }
  }

  // 1. Root index.html
  console.log('--- 1. INDEX.HTML & BUNDLE ALIGNMENT ---');
  const indexRes = await fetch(BASE_URL);
  assertCheck(indexRes.statusCode === 200, `Caricamento root: HTTP ${indexRes.statusCode}`);
  assertCheck(indexRes.body.includes('<div id="root">'), 'Div #root presente per montaggio React (con fallback render integrato)');
  assertCheck(indexRes.body.includes('assets/index-DxxPChKC.js'), 'index.html punta esattamente al bundle JS index-DxxPChKC.js');
  assertCheck(indexRes.body.includes('assets/index-DdMy2aXy.css'), 'index.html punta esattamente al bundle CSS index-DdMy2aXy.css');
  assertCheck(!indexRes.body.includes('index-D_jtqkoZ.js'), 'Vecchio bundle JS index-D_jtqkoZ.js non più referenziato');
  assertCheck(!indexRes.body.includes('index-Du7XQE7-.css'), 'Vecchio bundle CSS index-Du7XQE7-.css non più referenziato');

  // 2. Bundle content checks
  console.log('\n--- 2. JS & CSS BUNDLE INTEGRITY & FEATURES ---');
  const jsRes = await fetch(`${BASE_URL}assets/index-DxxPChKC.js`);
  assertCheck(jsRes.statusCode === 200, `Download bundle JS: HTTP ${jsRes.statusCode} (${Math.round(jsRes.body.length / 1024)} KB)`);
  assertCheck(jsRes.body.includes('showPicker'), 'Feature Calendario Oggi: showPicker presente nel bundle live');
  assertCheck(jsRes.body.includes('Percorso a Piedi'), 'Feature Maps: Percorso a Piedi presente nel bundle live');
  assertCheck(!jsRes.body.includes('prevUid'), 'Vulnerabilità prevUid: parametro insicuro del tutto assente dal bundle');

  const cssRes = await fetch(`${BASE_URL}assets/index-DdMy2aXy.css`);
  assertCheck(cssRes.statusCode === 200, `Download bundle CSS: HTTP ${cssRes.statusCode} (${Math.round(cssRes.body.length / 1024)} KB)`);

  // 3. Manifest PWA & Service Worker
  console.log('\n--- 3. PWA MANIFEST & SERVICE WORKER ---');
  const manifestRes = await fetch(`${BASE_URL}manifest.webmanifest`);
  assertCheck(manifestRes.statusCode === 200, `Download manifest.webmanifest: HTTP ${manifestRes.statusCode}`);
  const manifest = JSON.parse(manifestRes.body);
  assertCheck(manifest.name === 'Hounigo', `Manifest name: "${manifest.name}"`);
  assertCheck(manifest.display === 'standalone', `Manifest display: "${manifest.display}"`);
  assertCheck(manifest.start_url === '/honeymoon-roadbook/', `Manifest start_url: "${manifest.start_url}"`);

  const swRes = await fetch(`${BASE_URL}sw.js`);
  assertCheck(swRes.statusCode === 200, `Download sw.js: HTTP ${swRes.statusCode}`);
  assertCheck(swRes.body.includes('index-DxxPChKC.js'), 'Service Worker ha nella precache list il nuovo bundle JS');
  assertCheck(swRes.body.includes('index-DdMy2aXy.css'), 'Service Worker ha nella precache list il nuovo bundle CSS');
  assertCheck(!swRes.body.includes('index-D_jtqkoZ.js'), 'Service Worker non contiene più la vecchia versione JS in precache');

  // 4. URL Routing & Direct Deep Links (Query params)
  console.log('\n--- 4. DIRECT ROUTING & QUERY PARAMETERS ---');
  const inviteUrlRes = await fetch(`${BASE_URL}?join=1&tripId=TEST_TRIP&token=TEST_TOKEN_123`);
  assertCheck(inviteUrlRes.statusCode === 200, `Apertura diretta link invito (?join=1&token=...): HTTP ${inviteUrlRes.statusCode}`);
  assertCheck(inviteUrlRes.body.includes('<div id="root">'), 'Link invito renderizza la shell SPA correttamente');

  const liveUrlRes = await fetch(`${BASE_URL}?live=1`);
  assertCheck(liveUrlRes.statusCode === 200, `Apertura diretta feed live (?live=1): HTTP ${liveUrlRes.statusCode}`);

  const adminUrlRes = await fetch(`${BASE_URL}?admin=1`);
  assertCheck(adminUrlRes.statusCode === 200, `Apertura diretta admin console (?admin=1): HTTP ${adminUrlRes.statusCode}`);

  // 5. Verification of Rollback Snapshot Files
  console.log('\n--- 5. VERIFICA INTEGRITÀ SNAPSHOT ROLLBACK ---');
  const rollbackRulesPath = path.resolve(__dirname, '../docs/firestore.rules.active-production-before-hotfix');
  assertCheck(fs.existsSync(rollbackRulesPath), `File snapshot rollback presente: ${rollbackRulesPath}`);
  
  const rollbackContent = fs.readFileSync(rollbackRulesPath, 'utf8');
  assertCheck(rollbackContent.length > 500, `Snapshot regole precedente non vuoto (${rollbackContent.length} byte)`);
  assertCheck(rollbackContent.includes('request.auth != null'), 'Snapshot regole contiene regole Firestore valide con controllo request.auth != null');
  assertCheck(rollbackContent.includes('isTripOwner(tripId)'), 'Snapshot regole contiene funzioni helper valide (isTripOwner)');
  
  // Verify that current firestore.rules does NOT contain prevUid
  const currentRulesPath = path.resolve(__dirname, '../firestore.rules');
  const currentRulesContent = fs.readFileSync(currentRulesPath, 'utf8');
  assertCheck(!currentRulesContent.includes('prevUid'), 'Le attuali regole attive NON contengono la vulnerabilità prevUid');

  console.log('\n----------------------------------------------------------------------');
  console.log(`ESITO FASE 1: ${passed}/${total} controlli superati (${Math.round(passed / total * 100)}%)`);
  console.log('----------------------------------------------------------------------');
}

runPhase1().catch(err => {
  console.error('Fatal error in Phase 1:', err);
  process.exit(1);
});
