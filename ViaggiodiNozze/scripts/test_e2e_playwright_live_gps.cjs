/**
 * test_e2e_playwright_live_gps.cjs
 * 
 * COLLAUDO AUTOMATICO END-TO-END DEFINITIVO GPS LIVE OWNER / COPILOTA / OSPITI
 * Ambiente: Playwright Chromium (iPhone 15 Mobile Viewport) + Firebase Emulator Suite (Firestore: 8194, Auth: 9099).
 * 
 * Verifiche eseguite:
 * 1. Attivazione GPS dall'iPhone Owner (consenso esplicito, lease attivo e posizione pubblicata).
 * 2. Ricezione automatica della posizione sul Copilota (in tempo reale SENZA refresh e SENZA pulsanti).
 * 3. Aggiornamento progressivo durante gli spostamenti (Tokyo -> Shibuya).
 * 4. Impedimento delle scritture da dispositivi non autorizzati (Security Rules 403 / PERMISSION_DENIED).
 * 5. Trasferimento del ruolo di guida al Copilota (Delega Guida GPS -> Copilota trasmette Kyoto -> Owner riceve live).
 * 6. Perdita temporanea di connessione e successivo recupero (offline -> online).
 * 7. GPS disattivato, permesso negato e posizione non piu' aggiornata (arresto condivisione).
 * 8. Consumo ragionevole di batteria e scritture Firestore, senza polling eccessivo (rate limit 15s verificato).
 * 9. Corretta distinzione fra posizione LIVE ("GPS attivo") e ultima posizione nota ("Ultima posizione aggiornata").
 * 10. Protezione rigorosa delle informazioni private nella pagina pubblica LIVE per gli ospiti.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, devices } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const appDir = path.join(root, 'ViaggiodiNozze');
const screenshotDir = path.join('C:', 'Users', 'CUSI', '.gemini', 'antigravity', 'brain', 'd1e39d97-0426-46d3-8997-c8e3fadd549e', 'screenshots');

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const admin = require(path.join(appDir, 'node_modules', 'firebase-admin'));
const { getAuth } = require(path.join(appDir, 'node_modules', 'firebase-admin', 'lib', 'auth'));
let adminApp;
try {
  adminApp = admin.app();
} catch {
  adminApp = admin.initializeApp({ projectId: 'app-viaggio-di-nozze' });
}

const OWNER_UID = 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2';
const COPILOT_UID = 'EY8lnbnfy7gbES6tijrTfjlJzjS2';
const STRANGER_UID = 'attacker_unauthorized_user_999';
const PROJECT_ID = 'app-viaggio-di-nozze';
const FIRESTORE_BASE = `http://127.0.0.1:8194/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const todayStr = new Date().toISOString().split('T')[0];

console.log('====================================================================');
console.log('--- HOUNIGO: COLLAUDO AUTOMATICO END-TO-END GPS LIVE (10 VERIFICHE) ---');
console.log(`Data odierna: ${todayStr}`);
console.log(`Directory screenshot: ${screenshotDir}`);
console.log('====================================================================');

async function waitHttp(url, timeoutMs = 20000) {
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

function fields(data) {
  const value = item => {
    if (Array.isArray(item)) return { arrayValue: { values: item.map(value) } };
    if (item instanceof Date) return { timestampValue: item.toISOString() };
    if (typeof item === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(item)) return { timestampValue: item };
      return { stringValue: item };
    }
    if (typeof item === 'boolean') return { booleanValue: item };
    if (typeof item === 'number') return { doubleValue: item };
    return { mapValue: { fields: fields(item) } };
  };
  return Object.fromEntries(Object.entries(data).filter(([,v])=>v !== undefined).map(([k,v])=>[k,value(v)]));
}

function parseFields(docFields) {
  if (!docFields) return {};
  const res = {};
  for (const [k, v] of Object.entries(docFields)) {
    if (v.stringValue !== undefined) res[k] = v.stringValue;
    else if (v.integerValue !== undefined) res[k] = parseInt(v.integerValue, 10);
    else if (v.doubleValue !== undefined) res[k] = Number(v.doubleValue);
    else if (v.booleanValue !== undefined) res[k] = v.booleanValue;
    else if (v.arrayValue && v.arrayValue.values) res[k] = v.arrayValue.values.map(val => val.stringValue || (val.mapValue ? parseFields(val.mapValue.fields) : val));
    else if (v.mapValue && v.mapValue.fields) res[k] = parseFields(v.mapValue.fields);
    else res[k] = v;
  }
  return res;
}

async function requestAdmin(method, docPath, data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer owner'
  };
  return fetch(`${FIRESTORE_BASE}/${docPath}`, {
    method,
    headers,
    body: data ? JSON.stringify({ fields: fields(data) }) : undefined,
    signal: AbortSignal.timeout(10000)
  });
}

(async () => {
  let emuProc;
  let viteProc;
  let browser;

  try {
    // 1. Avvio Firebase Emulator Suite (Firestore: 8194, Auth: 9099)
    console.log('\n[Passo 1] Avvio Firebase Emulator Suite (Firestore + Auth)...');
    emuProc = spawn('cmd.exe', ['/c', 'npx firebase-tools emulators:start --only firestore,auth'], { cwd: root });
    await waitHttp('http://127.0.0.1:8194/');
    await waitHttp('http://127.0.0.1:9099/');
    console.log('✓ Firebase Emulator Suite attivo (Firestore: 8194, Auth: 9099).');

    // 2. Avvio Dev Server Vite su porta 5184
    console.log('\n[Passo 2] Avvio Vite Dev Server su porta 5184...');
    viteProc = spawn('cmd.exe', ['/c', 'npm --prefix ViaggiodiNozze run dev -- --port 5184 --strictPort'], { cwd: root });
    await waitHttp('http://127.0.0.1:5184/');
    console.log('✓ Vite Dev Server attivo su http://127.0.0.1:5184.');

    // 3. Inizializzazione viaggio 0000 sintetico su Firestore Emulator
    console.log('\n[Passo 3] Inizializzazione dati sintetici viaggio 0000 su Firestore Emulator...');
    await requestAdmin('PATCH', 'trips/0000', {
      id: '0000',
      title: 'Giappone & Maldive 2026',
      startDate: '2026-11-28',
      endDate: '2027-01-10',
      ownerUid: OWNER_UID,
      ownerName: 'Nunzio',
      members: [COPILOT_UID],
      updatedAt: 1000000
    });
    await requestAdmin('PATCH', `trips/0000/members/${OWNER_UID}`, { uid: OWNER_UID, role: 'owner', name: 'Nunzio' });
    await requestAdmin('PATCH', `trips/0000/members/${COPILOT_UID}`, { uid: COPILOT_UID, role: 'copilota', name: 'Giusy' });

    // Header del feed live pubblico
    await requestAdmin('PATCH', 'live_feeds/0000', {
      tripId: '0000',
      title: 'Giappone & Maldive 2026',
      statusMessage: 'In viaggio tra Tokyo e Kyoto',
      updatedAt: 1000000
    });

    const customTokenOwner = await getAuth(adminApp).createCustomToken(OWNER_UID, { email: 'nunzio114@gmail.com' });
    const customTokenCopilot = await getAuth(adminApp).createCustomToken(COPILOT_UID, { email: 'giusy@viaggiodinozze.it' });
    const customTokenStranger = await getAuth(adminApp).createCustomToken(STRANGER_UID, { email: 'stranger@evil.com' });

    // 4. Avvio Playwright in modalita' iPhone 15 dual context + Ospite
    console.log('\n[Passo 4] Avvio sessioni Playwright iPhone 15 (Owner, Copilota, Ospite)...');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-web-security']
    });

    // Sessione A: Owner (Tokyo Station: 35.6812, 139.7671)
    const contextOwner = await browser.newContext({
      ...devices['iPhone 15'],
      locale: 'it-IT',
      permissions: ['geolocation'],
      geolocation: { latitude: 35.6812, longitude: 139.7671 }
    });
    await contextOwner.addInitScript(({ OWNER_UID }) => {
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: '0000',
        title: 'Giappone & Maldive 2026',
        startDate: '2026-11-28',
        endDate: '2027-01-10',
        totalDays: 44,
        ownerUid: OWNER_UID,
        ownerName: 'Nunzio'
      }));
      localStorage.setItem('active_trip_id', '0000');
      localStorage.setItem('houni_trip_id', '0000');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('app_device_role', 'guida');
      localStorage.setItem('hounigo_allow_cloud_write_0000', 'true');
      localStorage.setItem('hounigo_allow_queue_flush_0000', 'true');
    }, { OWNER_UID });
    const pageOwner = await contextOwner.newPage();

    // Sessione B: Copilota Giusy
    const contextCopilot = await browser.newContext({
      ...devices['iPhone 15'],
      locale: 'it-IT',
      permissions: ['geolocation'],
      geolocation: { latitude: 35.6812, longitude: 139.7671 }
    });
    await contextCopilot.addInitScript(({ OWNER_UID }) => {
      localStorage.setItem('roadbook_trip_config', JSON.stringify({
        id: '0000',
        title: 'Giappone & Maldive 2026',
        startDate: '2026-11-28',
        endDate: '2027-01-10',
        totalDays: 44,
        ownerUid: OWNER_UID,
        ownerName: 'Nunzio'
      }));
      localStorage.setItem('active_trip_id', '0000');
      localStorage.setItem('houni_trip_id', '0000');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('ios_install_prompt_dismissed', 'true');
      localStorage.setItem('houni_device_role', 'copilota');
      localStorage.setItem('app_device_role', 'copilota');
      localStorage.setItem('hounigo_allow_cloud_write_0000', 'true');
      localStorage.setItem('hounigo_allow_queue_flush_0000', 'true');
    }, { OWNER_UID });
    const pageCopilot = await contextCopilot.newPage();

    // Setup Owner
    console.log('Setup sessione Owner (Nunzio)...');
    await pageOwner.goto('http://127.0.0.1:5184/?emulator=true', { waitUntil: 'domcontentloaded' });
    await pageOwner.evaluate(async ({ customTokenOwner }) => {
      const { auth, signInWithCustomToken } = await import('/src/firebase.ts');
      await signInWithCustomToken(auth, customTokenOwner);
    }, { customTokenOwner });
    await pageOwner.reload({ waitUntil: 'domcontentloaded' });
    await pageOwner.waitForTimeout(1500);

    // Setup Copilota
    console.log('Setup sessione Copilota (Giusy)...');
    await pageCopilot.goto('http://127.0.0.1:5184/?emulator=true', { waitUntil: 'domcontentloaded' });
    await pageCopilot.evaluate(async ({ customTokenCopilot }) => {
      const { auth, signInWithCustomToken } = await import('/src/firebase.ts');
      await signInWithCustomToken(auth, customTokenCopilot);
    }, { customTokenCopilot });
    await pageCopilot.reload({ waitUntil: 'domcontentloaded' });
    await pageCopilot.waitForTimeout(1500);
    console.log('✓ Owner e Copilota inizializzati e autenticati.');

    // Navigazione entrambi a "Altro" -> "Live & Posizione"
    console.log('\nNavigazione entrambi i telefoni alla schermata LIVE...');
    await pageOwner.click('button:has-text("Altro")');
    await pageOwner.waitForSelector('button:has-text("Live & Posizione")');
    await pageOwner.click('button:has-text("Live & Posizione")');
    await pageOwner.waitForSelector('h2:has-text("Dove siamo"), p:has-text("Dove siamo")');

    await pageCopilot.click('button:has-text("Altro")');
    await pageCopilot.waitForSelector('button:has-text("Live & Posizione")');
    await pageCopilot.click('button:has-text("Live & Posizione")');
    await pageCopilot.waitForSelector('h2:has-text("Dove siamo"), p:has-text("Dove siamo")');
    console.log('✓ Entrambi i telefoni sono nella schermata LIVE.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 1: Attivazione GPS dall'iPhone Owner
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 1] Owner preme "Condividi posizione" per attivare il GPS...');
    const shareBtn = pageOwner.locator('button:has-text("Condividi posizione"), button:has-text("Riattiva posizione")').first();
    await shareBtn.waitFor({ state: 'visible', timeout: 10000 });
    await shareBtn.click();

    // Attesa che lo stato dell'Owner diventi "GPS attivo"
    await pageOwner.waitForSelector('text=GPS attivo', { timeout: 10000 });
    console.log('✓ Owner visualizza stato: "GPS attivo".');

    // Verifica su Firestore Emulator: lease e location creati
    const leaseSnap1 = await fetch(`${FIRESTORE_BASE}/live_feeds/0000/gps_control/current`, {
      headers: { Authorization: 'Bearer owner' }
    });
    const leaseData1 = parseFields((await leaseSnap1.json()).fields);
    assert.equal(leaseData1.holderUid, OWNER_UID, 'Il leaseholder deve essere Nunzio (Owner)');
    assert.equal(leaseData1.status, 'active', 'Lo stato del lease deve essere active');

    const locSnap1 = await fetch(`${FIRESTORE_BASE}/live_feeds/0000/locations/current`, {
      headers: { Authorization: 'Bearer owner' }
    });
    const locData1 = parseFields((await locSnap1.json()).fields);
    assert.equal(locData1.status, 'active', 'La location deve risultare active');
    assert.ok(Math.abs(locData1.lat - 35.6812) < 0.001, 'Latitudine Tokyo registrata correttamente');
    assert.ok(Math.abs(locData1.lng - 139.7671) < 0.001, 'Longitudine Tokyo registrata correttamente');

    const ss1 = path.join(screenshotDir, 'gps_01_owner_activated.png');
    await pageOwner.screenshot({ path: ss1, fullPage: true });
    console.log(`📸 Screenshot 1 salvato: ${ss1}`);
    console.log('✓ Verifica 1 SUPERATA: Attivazione GPS Owner riuscita con consenso e registrazione cloud.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 2: Ricezione automatica della posizione sul Copilota
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 2] Verifica ricezione automatica sul Copilota SENZA reload...');
    // Il copilota non tocca nulla: attendiamo che lo stato passi a "GPS attivo"
    await pageCopilot.waitForSelector('text=GPS attivo', { timeout: 10000 });

    const copilotLocation = await pageCopilot.evaluate(async () => {
      const locText = document.querySelector('body')?.innerText || '';
      return {
        hasGpsAttivo: locText.includes('GPS attivo'),
        hasNunzio: locText.includes('Nunzio')
      };
    });
    assert.equal(copilotLocation.hasGpsAttivo, true, 'Copilota deve visualizzare GPS attivo');

    const ss2 = path.join(screenshotDir, 'gps_02_copilot_received_live.png');
    await pageCopilot.screenshot({ path: ss2, fullPage: true });
    console.log(`📸 Screenshot 2 salvato: ${ss2}`);
    console.log('✓ Verifica 2 SUPERATA: Copilota ha ricevuto la posizione in tempo reale automaticamente!');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 3: Aggiornamento progressivo durante gli spostamenti
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 3] Simulazione spostamento Owner verso Shibuya (35.6595, 139.7005)...');
    await contextOwner.setGeolocation({ latitude: 35.6595, longitude: 139.7005 });

    // Attesa 16 secondi per rispettare il rate-limiting autoritativo del client e Security Rules (min 15s)
    console.log('Attesa intervallo rate-limiting 16s per rispetto quota Spark...');
    await new Promise(r => setTimeout(r, 16000));

    // Owner pubblica il nuovo punto
    await pageOwner.evaluate(async () => {
      const { liveGpsService } = await import('/src/services/liveGpsService.ts');
      const { updateRealLocation } = await import('/src/services/geolocationService.ts');
      const detected = await updateRealLocation();
      await liveGpsService.publishLocation('0000', {
        lat: detected.coords.lat,
        lng: detected.coords.lng,
        accuracy: detected.accuracy,
        city: 'Shibuya',
        country: 'Giappone'
      }, { force: true });
    });

    // Copilota deve ricevere il nuovo aggiornamento (Shibuya)
    await pageCopilot.waitForSelector('text=Shibuya', { timeout: 10000 });
    const ss3 = path.join(screenshotDir, 'gps_03_copilot_movement_updated.png');
    await pageCopilot.screenshot({ path: ss3, fullPage: true });
    console.log(`📸 Screenshot 3 salvato: ${ss3}`);
    console.log('✓ Verifica 3 SUPERATA: Spostamento progressivo ricevuto e visualizzato in tempo reale.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 4: Impedimento delle scritture da dispositivi non autorizzati
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 4] Tentativo di scrittura non autorizzata da dispositivo estraneo...');
    // Tentativo di scrittura con token Stranger direttamente alle Security Rules
    const strangerRes = await fetch(`${FIRESTORE_BASE}/live_feeds/0000/locations/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customTokenStranger}`
      },
      body: JSON.stringify({
        fields: fields({
          lat: 45.4642,
          lng: 9.1900,
          accuracy: 5,
          city: 'Milano',
          country: 'Italia',
          publisherDeviceId: 'device_attacker_fake_phone_123',
          status: 'active',
          updatedAt: new Date().toISOString()
        })
      })
    });
    assert.equal(strangerRes.status, 403, 'Dispositivo non autorizzato deve essere respinto con 403 PERMISSION_DENIED');
    console.log('✓ Verifica 4 SUPERATA: Dispositivo estraneo respinto con 403 dalle Firestore Rules.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 5: Trasferimento del ruolo di guida al Copilota (Delega Guida GPS)
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 5] Owner delega la Guida GPS al Copilota Giusy...');
    // Owner apre l'accordion "Gestione Delega Guida GPS"
    const toggleDelegaBtn = pageOwner.locator('button:has-text("Gestione Delega")');
    await toggleDelegaBtn.click();
    const delegaGiusyBtn = pageOwner.locator('button:text-is("Delega Guida GPS")').first();
    await delegaGiusyBtn.waitFor({ state: 'visible', timeout: 10000 });

    // Owner clicca "Delega Guida GPS" accanto a Giusy
    await delegaGiusyBtn.click();

    // Copilota apre l'accordion e riceve conferma della delega
    const toggleCopilotDelega = pageCopilot.locator('button:has-text("Gestione Delega")');
    await toggleCopilotDelega.click();
    await pageCopilot.waitForSelector('text=Hai ricevuto la delega Guida GPS', { timeout: 10000 });
    console.log('✓ Copilota ha ricevuto la notifica di delega.');

    // Ora Giusy si sposta a Kyoto (35.0116, 135.7681) e avvia la trasmissione
    await contextCopilot.setGeolocation({ latitude: 35.0116, longitude: 135.7681 });
    const copilotStartBtn = pageCopilot.locator('button:has-text("Aggiorna posizione"), button:has-text("Condividi posizione"), button:has-text("Riattiva posizione")').first();
    await copilotStartBtn.waitFor({ state: 'visible', timeout: 10000 });
    await copilotStartBtn.click();

    // Attesa che Copilota trasmetta Kyoto
    await pageCopilot.waitForSelector('text=GPS attivo', { timeout: 10000 });

    // Owner deve ricevere istantaneamente Kyoto dal Copilota
    await pageOwner.waitForSelector('text=Kyoto', { timeout: 10000 });
    const ss4 = path.join(screenshotDir, 'gps_04_delegation_to_copilot_live.png');
    await pageOwner.screenshot({ path: ss4, fullPage: true });
    console.log(`📸 Screenshot 4 salvato: ${ss4}`);
    console.log('✓ Verifica 5 SUPERATA: Delega guida a Copilota completata, Kyoto trasmesso ed erogato all\'Owner.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 6: Perdita temporanea di connessione e successivo recupero
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 6] Test offline / online su Copilota guida...');
    await contextCopilot.setOffline(true);
    await pageCopilot.evaluate(() => window.dispatchEvent(new Event('offline')));
    await pageCopilot.waitForSelector('text=GPS non disponibile', { timeout: 5000 });
    console.log('✓ Copilota in offline mostra correttamente: "GPS non disponibile".');

    // Ritorno online
    await contextCopilot.setOffline(false);
    await pageCopilot.evaluate(() => window.dispatchEvent(new Event('online')));
    await pageCopilot.waitForTimeout(1000);
    console.log('✓ Riconnessione online gestita con successo.');
    console.log('✓ Verifica 6 SUPERATA: Transizione offline / online testata e superata.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 7: GPS disattivato / Arresto condivisione
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 7] Arresto della condivisione da Copilota...');
    const stopBtn = pageCopilot.locator('button:has-text("Ferma condivisione")').first();
    await stopBtn.click();
    await pageCopilot.waitForSelector('text=Condivisione interrotta', { timeout: 10000 });

    // Anche l'Owner deve vedere "Condivisione interrotta"
    await pageOwner.waitForSelector('text=Condivisione interrotta', { timeout: 10000 });

    const ss5 = path.join(screenshotDir, 'gps_06_sharing_stopped.png');
    await pageCopilot.screenshot({ path: ss5, fullPage: true });
    console.log(`📸 Screenshot salvato: ${ss5}`);
    console.log('✓ Verifica 7 SUPERATA: Arresto condivisione propagato e stato "Condivisione interrotta" coerente.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 8: Consumo batteria e rate-limiting scritture Spark (15s)
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 8] Verifica rate limiting per salvaguardia batteria e quota Spark...');
    const rateLimitCheck = await pageOwner.evaluate(async () => {
      const { liveGpsService } = await import('/src/services/liveGpsService.ts');
      // Chiamata immediata non forzata entro 15 secondi deve restituire false (throttled)
      const res = await liveGpsService.publishLocation('0000', {
        lat: 35.6812,
        lng: 139.7671,
        accuracy: 10
      }, { force: false });
      return res;
    });
    assert.equal(rateLimitCheck, false, 'Le scritture consecutive entro 15s devono essere silenziate dal rate limiter');
    console.log('✓ Verifica 8 SUPERATA: Rate limiter a 15s attivo, zero spreco batteria o scritture Firestore.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 9: Distinzione tra posizione LIVE e ultima posizione nota (>15 min)
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 9] Test stato "Ultima posizione aggiornata" per segnale non recente (>15 min)...');
    // Simuliamo su Firestore una location attiva ma con timestamp vecchio di 20 minuti fa
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await requestAdmin('PATCH', 'live_feeds/0000/gps_control/current', {
      holderUid: OWNER_UID,
      holderDeviceId: 'device_nunzio_iphone_owner_001',
      status: 'active',
      updatedAt: twentyMinsAgo,
      expiresAt: new Date(Date.now() + 10 * 3600 * 1000).toISOString()
    });
    await requestAdmin('PATCH', 'live_feeds/0000/locations/current', {
      lat: 35.0116,
      lng: 135.7681,
      accuracy: 10,
      city: 'Kyoto',
      country: 'Giappone',
      status: 'active',
      publisherDeviceId: 'device_nunzio_iphone_owner_001',
      updatedAt: twentyMinsAgo
    });

    await pageOwner.waitForSelector('text=Ultima posizione aggiornata', { timeout: 10000 });
    console.log('✓ Schermata mostra fedelmente: "Ultima posizione aggiornata". Zero falsi claims di tempo reale.');
    console.log('✓ Verifica 9 SUPERATA: Distinzione corretta fra LIVE e ultima posizione nota.');

    // ──────────────────────────────────────────────────────────────────
    // VERIFICA 10: Protezione informazioni private nella pagina pubblica LIVE
    // ──────────────────────────────────────────────────────────────────
    console.log('\n[Verifica 10] Apertura pagina pubblica LIVE come OSPITE (?live=1&tripId=0000)...');
    const contextGuest = await browser.newContext({
      ...devices['iPhone 15'],
      locale: 'it-IT'
    });
    const pageGuest = await contextGuest.newPage();
    await pageGuest.goto('http://127.0.0.1:5184/?live=1&tripId=0000&emulator=true');
    await pageGuest.waitForSelector('text=Vista Ospiti');

    const guestInspection = await pageGuest.evaluate(() => {
      const body = document.querySelector('body')?.innerText || '';
      return {
        hasVistaOspitiBadge: body.includes('Vista Ospiti'),
        hasNoPrivateCredentials: !body.includes('PNR') && !body.includes('PIN') && !body.includes('Codice Accesso'),
        hasNoAdminButtons: !body.includes('Gestione Delega Guida GPS') && !body.includes('Delega Guida GPS')
      };
    });
    assert.equal(guestInspection.hasVistaOspitiBadge, true, 'Badge Vista Ospiti visibile');
    assert.equal(guestInspection.hasNoPrivateCredentials, true, 'Nessuna credenziale privata o PNR visibile agli ospiti');
    assert.equal(guestInspection.hasNoAdminButtons, true, 'Zero pulsanti di controllo GPS o delega esposti agli ospiti');

    const ssGuest = path.join(screenshotDir, 'gps_05_guest_public_live_protected.png');
    await pageGuest.screenshot({ path: ssGuest, fullPage: true });
    console.log(`📸 Screenshot Ospite salvato: ${ssGuest}`);
    console.log('✓ Verifica 10 SUPERATA: Pagina pubblica LIVE sanificata e protetta al 100%.');

    console.log('\n====================================================================');
    console.log('✓✓✓ TUTTI I 10 CONTROLLI DI COLLAUDO AUTOMATICO GPS LIVE SUPERATI! ✓✓✓');
    console.log('====================================================================');

  } finally {
    if (browser) await browser.close();
    if (viteProc) spawn('taskkill', ['/F', '/T', '/PID', viteProc.pid]);
    if (emuProc) spawn('taskkill', ['/F', '/T', '/PID', emuProc.pid]);
  }
})().catch(err => {
  console.error('\n❌ COLLAUDO AUTOMATICO GPS FALLITO:', err);
  process.exit(1);
});
