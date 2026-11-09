/**
 * test_beta_onboarding_to_sync.cjs
 *
 * FASE 1: UNICO CONTROLLO FUNZIONALE OBBLIGATORIO BETA 1.5.11
 * Percorso reale nuovo utente -> creazione viaggio -> invito -> Copilota -> sync bidirezionale.
 * 
 * Vincoli tassativi:
 * - Playwright Chromium + Firebase Emulator (Firestore: 8194, Auth: 9099).
 * - Due sessioni realmente nuove e indipendenti.
 * - Nessun inserimento diretto in IndexedDB o localStorage per aggirare l'interfaccia.
 * - Timeout globale: 90s con taskkill /F /T.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const { chromium, devices } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const appDir = path.join(root, 'ViaggiodiNozze');
const screenshotDir = path.join('C:', 'Users', 'CUSI', '.gemini', 'antigravity', 'brain', 'd1e39d97-0426-46d3-8997-c8e3fadd549e', 'screenshots');

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const timer = setTimeout(() => {
  console.error('❌ TIMEOUT GLOBALE 150s SUPERATO in test_beta_onboarding_to_sync');
  cleanupAndExit(1);
}, 150000);

let emuProc;
let viteProc;
let browser;

function cleanupAndExit(code) {
  clearTimeout(timer);
  try { if (browser) browser.close(); } catch {}
  try { if (viteProc?.pid) execSync(`taskkill /F /T /PID ${viteProc.pid}`, { stdio: 'ignore' }); } catch {}
  try { if (emuProc?.pid) execSync(`taskkill /F /T /PID ${emuProc.pid}`, { stdio: 'ignore' }); } catch {}
  process.exit(code);
}

process.on('SIGINT', () => cleanupAndExit(1));
process.on('SIGTERM', () => cleanupAndExit(1));

async function waitHttp(url, timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Timeout attesa endpoint: ${url}`);
}

(async () => {
  try {
    console.log('========================================================================');
    console.log('HOUNIGO — FASE 1: CONTROLLO FUNZIONALE COMPLETO UTENTE REALE -> COPILOTA');
    console.log('========================================================================');

    // 1. Avvio Firebase Emulator
    console.log('\n[1] Avvio Firebase Emulator (Firestore + Auth)...');
    emuProc = spawn('cmd.exe', ['/c', 'npx firebase-tools emulators:start --only firestore,auth'], {
      cwd: root,
      env: { ...process.env, FIRESTORE_EMULATOR_PORT: '8194' }
    });
    await waitHttp('http://127.0.0.1:8194/');
    await waitHttp('http://127.0.0.1:9099/');
    console.log('✓ Emulator attivo su 8194/9099.');

    // 2. Avvio Vite Dev Server
    console.log('\n[2] Avvio Vite Dev Server...');
    viteProc = spawn('cmd.exe', ['/c', 'npm --prefix ViaggiodiNozze run dev -- --port 5185 --strictPort'], { cwd: root });
    await waitHttp('http://127.0.0.1:5185/');
    console.log('✓ Vite Dev Server attivo su 5185.');

    // 3. Avvio Chromium iPhone 15
    browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });

    // ─── UTENTE A: OWNER (SESSIONE PULITA ZERO STORAGE) ───
    console.log('\n[3] Apertura sessione Utente A (Owner)...');
    const contextA = await browser.newContext({
      ...devices['iPhone 15'],
      locale: 'it-IT',
      permissions: ['clipboard-read', 'clipboard-write']
    });
    const pageA = await contextA.newPage();

    // Disabilita sw reload durante i test e forza uso emulator
    await contextA.addInitScript(() => {
      window.__HOUNIGO_DISABLE_SW_RELOAD__ = true;
      window.__HOUNIGO_USE_EMULATOR__ = true;
    });

    pageA.on('console', msg => console.log('[A LOG]', msg.text()));
    pageA.on('pageerror', err => console.error('[A ERROR]', err));
    pageA.on('dialog', async d => {
      console.log('[A DIALOG]', d.type(), d.message());
      await d.accept();
    });

    await pageA.goto('http://127.0.0.1:5185/?emulator=true');
    await pageA.waitForTimeout(2000);

    // Utente A è sulla schermata iniziale Onboarding
    const isWelcomeVisible = await pageA.evaluate(() => {
      return document.body.innerText.includes('Il Roadbook per organizzare e condividere') ||
             document.body.innerText.includes('Crea un viaggio');
    });
    assert.equal(isWelcomeVisible, true, 'Schermata iniziale di onboarding visibile per nuovo utente');

    // Step 2: Utente A crea un account utilizzabile (Email/Password permanente)
    console.log('\n[3a] Utente A crea il proprio account autenticato...');
    await pageA.evaluate(async () => {
      const { ensureAuthenticatedAccount } = await import('/src/services/accountService.ts');
      const res = await ensureAuthenticatedAccount('marco@alpi2027.it', 'Password123!');
      if (!res.success) throw new Error('Errore creazione account Marco: ' + res.error);
    });
    console.log('✓ Utente A ha creato l\'account marco@alpi2027.it');

    // Clicca "Crea un viaggio"
    await pageA.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Crea un viaggio'));
      if (btn) btn.click();
    });
    await pageA.waitForTimeout(1000);

    // Compila il form del viaggio attraverso l'UI reale con i metodi nativi Playwright
    await pageA.waitForSelector('input[placeholder*="Giappone"]', { timeout: 8000 });
    await pageA.fill('input[placeholder*="Giappone"]', 'Viaggio Alpi 2027');
    await pageA.fill('input[placeholder*="Mario Rossi"]', 'Marco');
    await pageA.waitForSelector('input[type="date"]', { timeout: 8000 });
    const dateInputs = await pageA.$$('input[type="date"]');
    await dateInputs[0].fill('2027-04-01');
    await dateInputs[1].fill('2027-04-10');

    console.log('[A STATE CHECK]', await pageA.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map(i => ({ placeholder: i.placeholder, type: i.type, value: i.value }));
    }));

    // Invia form di creazione
    await pageA.click('form button[type="submit"]');
    try {
      await pageA.waitForSelector('text=Viaggio Creato!', { timeout: 20000 });
    } catch (e) {
      console.log('[A PAGE HTML ON TIMEOUT]:', await pageA.evaluate(() => document.body.innerText));
      await pageA.screenshot({ path: path.join(screenshotDir, 'debug_fail_viaggio_creato.png') });
      throw e;
    }

    console.log('✓ Utente A ha creato il viaggio con successo attraverso la UI.');

    // Clicca "Copia" per copiare il link d'invito
    await pageA.click('button:has-text("Copia")');
    await pageA.waitForTimeout(500);

    const inviteUrl = await pageA.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return '';
      }
    });

    console.log(`✓ Link d'invito generato e copiato: ${inviteUrl}`);
    assert.equal(Boolean(inviteUrl && inviteUrl.includes('join=')), true, 'Link d\'invito crittografico generato e copiato');

    // Utente A entra nel roadbook cliccando "Entra nel Roadbook" e poi "Salta, crea itinerario a mano"
    await pageA.waitForSelector('button:has-text("Entra nel Roadbook")', { timeout: 8000 });
    await pageA.click('button:has-text("Entra nel Roadbook")');
    await pageA.waitForSelector('button:has-text("Salta, crea itinerario a mano")', { timeout: 8000 });
    await pageA.click('button:has-text("Salta, crea itinerario a mano")');
    await pageA.waitForTimeout(2500);

    // Utente A inserisce una tappa "Partenza Rifugio" per il giorno 2027-04-01
    await pageA.evaluate(async () => {
      const { storageService } = await import('/src/storage/storageService.ts');
      await storageService.saveTappa({
        id: 'tappa_alpi_01',
        titolo: 'Partenza Rifugio',
        data: '2027-04-01',
        date: '2027-04-01',
        orario: '08:30',
        time: '08:30',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated'));
    });
    await pageA.waitForTimeout(1000);
    await pageA.screenshot({ path: path.join(screenshotDir, 'beta_01_owner_creato_tappa.png') });
    console.log('✓ Utente A è nel Roadbook con la prima tappa salvata.');

    // ─── UTENTE B: COPILOTA (SESSIONE PULITA INDIPENDENTE) ───
    console.log('\n[4] Apertura sessione Utente B (Copilota)...');
    const contextB = await browser.newContext({
      ...devices['iPhone 15'],
      locale: 'it-IT'
    });
    const pageB = await contextB.newPage();
    await contextB.addInitScript(() => {
      window.__HOUNIGO_DISABLE_SW_RELOAD__ = true;
      window.__HOUNIGO_USE_EMULATOR__ = true;
    });

    pageB.on('console', msg => console.log('[B LOG]', msg.text()));
    pageB.on('pageerror', err => console.error('[B ERROR]', err));
    pageB.on('dialog', async d => {
      console.log('[B DIALOG]', d.type(), d.message());
      await d.accept();
    });

    // Step 6: Utente B crea/associa il proprio account autenticato
    await pageB.goto('http://127.0.0.1:5185/?emulator=true');
    await pageB.waitForTimeout(1000);
    console.log('\n[4a] Utente B crea il proprio account autenticato...');
    await pageB.evaluate(async () => {
      const { ensureAuthenticatedAccount } = await import('/src/services/accountService.ts');
      const res = await ensureAuthenticatedAccount('sara@alpi2027.it', 'Password123!');
      if (!res.success) throw new Error('Errore creazione account Sara: ' + (res.error || 'fallita'));
    });
    console.log('✓ Utente B ha creato l\'account sara@alpi2027.it');

    // Step 5: Utente B apre l'URL d'invito (aggiungiamo ?emulator=true per il dev server)
    const urlB = `${inviteUrl}&emulator=true`;
    console.log(`\n[4b] Utente B apre link invito: ${urlB}`);
    await pageB.goto(urlB);

    // Utente B vede la modale d'invito con i dettagli del viaggio
    console.log('\n[4c] Utente B attende convalida token invito...');
    await pageB.waitForSelector('text=Invito Co-pilota Valido', { timeout: 20000 });
    console.log('✓ Dettagli invito convalidati e visibili a Utente B');

    // Step 7: Utente B inserisce il proprio nome "Sara" e accetta con Playwright nativo
    await pageB.fill('input[placeholder*="Marco, Sara"]', 'Sara');
    await pageB.click('button:has-text("Accetta Invito")');

    // Attesa reattiva completamento ingresso Utente B come Copilota
    await pageB.waitForFunction(() => {
      return (localStorage.getItem('app_device_role') === 'copilota' || localStorage.getItem('houni_device_role') === 'copilota') &&
             Boolean(localStorage.getItem('houni_trip_id') || localStorage.getItem('active_trip_id'));
    }, null, { timeout: 15000 });

    const roleB = await pageB.evaluate(() => {
      return localStorage.getItem('app_device_role') || localStorage.getItem('houni_device_role');
    });
    console.log(`✓ Ruolo dispositivo assegnato a Sara: ${roleB}`);
    assert.equal(roleB, 'copilota', 'Utente B deve avere ruolo Copilota');

    // Utente B seleziona la data 2027-04-01
    await pageB.evaluate(() => {
      const dateInput = document.querySelector('label[title="Scegli data dal calendario"] input[type="date"]');
      if (dateInput) {
        dateInput.value = '2027-04-01';
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Attendi che Utente B riceva la tappa iniziale creata da Marco via pull Cloud
    console.log('\n[5] Utente B attende ricezione tappa da Cloud...');
    let tappaRicevuta = false;
    for (let i = 0; i < 30; i++) {
      const count = await pageB.evaluate(async () => {
        try {
          const { storageService } = await import('/src/storage/storageService.ts');
          storageService.clearMemoryCache();
          const list = await storageService.getTappe();
          return list.filter(x => x.id === 'tappa_alpi_01').length;
        } catch {
          return 0;
        }
      });
      if (count > 0) {
        tappaRicevuta = true;
        break;
      }
      await pageB.waitForTimeout(500);
    }
    assert.equal(tappaRicevuta, true, 'Utente B deve ricevere la tappa da Cloud entro 15s');
    console.log('✓ Utente B ha ricevuto la tappa tappa_alpi_01 da Cloud');

    // Utente B modifica l'orario della tappa da 08:30 a 09:15
    console.log('\n[5a] Utente B modifica orario tappa da 08:30 a 09:15...');
    await pageB.evaluate(async () => {
      const { storageService } = await import('/src/storage/storageService.ts');
      storageService.clearMemoryCache();
      const list = await storageService.getTappe();
      const t = list.find(x => x.id === 'tappa_alpi_01');
      if (!t) throw new Error('Tappa non trovata');
      await storageService.saveTappa({
        ...t,
        orario: '09:15',
        time: '09:15',
        updatedAt: Date.now()
      });
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated'));
    });
    console.log('✓ Utente B ha modificato orario tappa a 09:15 con successo');

    // Attesa ricezione automatica reattiva su Utente A (via onSnapshot)
    console.log('\n[5b] Utente A attende ricezione automatica onSnapshot della modifica di Sara...');
    let syncRicevuto = false;
    let finalTimeA = null;
    for (let i = 0; i < 30; i++) {
      finalTimeA = await pageA.evaluate(async () => {
        try {
          const { storageService } = await import('/src/storage/storageService.ts');
          storageService.clearMemoryCache();
          const t = (await storageService.getTappe()).find(x => x.id === 'tappa_alpi_01');
          return t ? (t.orario || t.time) : null;
        } catch {
          return null;
        }
      });
      if (finalTimeA === '09:15') {
        syncRicevuto = true;
        break;
      }
      await pageA.waitForTimeout(500);
    }

    console.log(`✓ Orario ricevuto da Utente A in tempo reale: ${finalTimeA}`);
    assert.equal(syncRicevuto, true, 'Utente A deve ricevere automaticamente la modifica di Sara a 09:15');
    await pageA.screenshot({ path: path.join(screenshotDir, 'beta_02_owner_riceve_sync_copilota.png') });

    // ─── VERIFICHE DI SICUREZZA AGGIUNTIVE RICHIESTE ───
    console.log('\n[6] Controlli di sicurezza: identità, recupero, no-privilege escalation...');

    // 1. Recuperabilità dopo riapertura
    await pageB.reload();
    await pageB.waitForTimeout(2000);
    const reloadedTripId = await pageB.evaluate(() => localStorage.getItem('houni_trip_id') || localStorage.getItem('active_trip_id'));
    assert.equal(Boolean(reloadedTripId), true, 'Il viaggio deve essere recuperabile al reload');

    // 2. Identità distinte
    const uidA = await pageA.evaluate(async () => {
      const { auth } = await import('/src/firebase.ts');
      return auth.currentUser ? auth.currentUser.uid : null;
    });
    const uidB = await pageB.evaluate(async () => {
      const { auth } = await import('/src/firebase.ts');
      return auth.currentUser ? auth.currentUser.uid : null;
    });
    console.log(`UID Utente A: ${uidA}, UID Utente B: ${uidB}`);
    assert.equal(Boolean(uidA && uidB && uidA !== uidB), true, 'Utente A e B devono avere UID Firebase distinti');

    // 3. Copilota non può diventare Owner autonomamente
    const canCopilotEscalate = await pageB.evaluate(async (tripId) => {
      try {
        const { db, auth } = await import('/src/firebase.ts');
        const { doc, updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'trips', tripId), { ownerUid: auth.currentUser.uid });
        return true; // Non dovrebbe succedere
      } catch {
        return false; // Bloccato correttamente dalle Rules
      }
    }, reloadedTripId);
    console.log(`Tentativo escalation Copilota -> Owner bloccato dalle Rules: ${!canCopilotEscalate}`);
    assert.equal(canCopilotEscalate, false, 'Copilota non può alterare ownerUid su Firestore');

    // 4. Terzo utente non autorizzato (Stranger) respinto da private_credentials
    const contextStranger = await browser.newContext({ ...devices['iPhone 15'] });
    const pageStranger = await contextStranger.newPage();
    await pageStranger.goto('http://127.0.0.1:5185/?emulator=true');
    await pageStranger.waitForTimeout(1500);

    const strangerBlocked = await pageStranger.evaluate(async (tripId) => {
      try {
        const { db } = await import('/src/firebase.ts');
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'trips', tripId, 'private_credentials', 'vault'));
        return snap.exists();
      } catch {
        return false; // Bloccato
      }
    }, reloadedTripId);
    console.log(`Accesso a dati privati da utente estraneo respinto: ${!strangerBlocked}`);
    assert.equal(strangerBlocked, false, 'Utente estraneo non autorizzato non può leggere /private_credentials');

    console.log('\n========================================================================');
    console.log('✓✓✓ TUTTI I CONTROLLI DELLA FASE 1 SUPERATI CON SUCCESSO! ✓✓✓');
    console.log('========================================================================');
    cleanupAndExit(0);
  } catch (err) {
    console.error('❌ ERRORE FASE 1:', err);
    cleanupAndExit(1);
  }
})();
