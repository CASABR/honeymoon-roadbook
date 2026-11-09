const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

async function runTest() {
  console.log('[TEST ONBOARDING GOOGLE] Avvio test E2E onboarding...');
  
  // Avvia server statico per servire dist/
  const distDir = path.resolve(__dirname, '../dist');
  const server = http.createServer((req, res) => {
    const rawPath = req.url.replace(/^\/(honeymoon-roadbook|Viaggio-di-Nozze)\/?/i, '/').split('?')[0];
    let filePath = path.join(distDir, rawPath);
    if (rawPath === '/' || !path.extname(filePath)) {
      filePath = path.join(distDir, 'index.html');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(distDir, 'index.html'), (e, fallback) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(fallback);
        });
      } else {
        const ext = path.extname(filePath);
        const map = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.mjs': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml'
        };
        res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' });
        res.end(data);
      }
    });
  });

  await new Promise(resolve => server.listen(5288, resolve));
  console.log('Server statico avviato su porta 5288.');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 } // iPhone 13/14
  });
  const page = await context.newPage();

  // Simula storage pulito per visualizzare schermata onboarding
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('houni_explicit_logout', 'true');
    try {
      indexedDB.deleteDatabase('hounigo_db_v1');
      indexedDB.deleteDatabase('hounigo_db');
    } catch {}
  });

  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  await page.goto('http://localhost:5288/honeymoon-roadbook/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.resolve(__dirname, 'debug_onboarding.png') });
  console.log('HTML snippet:', (await page.content()).slice(0, 500));

  // Attende che l'inizializzazione termini e che l'onboarding sia visualizzato
  const googleBtn = page.locator('button:has-text("Continua con Google")');
  await googleBtn.waitFor({ state: 'visible', timeout: 10000 });
  const googleBtnCount = await googleBtn.count();
  if (googleBtnCount === 0) {
    throw new Error('Pulsante "Continua con Google" NON trovato nella schermata principale!');
  }
  console.log('✓ 1. Pulsante "Continua con Google" presente e visibile.');

  // 2. Verifica che i campi email/password NON siano visibili nella schermata principale (ordinaria)
  const emailInput = page.locator('input[type="email"]');
  const isEmailVisible = await emailInput.isVisible();
  if (isEmailVisible) {
    throw new Error('I campi email/password sono visibili nella schermata ordinaria, ma dovevano essere nascosti!');
  }
  console.log('✓ 2. Registrazione/accesso email e password nascosti dal flusso ordinario iniziale.');

  // 3. Verifica link discreto "Ho già un account con email e password"
  const discreteLink = page.locator('button:has-text("Ho già un account con email e password")');
  const discreteCount = await discreteLink.count();
  if (discreteCount === 0) {
    throw new Error('Link discreto "Ho già un account con email e password" mancante!');
  }
  console.log('✓ 3. Link discreto per account email e password presente.');

  // 4. Clicca sul link discreto e verifica che porti ad account_login con i campi email/password
  await discreteLink.click();
  await page.waitForTimeout(300);

  const emailInputAfter = page.locator('input[type="email"]');
  const isEmailNowVisible = await emailInputAfter.isVisible();
  if (!isEmailNowVisible) {
    throw new Error('Dopo il clic sul link discreto, i campi email e password non sono comparsi!');
  }
  console.log('✓ 4. Flusso discreto email/password funzionante e accessibile per utenti storici.');

  // 5. Torna indietro con la freccia e verifica il ritorno alla schermata iniziale
  const backBtn = page.locator('button:has-text("←")');
  await backBtn.click();
  await page.waitForTimeout(300);

  const googleBtnAgain = page.locator('button:has-text("Continua con Google")');
  if (!(await googleBtnAgain.isVisible())) {
    throw new Error('Ritorno alla schermata iniziale non riuscito!');
  }
  console.log('✓ 5. Ritorno alla schermata iniziale con "Continua con Google" confermato.');

  // 6. Verifica presenza di "Crea un nuovo viaggio" e "Unisciti a un viaggio"
  const createBtn = page.locator('button:has-text("Crea un nuovo viaggio")');
  const joinBtn = page.locator('button:has-text("Unisciti a un viaggio")');
  if (!(await createBtn.isVisible()) || !(await joinBtn.isVisible())) {
    throw new Error('Pulsanti creazione o unione viaggio mancanti!');
  }
  console.log('✓ 6. Opzioni "Crea un nuovo viaggio" e "Unisciti a un viaggio" presenti e funzionanti.');

  await browser.close();
  server.close();

  console.log('\n======================================================');
  console.log('TUTTI I CONTROLLI ONBOARDING GOOGLE-ONLY SUPERATI!');
  console.log('======================================================\n');
}

runTest().catch(err => {
  console.error('[ERRORE TEST]:', err);
  process.exit(1);
});

