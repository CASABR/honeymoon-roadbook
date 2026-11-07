const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9224;
const ARTIFACT_DIR = 'C:\\Users\\CUSI\\.gemini\\antigravity-ide\\brain\\62bf6247-9ed9-4d56-890b-a2a63fe7702a\\screenshots';
const LOCAL_SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
if (!fs.existsSync(LOCAL_SCREENSHOT_DIR)) fs.mkdirSync(LOCAL_SCREENSHOT_DIR, { recursive: true });

async function sleep(ms) {
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

  close() {
    this.ws.close();
  }
}

// Generiamo una pagina HTML di test con Tailwind CSS via CDN per il rendering fedele
const comparisonHtml = `<!doctype html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>HOUNIGO — Confronto Card</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: '#FF6B5F',
            canvas: '#F8F7F3',
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #F8F7F3; }
    .badge-pill { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem; border-radius: 0.5rem; font-size: 0.6875rem; font-weight: 700; }
  </style>
</head>
<body class="p-4 sm:p-6 text-slate-800">

  <div class="max-w-4xl mx-auto space-y-10">

    <!-- HEADER RIEPILOGATIVO -->
    <div class="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black px-2.5 py-1 rounded-md bg-[#FF6B5F] text-white uppercase tracking-wider">HOUNIGO 1.5.1 UX</span>
        <h1 class="text-lg font-black text-slate-900">Riorganizzazione Card: Spazi Compatti ma 100% Contenuto Operativo</h1>
      </div>
      <p class="text-xs text-slate-500 mt-1">Confronto diretto per ciascuna tipologia: <strong>(1) Prima del Redesign</strong>, <strong>(2) Compatto Recente (con perdite)</strong> e <strong>(3) Nuova Proposta Ottimizzata</strong>.</p>
    </div>

    <!-- 1. VOLO -->
    <section class="space-y-3" id="sec-volo">
      <div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
        <h2 class="text-sm font-extrabold uppercase tracking-wider text-sky-800 flex items-center gap-1.5">
          <span>✈️</span> 1. TRASPORTO — VOLO (Esempio: Qantas QF415 MEL ➔ SYD)
        </h2>
        <span class="text-[11px] font-bold text-slate-400">Card Operativa</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- STATO ATTUALE COMPATTO RECEDE -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              ❌ Compatto Recente (Info perse e pulsanti morti)
            </span>
            <span class="text-[10px] text-slate-400">Altezza: ~70px</span>
          </div>

          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs">
            <div class="flex items-start gap-3">
              <div class="shrink-0 text-left min-w-[56px] pt-0.5">
                <span class="font-mono text-xs sm:text-sm font-extrabold text-slate-900 tabular-nums block">11:30</span>
                <span class="font-mono text-[10px] text-slate-500 font-semibold block mt-0.5">➔ 12:55</span>
              </div>
              <div class="w-px self-stretch bg-slate-100 shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0 truncate">
                    <span class="text-sm shrink-0">✈️</span>
                    <span class="font-bold text-xs text-slate-900 truncate">Qantas (QF415)</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0 text-xs text-slate-400">
                    <span class="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">QF842X</span>
                    <span title="Non cliccabile">🎫</span>
                    <span title="Non cliccabile">🧭</span>
                    <span class="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">120 €</span>
                  </div>
                </div>
                <p class="text-[11px] font-medium text-slate-600 truncate mt-0.5 flex items-center gap-1">
                  <span class="truncate">MEL · Melbourne Tullamarine</span>
                  <span class="text-slate-400">➔</span>
                  <span class="truncate">SYD · Sydney Kingsford</span>
                </p>
                <p class="text-[10px] text-slate-400 truncate mt-0.5">
                  <span>Gate: Terminal 1, Gate 24 </span>• <span>Posto: 14A</span>
                </p>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-rose-500 font-medium">⚠️ Perso: Chiusura check-in 10:45 (in aeroporto ore 09:30). Pulsante 🎫 non cliccabile. Mappe 📍 assente.</p>
        </div>

        <!-- NUOVA PROPOSTA RIPRISTINATA -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ Nuova Proposta (Spazi compatti, 100% info e azioni dirette)
            </span>
            <span class="text-[10px] text-slate-400">Adattiva: ~125px</span>
          </div>

          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2.5">
            <!-- HEADER -->
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div class="flex items-center gap-2">
                <span class="text-sm">✈️</span>
                <span class="font-black text-xs text-slate-900 uppercase tracking-wide">Qantas · QF 415</span>
                <span class="text-[10px] text-slate-400">Diretto</span>
              </div>
              <div class="flex items-center gap-1">
                <button class="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-center font-bold" title="Note Copilota">🧭</button>
                <button class="w-6 h-6 rounded-md bg-sky-50 border border-sky-200 text-sky-700 text-xs flex items-center justify-center font-bold" title="Bagagli">🧳</button>
              </div>
            </div>

            <!-- TRATTA & ORARI VISIBILI SUBITO -->
            <div class="grid grid-cols-5 items-center gap-1">
              <div class="col-span-2">
                <div class="text-lg font-black text-slate-900 font-mono tabular-nums leading-none">11:30</div>
                <div class="text-[11px] font-bold text-slate-800 truncate mt-0.5">MEL · Melbourne Intl</div>
              </div>
              <div class="col-span-1 flex flex-col items-center justify-center">
                <span class="text-xs text-slate-300">──────✈──────</span>
              </div>
              <div class="col-span-2 text-right">
                <div class="text-lg font-black text-slate-900 font-mono tabular-nums leading-none">12:55</div>
                <div class="text-[11px] font-bold text-slate-800 truncate mt-0.5">SYD · Sydney Kingsford</div>
              </div>
            </div>

            <!-- BADGE OPERATIVI COMPATTI SU RIGA UNICA -->
            <div class="flex flex-wrap items-center gap-1.5 text-[10px] pt-1 border-t border-dashed border-slate-200">
              <span class="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md font-semibold text-slate-700">T1 · Gate 24</span>
              <span class="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md font-semibold text-slate-700">Posto 14A</span>
              <span class="bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-bold text-amber-800">⏱️ Check-in entro 10:45 (in aeroporto: 09:30)</span>
            </div>

            <!-- FOOTER OPERATIVO E PULSANTI DIRETTI -->
            <div class="flex items-center justify-between pt-1 border-t border-slate-100">
              <span class="text-xs font-black text-slate-900 font-mono">120.00 € · Saldato</span>
              <div class="flex items-center gap-1.5">
                <button class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 font-mono"># QF842X</button>
                <button class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 shadow-2xs">
                  <span>🎫</span><span>Biglietto / QR</span>
                </button>
                <a href="#" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center justify-center border border-slate-200" title="Google Maps">📍</a>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-emerald-600 font-medium">✓ Tutto visibile sul fronte: orario check-in, gate, posto, biglietto cliccabile e Maps immediato.</p>
        </div>
      </div>
    </section>

    <!-- 2. TRENO -->
    <section class="space-y-3" id="sec-treno">
      <div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
        <h2 class="text-sm font-extrabold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
          <span>🚆</span> 2. TRASPORTO — TRENO (Esempio: V/Line Intercity Express 8214)
        </h2>
        <span class="text-[11px] font-bold text-slate-400">Card Operativa</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- COMPATTO RECEDE -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              ❌ Compatto Recente
            </span>
          </div>
          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs">
            <div class="flex items-start gap-3">
              <div class="shrink-0 text-left min-w-[56px] pt-0.5">
                <span class="font-mono text-xs sm:text-sm font-extrabold text-slate-900 tabular-nums block">08:35</span>
                <span class="font-mono text-[10px] text-slate-500 font-semibold block mt-0.5">➔ 09:32</span>
              </div>
              <div class="w-px self-stretch bg-slate-100 shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0 truncate">
                    <span class="text-sm shrink-0">🚆</span>
                    <span class="font-bold text-xs text-slate-900 truncate">V/Line Intercity</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0 text-xs text-slate-400">
                    <span class="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">VL9942</span>
                    <span>🎫</span>
                  </div>
                </div>
                <p class="text-[11px] font-medium text-slate-600 truncate mt-0.5 flex items-center gap-1">
                  <span>Melbourne Southern Cross</span>➔<span>Geelong Railway Station</span>
                </p>
                <p class="text-[10px] text-slate-400 truncate mt-0.5">
                  Binario: 4S • Posto: Carrozza C · Posto 22
                </p>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-rose-500 font-medium">⚠️ Binario e carrozza nascosti in grigio tenue 10px. Nessun accesso a Maps né QR del biglietto.</p>
        </div>

        <!-- NUOVA PROPOSTA -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ Nuova Proposta
            </span>
          </div>

          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2.5">
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div class="flex items-center gap-2">
                <span class="text-sm">🚆</span>
                <span class="font-black text-xs text-slate-900 uppercase tracking-wide">V/Line · Treno 8214</span>
              </div>
              <button class="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-center font-bold" title="Note Copilota">🧭</button>
            </div>

            <div class="grid grid-cols-5 items-center gap-1">
              <div class="col-span-2">
                <div class="text-lg font-black text-slate-900 font-mono tabular-nums leading-none">08:35</div>
                <div class="text-[11px] font-bold text-slate-800 truncate mt-0.5">Melbourne Southern Cross</div>
              </div>
              <div class="col-span-1 flex flex-col items-center justify-center">
                <span class="text-xs text-slate-300">──────🚆──────</span>
              </div>
              <div class="col-span-2 text-right">
                <div class="text-lg font-black text-slate-900 font-mono tabular-nums leading-none">09:32</div>
                <div class="text-[11px] font-bold text-slate-800 truncate mt-0.5">Geelong Railway Station</div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5 text-[10px] pt-1 border-t border-dashed border-slate-200">
              <span class="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md font-bold text-indigo-900">Binario: 4S</span>
              <span class="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md font-semibold text-slate-700">Carrozza C · Posto 22</span>
            </div>

            <div class="flex items-center justify-between pt-1 border-t border-slate-100">
              <span class="text-xs font-black text-slate-900 font-mono">14.50 AUD</span>
              <div class="flex items-center gap-1.5">
                <button class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 font-mono"># VL99421</button>
                <button class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 shadow-2xs">
                  <span>🎫</span><span>Biglietto / QR</span>
                </button>
                <a href="#" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center justify-center border border-slate-200">📍</a>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-emerald-600 font-medium">✓ Binario ed eventuale carrozza evidenziati in pill contrastate. Azione QR e Maps pronte.</p>
        </div>
      </div>
    </section>

    <!-- 3. NOLEGGIO -->
    <section class="space-y-3" id="sec-noleggio">
      <div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
        <h2 class="text-sm font-extrabold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
          <span>🚗</span> 3. TRASPORTO — NOLEGGIO / CAMPERVAN (Esempio: Snap Rentals Toyota RAV4)
        </h2>
        <span class="text-[11px] font-bold text-slate-400">Card & Banner Oggi</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- COMPATTO RECEDE -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              ❌ Compatto Recente (Solo testo "Dettagli ➔")
            </span>
          </div>
          <div class="rounded-2xl border p-3 flex items-center justify-between gap-3 bg-white border-slate-200 shadow-2xs">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-sm shrink-0">🚗</span>
              <div class="min-w-0">
                <span class="text-xs font-bold text-slate-900 truncate block">Auto a noleggio attiva • Snap Rentals</span>
                <p class="text-[11px] text-slate-500 truncate mt-0.5">Riconsegna il 15 Dic alle 17:00 a Sydney Airport Depot</p>
              </div>
            </div>
            <span class="text-xs font-bold text-slate-400 shrink-0">Dettagli ➔</span>
          </div>
          <p class="text-[10px] text-rose-500 font-medium">⚠️ Nessun link Maps al deposito, nessun accesso al contratto PDF, nessuna nota su carburante/franchigia.</p>
        </div>

        <!-- NUOVA PROPOSTA -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ Nuova Proposta (Operativa per la giornata)
            </span>
          </div>

          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2.5">
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div class="flex items-center gap-2">
                <span class="text-sm">🚗</span>
                <span class="font-black text-xs text-slate-900 uppercase tracking-wide">Toyota RAV4 SUV · Snap Rentals</span>
              </div>
              <button class="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-center font-bold" title="Note Copilota">🧭</button>
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500">Riconsegna programmata:</span>
                <span class="font-extrabold text-slate-900 font-mono">15 Dicembre ore 17:00</span>
              </div>
              <div class="text-[11px] font-bold text-slate-800 flex items-center gap-1 truncate">
                <span>📍</span>
                <span class="truncate">Sydney Airport Depot · 230 O'Riordan St, Mascot</span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5 text-[10px] pt-1 border-t border-dashed border-slate-200">
              <span class="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-bold text-emerald-800">Franchigia Zero</span>
              <span class="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md font-semibold text-slate-700">Pieno / Pieno</span>
              <span class="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md font-mono text-slate-600">Pren: SR-88412</span>
            </div>

            <div class="flex items-center justify-between pt-1 border-t border-slate-100">
              <span class="text-[11px] font-bold text-slate-500">Dep: Carta di credito guidatore</span>
              <div class="flex items-center gap-1.5">
                <button class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 shadow-2xs">
                  <span>🎫</span><span>Voucher / Contratto</span>
                </button>
                <a href="#" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-bold border border-slate-200 flex items-center gap-1">
                  <span>📍</span><span>Mappa Deposito</span>
                </a>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-emerald-600 font-medium">✓ Indirizzo esatto del desk/depot con Mappa diretta, condizioni contrattuali chiare e voucher accessibile.</p>
        </div>
      </div>
    </section>

    <!-- 4. ATTIVITÀ CON RITROVO -->
    <section class="space-y-3" id="sec-attivita">
      <div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
        <h2 class="text-sm font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
          <span>🥾</span> 4. ATTIVITÀ CON RITROVO (Esempio: Snorkeling Grande Barriera Corallina)
        </h2>
        <span class="text-[11px] font-bold text-slate-400">Card Operativa</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- COMPATTO RECEDE -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              ❌ Compatto Recente (Ritrovo confuso e azioni morte)
            </span>
          </div>
          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs">
            <div class="flex items-start gap-3">
              <div class="shrink-0 text-left min-w-[56px] pt-0.5">
                <span class="font-mono text-xs sm:text-sm font-extrabold text-slate-900 tabular-nums block">09:00</span>
                <span class="text-[10px] text-slate-400 font-medium block mt-0.5">5h30</span>
              </div>
              <div class="w-px self-stretch bg-slate-100 shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0 truncate">
                    <span class="text-sm shrink-0">📌</span>
                    <h3 class="text-xs font-bold text-slate-900 truncate">Snorkeling Guidato Reef</h3>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0 text-xs text-slate-400">
                    <span>🎫</span>
                    <span class="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">180 €</span>
                  </div>
                </div>
                <p class="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                  <span>📍</span>
                  <span class="truncate">Marina Sud, Molo 3, Port Douglas</span>
                </p>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-rose-500 font-medium">⚠️ Perso: L'orario di ritrovo (08:15) non è visibile. Biglietto solo icona morta. Niente navigazione Maps.</p>
        </div>

        <!-- NUOVA PROPOSTA -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ Nuova Proposta (Ritrovo + Inizio affiancati, biglietto e Maps)
            </span>
          </div>

          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2.5">
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div class="flex items-center gap-1.5">
                <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold uppercase">🥾 Escursione</span>
                <span class="text-[10px] text-slate-400 font-semibold">Durata: 5h30</span>
              </div>
              <button class="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-center font-bold" title="Note Copilota">🧭</button>
            </div>

            <div>
              <h3 class="font-black text-sm text-slate-900 leading-snug">Snorkeling Guidato alla Grande Barriera Corallina</h3>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span class="bg-amber-50 border border-amber-300 text-amber-900 px-2 py-0.5 rounded-md font-bold text-xs font-mono">
                  🚩 Ritrovo al molo: ore 08:15
                </span>
                <span class="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-bold text-xs font-mono">
                  ⏱️ Partenza: ore 09:00
                </span>
              </div>
              <p class="text-xs text-slate-600 mt-1 flex items-center gap-1">
                <span>📍</span>
                <span>Marina Sud, Molo 3, Port Douglas</span>
              </p>
            </div>

            <div class="flex items-center justify-between pt-1 border-t border-slate-100">
              <span class="text-xs font-black text-slate-900 font-mono">180.00 € · Saldato</span>
              <div class="flex items-center gap-1.5">
                <button class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 font-mono"># REEF-9201</button>
                <button class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 shadow-2xs">
                  <span>🎫</span><span>Voucher / QR</span>
                </button>
                <a href="#" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center justify-center border border-slate-200">📍</a>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-emerald-600 font-medium">✓ Ritrovo evidente e separato dall'inizio. Codice voucher pronto per l'imbarco e Maps diretto.</p>
        </div>
      </div>
    </section>

    <!-- 5. TAPPA -->
    <section class="space-y-3" id="sec-tappa">
      <div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
        <h2 class="text-sm font-extrabold uppercase tracking-wider text-pink-800 flex items-center gap-1.5">
          <span>📍</span> 5. TAPPA (Esempio: Split Point Lighthouse & Eagle Rock)
        </h2>
        <span class="text-[11px] font-bold text-slate-400">Card Itinerario</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- COMPATTO RECEDE -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              ❌ Compatto Recente (Orari apertura e Mappe rimossi)
            </span>
          </div>
          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs">
            <div class="flex items-start gap-3">
              <div class="shrink-0 text-left min-w-[56px] pt-0.5">
                <span class="font-mono text-xs sm:text-sm font-extrabold text-slate-900 tabular-nums block">14:30</span>
              </div>
              <div class="w-px self-stretch bg-slate-100 shrink-0"></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0 truncate">
                    <span class="text-sm shrink-0">📍</span>
                    <h3 class="text-xs font-bold text-slate-900 truncate">Split Point Lighthouse</h3>
                  </div>
                  <span class="text-xs text-slate-400">🧭</span>
                </div>
                <p class="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                  <span>📍</span>
                  <span class="truncate">Federal St, Aireys Inlet VIC</span>
                </p>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-rose-500 font-medium">⚠️ Perso: Badge orari apertura (aperto fino alle 17:00). Mappe 📍 sparite.</p>
        </div>

        <!-- NUOVA PROPOSTA -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ Nuova Proposta (Orari apertura live, task e navigazione)
            </span>
          </div>

          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2.5">
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div class="flex items-center gap-1.5">
                <span class="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200 font-extrabold uppercase">📍 Tappa</span>
                <span class="text-xs font-mono font-bold text-slate-700">⏰ Ore 14:30</span>
              </div>
              <button class="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-center font-bold" title="Note Copilota">🧭</button>
            </div>

            <div>
              <h3 class="font-black text-sm text-slate-900 leading-snug">Split Point Lighthouse & Eagle Rock</h3>
              <p class="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                <span>📍</span>
                <span>Federal St, Aireys Inlet VIC</span>
              </p>
            </div>

            <!-- LIVE OPENING HOURS BADGE -->
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-md">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Aperto fino alle 17:00 (Orario: 09:00 - 17:00)</span>
              </span>
            </div>

            <div class="flex items-center justify-between pt-1 border-t border-slate-100">
              <span class="text-[11px] font-medium text-slate-500">Parcheggio gratuito dietro il faro</span>
              <a href="#" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-bold border border-slate-200 flex items-center gap-1">
                <span>📍</span><span>Maps</span>
              </a>
            </div>
          </div>
          <p class="text-[10px] text-emerald-600 font-medium">✓ Stato apertura in tempo reale e bottone Maps sempre a portata di pollice.</p>
        </div>
      </div>
    </section>

    <!-- 6. ALLOGGIO -->
    <section class="space-y-3" id="sec-alloggio">
      <div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
        <h2 class="text-sm font-extrabold uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
          <span>🛏️</span> 6. ALLOGGIO (Esempio: Shallow Inlet Caravan Park)
        </h2>
        <span class="text-[11px] font-bold text-slate-400">Card & Callout Timeline</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- CALLOUT RECEDE IN TIMELINE -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              ❌ Callout Timeline Recente (Rimanda in fondo alla pagina)
            </span>
          </div>
          <div class="bg-purple-50/80 border border-purple-200/70 rounded-2xl p-2.5 flex items-center justify-between gap-3 shadow-2xs">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-7 h-7 rounded-xl bg-purple-100 flex items-center justify-center text-sm shrink-0">🏨</span>
              <div class="min-w-0">
                <span class="block text-[11px] font-extrabold text-purple-900 truncate">Check-in disponibile: Shallow Inlet Caravan Park</span>
                <span class="block text-[10px] text-purple-600 truncate">Dalle ore 14:00 • Clicca per vedere la scheda in basso</span>
              </div>
            </div>
            <span class="text-xs font-bold text-purple-600 shrink-0">Vedi alloggio ↓</span>
          </div>
          <p class="text-[10px] text-rose-500 font-medium">⚠️ Costringe a scorrere a fine pagina; non mostra indirizzo, PIN cancello né voucher.</p>
        </div>

        <!-- NUOVA PROPOSTA COMPLETA DI ALLOGGIO -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ Nuova Proposta (Info operative sul fronte: PIN, Check-in, Mappe, Doc)
            </span>
          </div>

          <div class="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2.5">
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div class="flex items-center gap-1.5">
                <span class="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-extrabold uppercase">⛺ Camping / Caravan Park</span>
                <span class="text-xs text-slate-500">In: 14:00 · Out: 10:00</span>
              </div>
              <button class="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-center font-bold" title="Note Copilota">🧭</button>
            </div>

            <div>
              <h3 class="font-black text-sm text-slate-900 leading-snug">Shallow Inlet Caravan Park (SICP)</h3>
              <p class="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                <span>📍</span>
                <span>210 Townsend Rd, Yanakie VIC</span>
              </p>
            </div>

            <!-- PIN CANCELLO & ARRIVO PIANIFICATO -->
            <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed border-slate-200">
              <span class="bg-amber-50 border border-amber-300 text-amber-900 px-2.5 py-1 rounded-lg font-mono font-bold text-xs flex items-center gap-1.5">
                <span>🔑 PIN cancello notturno:</span>
                <span class="bg-white px-1.5 py-0.5 rounded border border-amber-200">3918</span>
              </span>
              <span class="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg">
                🕒 Mio arrivo previsto: <strong>ore 17:15</strong>
              </span>
            </div>

            <div class="flex items-center justify-between pt-1 border-t border-slate-100">
              <span class="text-xs font-black text-amber-800 font-mono bg-amber-50 px-2 py-0.5 rounded border border-amber-200">62 AUD · Da saldare all'arrivo</span>
              <div class="flex items-center gap-1.5">
                <button class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-200 font-mono"># SICP-6624</button>
                <button class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 shadow-2xs">
                  <span>🎫</span><span>Documenti</span>
                </button>
                <a href="#" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center justify-center border border-slate-200">📍</a>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-emerald-600 font-medium">✓ PIN cancello e check-in subito visibili, Maps diretto e voucher senza obbligo di scroll.</p>
        </div>
      </div>
    </section>

  </div>

</body>
</html>
`;

async function run() {
  console.log('=== GENERAZIONE HTML CONFRONTO CARD & CATTURA SCREENSHOT ===\n');

  const htmlPath = path.join(__dirname, '..', 'temp_cards_comparison.html');
  fs.writeFileSync(htmlPath, comparisonHtml, 'utf8');
  console.log(`[HTML] Salvato: ${htmlPath}`);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=C:\\Users\\CUSI\\AppData\\Local\\Temp\\chrome-debug-cards`
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
    throw new Error('Impossibile connettersi a Chrome DevTools CDP!');
  }

  const cdp = new CDPClient(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    const fileUrl = 'file:///' + htmlPath.replace(/\\\\/g, '/');
    console.log(`[NAVIGATE] Apertura: ${fileUrl}`);
    await cdp.send('Page.navigate', { url: fileUrl });
    await sleep(2500);

    // 1. Mobile iPhone 15 Pro (393x852)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(500);

    // Screenshot di ciascuna sezione comparativa su mobile
    const sections = ['sec-volo', 'sec-treno', 'sec-noleggio', 'sec-attivita', 'sec-tappa', 'sec-alloggio'];
    for (const sec of sections) {
      await cdp.send('Runtime.evaluate', {
        expression: `document.getElementById('${sec}').scrollIntoView({ behavior: 'instant', block: 'start' });`
      });
      await sleep(300);
      const res = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const buf = Buffer.from(res.data, 'base64');
      const filename = `comparison_mobile_${sec}.png`;
      fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buf);
      fs.writeFileSync(path.join(LOCAL_SCREENSHOT_DIR, filename), buf);
      console.log(`[SCREENSHOT] Salvato: ${filename} (${buf.length} bytes)`);
    }

    // 2. Desktop Full Overview (1200x2400)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 2400,
      deviceScaleFactor: 2,
      mobile: false
    });
    await sleep(500);
    await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, 0);` });
    await sleep(300);

    const fullRes = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const fullBuf = Buffer.from(fullRes.data, 'base64');
    const fullFilename = `comparison_desktop_full_overview.png`;
    fs.writeFileSync(path.join(ARTIFACT_DIR, fullFilename), fullBuf);
    fs.writeFileSync(path.join(LOCAL_SCREENSHOT_DIR, fullFilename), fullBuf);
    console.log(`[SCREENSHOT] Salvato: ${fullFilename} (${fullBuf.length} bytes)`);

    console.log('\n=== TUTTI GLI SCREENSHOT COMPARATIVI COMPLETATI CON SUCCESSO ===');
  } finally {
    cdp.close();
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
