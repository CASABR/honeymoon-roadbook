const https = require('node:https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (ReleaseCheck/1.5.8)', 'Cache-Control': 'no-cache' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function verifyOnline() {
  const t = Date.now();
  console.log('Fetching live index.html...');
  const htmlRes = await fetchUrl('https://casabr.github.io/honeymoon-roadbook/index.html?t=' + t);
  console.log('HTML Status:', htmlRes.status);
  
  const jsMatch = htmlRes.body.match(/src="[^"]*assets\/(index-[^"]+\.js)"/);
  const cssMatch = htmlRes.body.match(/href="[^"]*assets\/(index-[^"]+\.css)"/);
  console.log('Matched JS bundle:', jsMatch ? jsMatch[1] : 'NOT FOUND');
  console.log('Matched CSS bundle:', cssMatch ? cssMatch[1] : 'NOT FOUND');

  if (jsMatch) {
    const jsUrl = 'https://casabr.github.io/honeymoon-roadbook/assets/' + jsMatch[1];
    console.log('Fetching JS bundle:', jsUrl);
    const jsRes = await fetchUrl(jsUrl);
    console.log('JS Bundle Status:', jsRes.status, 'Length:', jsRes.body.length);
    console.log('Contains 1.5.8:', jsRes.body.includes('1.5.8'));
    console.log('Contains Diagnostica Pre-Attivazione:', jsRes.body.includes('Diagnostica Pre-Attivazione'));
    console.log('Contains Sblocca ed Esegui Riconciliazione:', jsRes.body.includes('Sblocca ed Esegui Riconciliazione'));
    console.log('Contains Ricezione Automatica Copilota:', jsRes.body.includes('Ricezione Automatica Copilota'));
    console.log('Contains Ripristina Blocco Scritture:', jsRes.body.includes('Ripristina Blocco Scritture'));
  }

  const manifestRes = await fetchUrl('https://casabr.github.io/honeymoon-roadbook/manifest.webmanifest?t=' + t);
  console.log('Manifest Status:', manifestRes.status, 'Length:', manifestRes.body.length);

  const swRes = await fetchUrl('https://casabr.github.io/honeymoon-roadbook/sw.js?t=' + t);
  console.log('Service Worker Status:', swRes.status, 'Length:', swRes.body.length);
}

verifyOnline().catch(console.error);
