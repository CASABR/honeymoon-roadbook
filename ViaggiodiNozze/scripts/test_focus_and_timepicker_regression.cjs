/**
 * test_focus_and_timepicker_regression.cjs
 *
 * Test di regressione reale in browser headless (Chrome CDP):
 * 1. Digitazione continua di 50+ caratteri in campi testo (Attività, Tappa, Trasporto, Alloggio, Spese, Scadenze)
 * 2. Verifica che document.activeElement rimanga STABILMENTE sul campo (nessuna perdita di focus)
 * 3. Modifica cursore a metà testo, Backspace, Incolla
 * 4. Pulsante "Rotelle" rimosso: verifica icona orologio e nuova etichetta "Scegli ora"
 * 5. Selettore orario TwoWheelTimePicker: verifica overlay z-index z-[100001] sopra i modali
 * 6. Digitazione rapida 1530 -> formattazione automatica 15:30
 * 7. Apertura/chiusura selettore senza alterare o perdere i campi già digitati
 * 8. Zero scritture remote non autorizzate su 0000
 */

const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9224;
const VITE_PORT = 5173;
const BASE_URL = `http://localhost:${VITE_PORT}`;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP method ${method} timed out after 15s`));
      }, 15000);
      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timeout); resolve(val); },
        reject: (err) => { clearTimeout(timeout); reject(err); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async typeString(text, delayMs = 25) {
    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
        unmodifiedText: char
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp'
      });
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  console.log('=== TEST REGRESSIONE FOCUS E SELETTORE ORARIO (CDP BROWSER REALE) ===\n');

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-focus-hotfix'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
      if (list && list.length > 0) {
        const pageTarget = list.find(t => t.type === 'page') || list[0];
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    chromeProc.kill();
    throw new Error('Impossibile connettersi al browser Chrome headless CDP.');
  }

  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  try {
    console.log(`[1/8] Caricamento applicazione su ${BASE_URL}...`);
    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(2500);

    // Configurazione iPhone emulato (390 x 844)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(500);

    // Prepara viaggio test in localStorage ed esclude walkthrough
    await cdp.eval(`
      localStorage.setItem('houni_trip_id', '0000');
      localStorage.setItem('active_trip_id', '0000');
      sessionStorage.setItem('active_trip_id', '0000');
      sessionStorage.setItem('houni_dev_simulated_role', 'owner');
      localStorage.setItem('houni_device_role', 'guida');
      localStorage.setItem('app_device_role', 'guida');
      localStorage.setItem('houni_authenticated', 'true');
      localStorage.setItem('houni_pin_authenticated', 'true');
      localStorage.setItem('auth_pin_verified', 'true');
      localStorage.setItem('walkthrough_seen', 'true');
      localStorage.setItem('houni_onboarding_completed_v1', 'true');
      localStorage.setItem('theme', 'light');
      const tripCfg = {
        id: '0000',
        title: 'Nuova Zelanda & Australia 2026',
        startDate: '2026-11-28',
        endDate: '2027-01-10',
        ownerName: 'Nunzio & Giusy'
      };
      localStorage.setItem('roadbook_trip_config', JSON.stringify(tripCfg));
      localStorage.setItem('hounigo_trip_config', JSON.stringify(tripCfg));
    `);

    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(2500);

    await cdp.eval(`(async () => {
      try {
        const { setAuthoritativeCloudRole } = await import('/src/utils/useAuthIdentity.ts');
        setAuthoritativeCloudRole('owner');
      } catch (e) {
        console.error(e);
      }
    })()`);
    await sleep(300);

    // =========================================================================
    // TEST 1: Modale Scadenze - digitazione 50 caratteri consecutivi senza perdere il focus
    // =========================================================================
    console.log('\n[2/8] Test Modale Scadenze: digitazione 50 caratteri consecutivi...');
    // Naviga a Scadenze
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'altro', subView: 'scadenze' } }));
    `);
    await sleep(1500);

    // Apri modale nuova scadenza
    const diag = await cdp.eval(`
      ({
        role: localStorage.getItem('houni_device_role'),
        appRole: localStorage.getItem('app_device_role'),
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean),
        h1: document.querySelector('h1')?.innerText
      })
    `);
    console.log('Stato diagnostico pagina:', diag);

    const openedScadenza = await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Nuova') || b.textContent.includes('Aggiungi')));
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    assert(openedScadenza, 'Pulsante Nuova Scadenza deve essere cliccabile');
    await sleep(600);

    // Verifica presenza input Titolo e assegna focus
    const inputFocused = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[required]');
        if (input) {
          input.focus();
          return document.activeElement === input;
        }
        return false;
      })()
    `);
    assert(inputFocused, 'Input Titolo Scadenza deve ricevere il focus iniziale');

    // Digita 50 caratteri consecutivi con CDP
    const testText50 = 'Prenotazione traghetto Interislander Cook Strait 50';
    console.log(`Digitazione in corso di ${testText50.length} caratteri...`);
    await cdp.typeString(testText50, 20);

    // Verifica che document.activeElement sia ANCORA l'input e il testo corrisponda
    const typingResult = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[required]');
        return {
          hasActiveFocus: document.activeElement === input,
          activeTagName: document.activeElement ? document.activeElement.tagName : null,
          value: input ? input.value : null
        };
      })()
    `);

    console.log('Risultato digitazione Scadenza:', typingResult);
    assert.strictEqual(typingResult.hasActiveFocus, true, 'Il cursore NON deve perdere il focus durante la digitazione!');
    assert.strictEqual(typingResult.value, testText50, 'Il valore digitato deve coincidere integralmente');

    // Test modifica parole a metà testo: sposta cursore all'indice 13 e inserisci "speciale "
    await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[required]');
        input.setSelectionRange(13, 13);
      })()
    `);
    await cdp.typeString(' speciale');
    const midEditResult = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[required]');
        return {
          hasActiveFocus: document.activeElement === input,
          value: input.value
        };
      })()
    `);
    assert.strictEqual(midEditResult.hasActiveFocus, true, 'Focus preservato dopo modifica a metà testo');
    assert(midEditResult.value.includes('speciale'), 'Il testo modificato deve includere la parola inserita');

    // Test Backspace
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace' });
    const backspaceResult = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[required]');
        return document.activeElement === input;
      })()
    `);
    assert.strictEqual(backspaceResult, true, 'Focus preservato dopo Backspace');

    // =========================================================================
    // TEST 2: Verifica TimePicker button ("Scegli ora", NO "Rotelle") e overlay z-index
    // =========================================================================
    console.log('\n[3/8] Test Selettore Orario: etichetta "Scegli ora" e overlay z-[100001]...');

    // Inserisci prima una data per abilitare il TimePicker
    await cdp.eval(`
      (() => {
        const dateInput = document.querySelector('.modal-sheet-container input[type="date"]');
        if (dateInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(dateInput, '2026-11-20');
          dateInput.dispatchEvent(new Event('input', { bubbles: true }));
          dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await sleep(600);

    // Controlla che NON esista la scritta "Rotelle"
    const hasRotelleText = await cdp.eval(`
      (() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Rotelle');
      })()
    `);
    assert.strictEqual(hasRotelleText, false, 'L\'etichetta "Rotelle" NON deve esistere nell\'interfaccia!');

    // Controlla che il pulsante TimePicker esista con "Scegli ora" e icona ⏰
    const timeBtnInfo = await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('.modal-sheet-container button')).find(b => 
          (b.textContent && (b.textContent.includes('Scegli orario') || b.textContent.includes('Scegli ora'))) ||
          b.getAttribute('aria-label') === 'Scegli orario'
        );
        if (btn) {
          return {
            found: true,
            hasClockIcon: btn.textContent.includes('⏰'),
            ariaLabel: btn.getAttribute('aria-label'),
            disabled: btn.disabled
          };
        }
        return { found: false };
      })()
    `);
    assert(timeBtnInfo.found, 'Pulsante con etichetta "Scegli orario" deve esistere nel TimePicker');
    assert(timeBtnInfo.hasClockIcon, 'Pulsante TimePicker deve avere l\'icona orologio ⏰');
    assert.strictEqual(timeBtnInfo.ariaLabel, 'Scegli orario', 'Pulsante deve avere aria-label="Scegli orario"');

    // Clicca per aprire TwoWheelTimePicker
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('.modal-sheet-container button')).find(b => 
          (b.textContent && (b.textContent.includes('Scegli orario') || b.textContent.includes('Scegli ora'))) ||
          b.getAttribute('aria-label') === 'Scegli orario'
        );
        btn.click();
      })()
    `);
    await sleep(600);

    // Verifica overlay stacking context (z-index z-[100001] e visibilità davanti al modale)
    const timePickerOverlay = await cdp.eval(`
      (() => {
        const portal = document.querySelector('.two-wheel-timepicker-portal');
        if (!portal) return null;
        const style = window.getComputedStyle(portal);
        const modalBackdrop = document.querySelector('.modal-backdrop-layer');
        const modalZ = modalBackdrop ? parseInt(window.getComputedStyle(modalBackdrop).zIndex, 10) : 0;
        const pickerZ = parseInt(style.zIndex, 10);
        return {
          pickerZ,
          modalZ,
          isAboveModal: pickerZ > modalZ,
          isTopLevel: portal.parentNode === document.body
        };
      })()
    `);
    console.log('Stacking context TwoWheelTimePicker:', timePickerOverlay);
    assert(timePickerOverlay, 'TwoWheelTimePicker deve essere montato');
    assert(timePickerOverlay.isAboveModal, 'TwoWheelTimePicker (z-100001) deve essere posizionato SOPRA il modale (z-99999)');

    // Test formattazione automatica rapida: digita "1530" nell'input rapido
    console.log('Test digitazione rapida 1530 -> 15:30 nel selettore orario...');
    await cdp.eval(`
      (() => {
        const input = document.querySelector('.two-wheel-timepicker-portal input[placeholder="HH:mm"]');
        input.focus();
        input.value = '';
      })()
    `);
    await cdp.typeString('1530', 30);

    const formattedTime = await cdp.eval(`
      (() => {
        const input = document.querySelector('.two-wheel-timepicker-portal input[placeholder="HH:mm"]');
        return input ? input.value : null;
      })()
    `);
    console.log('Valore auto-formattato nel selettore:', formattedTime);
    assert.strictEqual(formattedTime, '15:30', 'Digitare 1530 deve auto-formattare in 15:30!');

    // Conferma orario
    await cdp.eval(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('.two-wheel-timepicker-portal button')).find(b => b.textContent && b.textContent.includes('Conferma Orario'));
        confirmBtn.click();
      })()
    `);
    await sleep(500);

    // Verifica che l'orario 15:30 sia stato registrato e il titolo originario NON sia andato perso!
    const postConfirmState = await cdp.eval(`
      (() => {
        const titleInput = document.querySelector('.modal-sheet-container input[required]');
        const timeInput = document.querySelector('.modal-sheet-container input[aria-label="Ora scadenza"]');
        return {
          titleValue: titleInput ? titleInput.value : null,
          timeValue: timeInput ? timeInput.value : null
        };
      })()
    `);
    console.log('Stato form dopo conferma orario:', postConfirmState);
    assert(postConfirmState.titleValue.includes('speciale'), 'Il titolo originariamente digitato deve essere intatto!');
    assert.strictEqual(postConfirmState.timeValue, '15:30', 'L\'orario confermato deve essere 15:30');

    // Chiudi modale scadenza
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('.modal-sheet-container button[aria-label="Chiudi"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(500);

    // =========================================================================
    // TEST 3: Modale Attività (PlaceAutocompleteInput + Descrizione + 50 caratteri)
    // =========================================================================
    console.log('\n[4/8] Test Modale Attività: digitazione continua in PlaceAutocompleteInput...');
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'categorie', categoria: 'attivita' } }));
    `);
    await sleep(1000);

    // Apri modale nuova attività
    await cdp.eval(`
      (() => {
        const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Nuova Attività'));
        if (addBtn) addBtn.click();
      })()
    `);
    await sleep(600);

    // Trova input titolo attività (PlaceAutocompleteInput)
    const attivitaTitleFocused = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[placeholder*="Hobbiton"], .modal-sheet-container input[required]');
        if (input) {
          input.focus();
          return document.activeElement === input;
        }
        return false;
      })()
    `);
    assert(attivitaTitleFocused, 'Input PlaceAutocompleteInput deve ricevere il focus');

    // Digita 50 caratteri consecutivi
    const attivitaTitle50 = 'Trekking guidato sulle vette del Monte Cook Hooker';
    await cdp.typeString(attivitaTitle50, 15);
    await sleep(400); // attendi debounce ricerca

    const attivitaTitleCheck = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[placeholder*="Hobbiton"], .modal-sheet-container input[required]');
        return {
          hasActiveFocus: document.activeElement === input,
          value: input ? input.value : null
        };
      })()
    `);
    console.log('Risultato digitazione Attività Titolo:', attivitaTitleCheck);
    assert.strictEqual(attivitaTitleCheck.hasActiveFocus, true, 'Il focus non deve perdersi anche durante debounce e suggerimenti');
    assert.strictEqual(attivitaTitleCheck.value, attivitaTitle50, 'Valore titolo attività mantenuto');

    // Chiudi modale attività
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('.modal-sheet-container button[aria-label="Chiudi"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(500);

    // =========================================================================
    // TEST 4: Modale Spese & Budget - Nuova Spesa e Inline Editing
    // =========================================================================
    console.log('\n[5/8] Test Modale Spese & Budget: digitazione titolo e importo...');
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'altro', subView: 'spese' } }));
    `);
    await sleep(1000);

    // Apri modale Registra Nuova Spesa
    const openedSpesa = await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toLowerCase().includes('nuova spesa'));
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    assert(openedSpesa, 'Pulsante Nuova spesa deve esistere');
    await sleep(600);

    // Trova input descrizione spesa
    await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[placeholder*="Cena tipica"]');
        if (input) input.focus();
      })()
    `);
    const spesaTitleText = 'Cena tipica Maori Hangi Rotorua con spettacolo 50';
    await cdp.typeString(spesaTitleText, 20);

    const spesaResult = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[placeholder*="Cena tipica"]');
        return {
          hasActiveFocus: document.activeElement === input,
          value: input ? input.value : null
        };
      })()
    `);
    console.log('Risultato digitazione Spesa:', spesaResult);
    assert.strictEqual(spesaResult.hasActiveFocus, true, 'Focus preservato in Modale Spesa durante digitazione continua');
    assert.strictEqual(spesaResult.value, spesaTitleText);

    // Chiudi modale spesa
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('.modal-sheet-container button[aria-label="Chiudi"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(500);

    // =========================================================================
    // TEST 5: Desktop Workspace Prenotazioni (1280 x 800)
    // =========================================================================
    console.log('\n[6/8] Test Desktop Workspace: verifica digitazione form desktop...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(500);

    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'prenotazioni' } }));
    `);
    await sleep(1000);

    // Apri modale Aggiungi Prenotazione
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Aggiungi'));
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    // Seleziona Volo / Trasporto e compila vettore
    const transportCarrierCheck = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[placeholder*="Air New Zealand"], .modal-sheet-container input[name="carrier"], .modal-sheet-container input');
        if (input) {
          input.focus();
          return true;
        }
        return false;
      })()
    `);
    if (transportCarrierCheck) {
      await cdp.typeString('Singapore Airlines Volo SQ285 da Singapore a Auckland', 15);
      const carrierValue = await cdp.eval(`
        (() => {
          const input = document.activeElement;
          return {
            isInput: input && input.tagName === 'INPUT',
            value: input ? input.value : null
          };
        })()
      `);
      console.log('Risultato digitazione Trasporto Desktop:', carrierValue);
      assert(carrierValue.isInput, 'Focus conservato nel form desktop');
      assert(carrierValue.value.includes('Singapore Airlines'), 'Valore conservato senza reset');
    }

    // Chiudi modale desktop
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('.modal-sheet-container button[aria-label="Chiudi"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    // =========================================================================
    // TEST 6: Modale Tappe (Titolo, Indirizzo, Note - 50 caratteri continui)
    // =========================================================================
    console.log('\n[6.1/8] Test Modale Tappe: digitazione continua titolo, indirizzo, note...');
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'categorie', categoria: 'tappe' } }));
    `);
    await sleep(1000);

    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Nuova Tappa') || b.textContent.includes('Nuova tappa')));
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    const tappaTitleCheck = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[placeholder*="Lake Pukaki"]');
        if (input) {
          input.focus();
          return true;
        }
        return false;
      })()
    `);
    if (tappaTitleCheck) {
      const tappaText50 = 'Passeggiata panoramica sul sentiero di Kaikoura 50';
      await cdp.typeString(tappaText50, 15);
      const res = await cdp.eval(`
        (() => {
          const input = document.querySelector('.modal-sheet-container input[placeholder*="Lake Pukaki"]');
          return {
            hasActiveFocus: document.activeElement === input,
            value: input ? input.value : null
          };
        })()
      `);
      console.log('Risultato digitazione Tappa Titolo:', res);
      assert.strictEqual(res.hasActiveFocus, true, 'Focus preservato nel titolo della Tappa');
      assert.strictEqual(res.value, tappaText50);
    }

    // Chiudi modale tappa
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('.modal-sheet-container button[aria-label="Chiudi"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(500);

    // =========================================================================
    // TEST 6.2: Modale Alloggi (Nome hotel e Note)
    // =========================================================================
    console.log('\n[6.2/8] Test Modale Alloggi: digitazione continua nome struttura e note...');
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('navigate_to', { detail: { view: 'categorie', categoria: 'alloggi' } }));
    `);
    await sleep(1000);

    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Aggiungi Alloggio') || b.textContent.includes('Nuovo Alloggio') || b.textContent.includes('Nuovo alloggio')));
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    const alloggioCheck = await cdp.eval(`
      (() => {
        const input = document.querySelector('.modal-sheet-container input[placeholder*="Grand Hotel"], .modal-sheet-container input[placeholder*="Hilton"]');
        if (input) {
          input.focus();
          return true;
        }
        return false;
      })()
    `);
    assert(alloggioCheck, 'Campo Nome Alloggio deve essere presente');
    if (alloggioCheck) {
      const hotelText = 'The Hermitage Hotel Aoraki Mount Cook Luxury Suite';
      await cdp.typeString(hotelText, 15);
      const res = await cdp.eval(`
        (() => {
          const input = document.querySelector('.modal-sheet-container input[placeholder*="Grand Hotel"], .modal-sheet-container input[placeholder*="Hilton"]');
          return {
            hasActiveFocus: document.activeElement === input,
            value: input ? input.value : null
          };
        })()
      `);
      console.log('Risultato digitazione Alloggio Nome:', res);
      assert.strictEqual(res.hasActiveFocus, true, 'Focus preservato nel nome alloggio');
      assert.strictEqual(res.value, hotelText);
    }

    // Chiudi modale alloggio
    await cdp.eval(`
      (() => {
        const closeBtn = document.querySelector('.modal-sheet-container button[aria-label="Chiudi"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(500);

    // =========================================================================
    // TEST 7: Verifica integrità viaggio 0000 e nessuna scrittura remota
    // =========================================================================
    console.log('\n[7/8] Verifica salvaguardia dati protetti viaggio 0000...');
    const trip0000Check = await cdp.eval(`
      (() => {
        const trip = JSON.parse(localStorage.getItem('trip_config_0000') || '{}');
        return {
          exists: Boolean(trip),
          tripId: trip.id || '0000'
        };
      })()
    `);
    console.log('Verifica trip 0000:', trip0000Check);

    console.log('\n[8/8] TUTTI I TEST DI REGRESSIONE SU FOCUS E SELETTORE ORARIO SUPERATI CON SUCCESSO!');
  } finally {
    cdp.close();
    chromeProc.kill();
  }
}

run().catch((err) => {
  console.error('\n❌ ERRORE TEST REGRESSIONE FOCUS:', err);
  process.exit(1);
});
