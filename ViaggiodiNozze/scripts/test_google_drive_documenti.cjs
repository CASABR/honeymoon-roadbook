const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(root, 'test-drive-docs-temp-'));
const deadline = setTimeout(() => {
  console.error('FAIL: Test Google Drive Documenti superato limite di 60s');
  process.exit(1);
}, 60000);

// Fixture isolata con viaggio sintetico
fs.writeFileSync(path.join(fixture, 'index.html'), `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body class="bg-slate-50">
  <div id="root"></div>
  <script>
    localStorage.setItem('roadbook_trip_config', JSON.stringify({
      id: 'synthetic-drive-trip',
      title: 'Viaggio Test Drive',
      startDate: '2026-11-28',
      endDate: '2027-01-12'
    }));
    localStorage.setItem('houni_device_role', 'guida');
    localStorage.setItem('app_device_role', 'guida');
    sessionStorage.setItem('houni_dev_simulated_role', 'owner');
  </script>
  <script type="module" src="./fixture.tsx"></script>
</body>
</html>
`);

fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import DocumentiView from '/src/views/altro/DocumentiView';
import { storageService } from '/src/storage/storageService';
import { parseGoogleDriveUrl, getGooglePickerConfigStatus } from '/src/services/googlePickerService';

window.driveTestApi = {
  storageService,
  parseGoogleDriveUrl,
  getGooglePickerConfigStatus,
  getDocuments: () => storageService.getDocuments()
};

function App() {
  return (
    <div className="max-w-xl mx-auto p-4 min-h-screen">
      <DocumentiView onBack={() => {}} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
`);

(async () => {
  let server;
  let browser;

  try {
    const { createServer } = await import('vite');
    server = await createServer({
      root,
      server: { host: '127.0.0.1', port: 5195, strictPort: true },
      logLevel: 'error'
    });
    await server.listen();

    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 430, height: 932 }, // iPhone Viewport
      serviceWorkers: 'block'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    const fixtureUrl = `http://127.0.0.1:5195/${path.basename(fixture)}/index.html`;
    await page.goto(fixtureUrl);
    await page.waitForLoadState('networkidle');

    // 1. TEST UNITARIO LOGICA URL & PARSING
    console.log('[TEST 1] Verifica parsing e validazione link Google Drive...');
    const parseResults = await page.evaluate(() => {
      const api = window.driveTestApi;
      return {
        file: api.parseGoogleDriveUrl('https://drive.google.com/file/d/1AbC_12345XYZ/view?usp=sharing'),
        docs: api.parseGoogleDriveUrl('https://docs.google.com/document/d/2Doc_98765/edit'),
        folder: api.parseGoogleDriveUrl('https://drive.google.com/drive/folders/3Folder_ABC'),
        invalidProtocol: api.parseGoogleDriveUrl('http://drive.google.com/file/d/123'),
        invalidDomain: api.parseGoogleDriveUrl('https://malicious-site.com/file/d/123'),
        empty: api.parseGoogleDriveUrl('')
      };
    });

    assert.equal(parseResults.file.isValid, true, 'File Drive valido');
    assert.equal(parseResults.file.fileId, '1AbC_12345XYZ', 'ID file estratto');
    assert.equal(parseResults.file.isFolder, false, 'Non è cartella');

    assert.equal(parseResults.docs.isValid, true, 'Google Docs valido');
    assert.equal(parseResults.docs.fileId, '2Doc_98765', 'ID doc estratto');

    assert.equal(parseResults.folder.isValid, true, 'Cartella Drive valida');
    assert.equal(parseResults.folder.isFolder, true, 'È cartella');
    assert.equal(parseResults.folder.fileId, '3Folder_ABC', 'ID cartella estratto');

    assert.equal(parseResults.invalidProtocol.isValid, false, 'Blocco http insicuro');
    assert.equal(parseResults.invalidDomain.isValid, false, 'Blocco dominio estraneo');
    assert.equal(parseResults.empty.isValid, false, 'Blocco stringa vuota');
    console.log('✓ TEST 1 Superato: parsing URL, domini consentiti e protocolli sicuri corretti.');

    // 2. TEST STATO GOOGLE PICKER
    console.log('[TEST 2] Rilevamento stato configurazione Google Picker...');
    const pickerStatus = await page.evaluate(() => {
      const api = window.driveTestApi;
      return api.getGooglePickerConfigStatus();
    });
    assert.equal(typeof pickerStatus.isConfigured, 'boolean', 'isConfigured booleano');
    assert.equal(Array.isArray(pickerStatus.missingConfigs), true, 'missingConfigs è un array');
    assert.equal(
      pickerStatus.isConfigured,
      pickerStatus.missingConfigs.length === 0,
      'Coerenza stato Picker: isConfigured deve corrispondere all’assenza di configurazioni mancanti'
    );
    console.log(
      pickerStatus.isConfigured
        ? '✓ TEST 2 Superato: Google Picker configurato correttamente nell’ambiente corrente.'
        : `✓ TEST 2 Superato: Google Picker rileva correttamente credenziali mancanti (${pickerStatus.missingConfigs.join(', ')}).`
    );

    // 3. TEST AGGIUNTA DOCUMENTO GOOGLE DRIVE VIA UI
    console.log('[TEST 3] Apertura modale ed inserimento documento Drive via interfaccia...');
    const addDriveBtn = page.getByRole('button', { name: /Aggiungi da Google Drive|Scegli da Google Drive/i });
    await assert.doesNotReject(addDriveBtn.waitFor({ state: 'visible' }), 'Pulsante Google Drive presente');
    await addDriveBtn.click();

    // Verifica campi modale
    const modalHeading = page.getByText(/Collega da Google Drive/i);
    await modalHeading.waitFor({ state: 'visible' });

    const manualBtn = page.getByRole('button', { name: /Oppure inserisci il link manualmente/i });
    if (pickerStatus.isConfigured) {
      await manualBtn.waitFor({ state: 'visible' });
      await manualBtn.click();
    }

    // Seleziona categoria "Biglietti & Voucher"
    const catBtn = page.getByRole('button', { name: /Biglietti & Voucher/i });
    await catBtn.click();

    // Compila nome documento
    const titleInput = page.getByPlaceholder(/Es. Biglietti Volo/i);
    await titleInput.fill('Voucher Traghetto Kangaroo Island');

    // Compila URL Drive valido
    const urlInput = page.getByPlaceholder(/https:\/\/drive\.google\.com/i);
    await urlInput.fill('https://drive.google.com/file/d/KI_FERRY_2026/view?usp=sharing');

    // Compila note
    const notesInput = page.getByPlaceholder(/Es. Codice PNR/i);
    await notesInput.fill('Conferma imbarco veicolo e 2 passeggeri');

    // Salva
    const saveBtn = page.getByRole('button', { name: /Salva collegamento/i });
    await saveBtn.click();

    // Verifica presenza della card salvata
    const savedCard = page.locator('div.rounded-3xl').filter({ hasText: 'Voucher Traghetto Kangaroo Island' }).first();
    await savedCard.waitFor({ state: 'visible' });
    console.log('✓ TEST 3 Superato: Modale Drive completato e card salvata con successo.');

    // 4. TEST BADGE, APERTURA ED ELEMENTI DELLA CARD DRIVE
    console.log('[TEST 4] Controllo badge Google Drive e pulsante "Apri su Drive ↗"...');
    const driveBadge = savedCard.getByText('Google Drive', { exact: true });
    await driveBadge.waitFor({ state: 'visible' });

    const openDriveBtn = savedCard.getByRole('button', { name: /Apri su Drive/i });
    await openDriveBtn.waitFor({ state: 'visible' });

    // Clic su "Apri su Drive": deve tentare l'apertura protetta in nuova scheda
    const popupPromise = page.waitForEvent('popup');
    await openDriveBtn.click();
    const popup = await popupPromise;
    assert.equal(popup.url(), 'https://drive.google.com/file/d/KI_FERRY_2026/view?usp=sharing', 'URL aperto combacia');
    await popup.close();
    console.log('✓ TEST 4 Superato: Badge e pulsante apertura rapida su Drive con target protetto funzionanti.');

    // 5. TEST PERSISTENZA DOPO RICARICAMENTO
    console.log('[TEST 5] Verifica persistenza storage IndexedDB dopo reload...');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const reloadedDocs = await page.evaluate(async () => {
      const api = window.driveTestApi;
      const docs = await api.getDocuments();
      return docs.find((d) => d.title === 'Voucher Traghetto Kangaroo Island');
    });

    assert.ok(reloadedDocs, 'Documento presente in IndexedDB dopo reload');
    assert.equal(reloadedDocs.source, 'google_drive', 'Fonte documento è google_drive');
    assert.equal(reloadedDocs.driveUrl, 'https://drive.google.com/file/d/KI_FERRY_2026/view?usp=sharing');
    assert.equal(reloadedDocs.driveFileId, 'KI_FERRY_2026');
    assert.equal(reloadedDocs.category, 'attivita');
    console.log('✓ TEST 5 Superato: Persistenza IndexedDB con metadati Google Drive confermata.');

    // 6. TEST MODIFICA DOCUMENTO DRIVE
    console.log('[TEST 6] Modifica del documento Google Drive...');
    const cardToEdit = page.locator('div.rounded-3xl').filter({ hasText: 'Voucher Traghetto Kangaroo Island' }).first();
    const editBtn = cardToEdit.getByRole('button', { name: /Modifica/i });
    await editBtn.click();

    const editHeading = page.getByText(/Modifica Documento Google Drive/i);
    await editHeading.waitFor({ state: 'visible' });

    const editTitle = page.getByPlaceholder(/Es. Biglietti Volo/i);
    await editTitle.fill('Voucher Traghetto Kangaroo Island (Confermato)');
    await page.getByRole('button', { name: /Aggiorna collegamento/i }).click();

    await page.waitForTimeout(500);
    const updatedCard = page.locator('div.rounded-3xl').filter({ hasText: 'Voucher Traghetto Kangaroo Island (Confermato)' }).first();
    await updatedCard.waitFor({ state: 'visible' });
    console.log('✓ TEST 6 Superato: Modifica del collegamento Drive salvata correttamente.');

    // 7. TEST ELIMINAZIONE SENZA TOCCARE DRIVE
    console.log('[TEST 7] Rimozione collegamento con messaggio di conferma non distruttivo...');
    const deleteBtn = updatedCard.getByRole('button', { name: /Elimina/i });
    await deleteBtn.click();

    // Dialog di conferma con avviso che il file su Drive non viene toccato
    const confirmTitle = page.getByText(/Rimuovi Collegamento Drive/i);
    await confirmTitle.waitFor({ state: 'visible' });

    const confirmMessage = page.getByText(/Il file o la cartella originale sul tuo Google Drive non verrà modificata né eliminata/i);
    await confirmMessage.waitFor({ state: 'visible' });

    const confirmBtn = page.getByRole('button', { name: /Rimuovi/i });
    await confirmBtn.click();

    await page.waitForTimeout(500);
    const remainingCount = await page.evaluate(async () => {
      const api = window.driveTestApi;
      const docs = await api.getDocuments();
      return docs.filter((d) => d.driveFileId === 'KI_FERRY_2026').length;
    });
    assert.equal(remainingCount, 0, 'Documento rimosso dallo storage locale');
    console.log('✓ TEST 7 Superato: Rimozione collegamento completata con salvaguardia del file originale su Drive.');

    // 8. TEST PRIVACY FIRESTORE RULES
    console.log('[TEST 8] Verifica regole di sicurezza e isolamento documenti...');
    const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
    assert.match(
      firestoreRules,
      /match \/documenti\/\{docId\}\s*\{\s*allow read, write:\s*if isTripPrivilegedMember\(tripId\);/,
      'La collezione documenti è protetta da isTripPrivilegedMember (riservata a Owner e Copilota)'
    );
    // Controllo che i documenti non siano nella lista subcol aperta ai membri generici o live
    assert.ok(
      !firestoreRules.match(/allow read: if subcol in \[[\s\S]*?'documenti'[\s\S]*?\]/),
      'Documenti non compare tra le collezioni accessibili ai viewer generici o live'
    );
    console.log('✓ TEST 8 Superato: Firestore Rules proteggono rigidamente i documenti per il solo viaggio autorizzato.');

    console.log('\n======================================================');
    console.log('TUTTI GLI 8 TEST GOOGLE DRIVE DOCUMENTI SUPERATI!');
    console.log('======================================================');

  } finally {
    clearTimeout(deadline);
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    try {
      fs.rmSync(fixture, { recursive: true, force: true });
    } catch {}
  }
})();
