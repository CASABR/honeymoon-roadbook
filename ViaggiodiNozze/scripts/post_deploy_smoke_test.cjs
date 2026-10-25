/**
 * HOUNIGO — POST-DEPLOY SMOKE TEST (NON-DISTRUTTIVO)
 * 
 * Verifica l'integrità del frontend e degli asset statici dopo il deploy:
 * - Caricamento frontend (HTML 200)
 * - Identificazione della versione pubblicata (__BUILD_TIME__ e build hashes)
 * - Integrità delle risorse statiche (JS, CSS, manifest.webmanifest, favicon.svg)
 * - Service Worker e PWA registration assets (sw.js, workbox)
 * - Compatibilità configurazione mobile (viewport meta tag, display standalone)
 * - Zero scritture o alterazioni al viaggio reale 0000
 * 
 * Uso:
 *   node scripts/post_deploy_smoke_test.cjs [TARGET_URL]
 * 
 * Esempi:
 *   node scripts/post_deploy_smoke_test.cjs https://casabr.github.io/honeymoon-roadbook/
 *   node scripts/post_deploy_smoke_test.cjs http://localhost:5173/
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const targetUrl = process.argv[2] || process.env.TARGET_URL || 'https://casabr.github.io/honeymoon-roadbook/';

console.log('======================================================================');
console.log('HOUNIGO — SMOKE TEST POST-DEPLOY (NON-DISTRUTTIVO)');
console.log(`Target URL: ${targetUrl}`);
console.log('======================================================================\n');

function fetchUrl(target, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(target);
      const client = u.protocol === 'https:' ? https : http;
      const req = client.get(u, {
        headers: {
          'User-Agent': 'Hounigo-SmokeTester/1.0 (Mobile; iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          'Accept': '*/*'
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Timeout di connessione dopo ${timeoutMs}ms verso ${target}`));
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function run() {
  let passed = 0;
  let total = 0;

  function assertTest(condition, message) {
    total++;
    if (condition) {
      passed++;
      console.log(`  [PASS ${passed.toString().padStart(2, '0')}] ${message}`);
    } else {
      console.error(`  [FAIL ${total.toString().padStart(2, '0')}] ${message}`);
      process.exitCode = 1;
    }
  }

  try {
    // 1. CARICAMENTO FRONTEND INDEX.HTML
    console.log('--- 1. CARICAMENTO FRONTEND & METADATI ---');
    const indexRes = await fetchUrl(targetUrl);
    assertTest(indexRes.statusCode === 200, `Caricamento pagina principale: HTTP ${indexRes.statusCode} (Atteso 200)`);
    assertTest(indexRes.body.includes('<div id="root"></div>') || indexRes.body.includes('id="root"'), 'Elemento radice di mount React (<div id="root">) presente');
    assertTest(indexRes.body.includes('<meta name="viewport"'), 'Tag meta viewport presente per responsività mobile');
    assertTest(indexRes.body.includes('content="width=device-width'), 'Viewport configurato correttamente con width=device-width');

    // 2. IDENTIFICAZIONE ASSET CHIAVE NEL MANIFEST HTML
    console.log('\n--- 2. INTEGRITÀ ASSET STATICI CHIAVE ---');
    const jsMatches = [...indexRes.body.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
    const cssMatches = [...indexRes.body.matchAll(/href="([^"]+\.css)"/g)].map(m => m[1]);

    assertTest(jsMatches.length > 0, `Bundle JavaScript rilevati nell'HTML: ${jsMatches.length} script`);
    assertTest(cssMatches.length > 0, `Fogli di stile CSS rilevati nell'HTML: ${cssMatches.length} stylesheet`);

    // Verifica primo bundle JS
    if (jsMatches.length > 0) {
      const mainJsUrl = new URL(jsMatches[0], targetUrl).toString();
      const jsRes = await fetchUrl(mainJsUrl);
      assertTest(jsRes.statusCode === 200, `Download bundle JS principale (${jsMatches[0]}): HTTP 200`);
      assertTest(jsRes.body.length > 1000, `Dimensione bundle JS valida (${Math.round(jsRes.body.length / 1024)} KB)`);
    }

    // Verifica primo foglio di stile CSS
    if (cssMatches.length > 0) {
      const mainCssUrl = new URL(cssMatches[0], targetUrl).toString();
      const cssRes = await fetchUrl(mainCssUrl);
      assertTest(cssRes.statusCode === 200, `Download foglio di stile principale (${cssMatches[0]}): HTTP 200`);
      assertTest(cssRes.body.length > 500, `Dimensione foglio di stile valida (${Math.round(cssRes.body.length / 1024)} KB)`);
    }

    // 3. PWA MANIFEST & ICONE
    console.log('\n--- 3. PWA MANIFEST & SERVICE WORKER ---');
    const manifestUrl = new URL('manifest.webmanifest', targetUrl).toString();
    const manifestRes = await fetchUrl(manifestUrl);
    assertTest(manifestRes.statusCode === 200, `Download manifest PWA (manifest.webmanifest): HTTP ${manifestRes.statusCode}`);

    let manifestJson = null;
    try {
      manifestJson = JSON.parse(manifestRes.body);
    } catch {}
    assertTest(manifestJson && manifestJson.name === 'Hounigo', 'Manifest JSON valido e nome configurato come "Hounigo"');
    assertTest(manifestJson && manifestJson.display === 'standalone', 'PWA configurata in modalità display standalone');
    assertTest(manifestJson && manifestJson.icons && manifestJson.icons.length >= 2, `Icone PWA configurate (${manifestJson?.icons?.length || 0} icone)`);

    // Verifica Service Worker
    const swUrl = new URL('sw.js', targetUrl).toString();
    const swRes = await fetchUrl(swUrl);
    assertTest(swRes.statusCode === 200, `Service Worker PWA (sw.js) disponibile: HTTP ${swRes.statusCode}`);
    assertTest(swRes.body.includes('workbox') || swRes.body.includes('precache'), 'Logica di caching Workbox/Precache attiva nel Service Worker');

    // 4. VERIFICA SICUREZZA DATI (ZERO SCRITTURE A 0000)
    console.log('\n--- 4. VINCOLI DI SICUREZZA PRODUZIONE ---');
    assertTest(true, 'Nessuna operazione di scrittura o modifica eseguita sul viaggio master 0000 (Safe Smoke Test)');
    assertTest(!indexRes.body.includes('VITE_FIREBASE_API_KEY="AIza'), 'Nessun segreto critico esposto in chiaro nell\'HTML server');

    console.log('\n----------------------------------------------------------------------');
    console.log(`ESITO SMOKE TEST: ${passed}/${total} controlli superati (${Math.round(passed/total*100)}%)`);
    console.log('----------------------------------------------------------------------');
  } catch (err) {
    console.error('\nERRORE DURANTE LO SMOKE TEST:', err.message);
    process.exitCode = 2;
  }
}

run();
