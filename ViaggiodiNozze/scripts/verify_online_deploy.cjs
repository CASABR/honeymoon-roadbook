const https = require('https');

const TARGET_URL = 'https://casabr.github.io/honeymoon-roadbook/';

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url + '?cache_bust=' + Date.now(), { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function verify() {
  console.log('=== VERIFICA ONLINE GITHUB PAGES DEPLOYMENT ===\n');
  console.log('1. Fetching URL:', TARGET_URL);
  
  const res = await fetchUrl(TARGET_URL);
  console.log('HTTP Status Code:', res.statusCode);
  console.log('Last-Modified / ETag:', res.headers['last-modified'] || res.headers['etag']);
  
  // Extract script and css bundles
  const scriptMatches = [...res.body.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
  const cssMatches = [...res.body.matchAll(/href="([^"]+\.css)"/g)].map(m => m[1]);
  
  console.log('\nScript tags trovati nell\'HTML live:');
  scriptMatches.forEach(s => console.log('  - ' + s));
  
  console.log('\nCSS tags trovati nell\'HTML live:');
  cssMatches.forEach(c => console.log('  - ' + c));
  
  // Verify bundle status
  if (scriptMatches.length > 0) {
    const mainScript = scriptMatches.find(s => s.includes('index-'));
    console.log('\nBundle JS Principale in produzione:', mainScript);
    if (mainScript) {
      const scriptUrl = new URL(mainScript, TARGET_URL).toString();
      console.log('Verifica HTTP bundle:', scriptUrl);
      const scriptRes = await fetchUrl(scriptUrl);
      console.log('Bundle HTTP Status:', scriptRes.statusCode, `(Dimensione: ${scriptRes.body.length} bytes)`);
      if (scriptRes.statusCode === 200) {
        console.log('✓ Bundle JS raggiungibile e servito correttamente da CDN!');
      } else {
        console.log('⚠️ Attesa propagazione CDN GitHub Pages...');
      }
    }
  }

  // Check manifest and favicon
  console.log('\nVerifica Risorse Core:');
  const manifestRes = await fetchUrl(new URL('manifest.webmanifest', TARGET_URL).toString());
  console.log('Manifest Webmanifest HTTP Status:', manifestRes.statusCode);
  const iconRes = await fetchUrl(new URL('favicon.svg', TARGET_URL).toString());
  console.log('Favicon SVG HTTP Status:', iconRes.statusCode);

  console.log('\n=== ESITO: VERIFICA COMPLETATA ===');
}

verify().catch(console.error);
