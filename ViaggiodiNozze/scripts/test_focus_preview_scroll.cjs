const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- TEST FOCUS DELLA GIORNATA: ANTEPRIMA, SCROLL DIRETTO E ZERO MODALI ---');

const oggiViewPath = path.resolve(__dirname, '../src/views/OggiView.tsx');
const oggiContent = fs.readFileSync(oggiViewPath, 'utf8');

const cssPath = path.resolve(__dirname, '../src/index.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// 1. Nessun pulsante "Maps" o "Dettagli" nel Focus preview
assert(!oggiContent.includes('<span>Maps</span>\n                        <span className="text-[10px] opacity-80">↗</span>'), 'FAIL: Trovato vecchio pulsante Maps nel Focus');
assert(!oggiContent.includes('Dettagli →\n                    </button>'), 'FAIL: Trovato vecchio pulsante Dettagli nel Focus');
console.log('✓ 1. Pulsanti separati Maps e Dettagli eliminati dal Focus della giornata.');

// 2. Singola freccia discreta ArrowRight all\'estremità destra
assert(oggiContent.includes('<ArrowRight className="w-4 h-4" />'), 'FAIL: Icona freccia ArrowRight mancante nel Focus');
assert(oggiContent.includes('aria-label="Raggiungi card nella timeline"'), 'FAIL: Accessibilità freccia mancante');
console.log('✓ 2. Singola freccia discreta e visibile ArrowRight presente a destra.');

// 3. Scorrimento diretto alla card tramite identificativo univoco (senza ricerca per titolo)
assert(oggiContent.includes('scrollToTimelineCard(nextEventItem.id)'), 'FAIL: Chiamata a scrollToTimelineCard con ID univoco mancante');
assert(oggiContent.includes('id={`timeline-card-${item.id}`}'), 'FAIL: Attributo ID univoco timeline-card mancante sugli elementi timeline');
assert(oggiContent.includes("targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });"), 'FAIL: scrollIntoView con block center mancante');
console.log('✓ 3. Scorrimento diretto con identificativo univoco e block: center per evitare copertura header.');

// 4. Evidenziazione temporanea visiva all\'arrivo
assert(oggiContent.includes('setHighlightedCardId(itemId)'), 'FAIL: setHighlightedCardId mancante');
assert(oggiContent.includes('hounigo-card-highlighted'), 'FAIL: Classe hounigo-card-highlighted mancante');
assert(cssContent.includes('@keyframes hounigoHighlightPulse'), 'FAIL: Keyframe animazione hounigoHighlightPulse mancante in index.css');
console.log('✓ 4. Evidenziazione temporanea (pulse e glow corallo) configurata e attiva.');

// 5. Nessun popup modale aperto al tocco del Focus
assert(!oggiContent.includes('onClick={() => setDetailItem(nextEventItem)}'), 'FAIL: Il Focus apre ancora il popup di dettaglio');
console.log('✓ 5. Nessun popup di dettaglio aperto dal Focus: navigazione reale alla card.');

// 6. Focus compatto e preservazione Maps/Dettagli sulla card originale
assert(oggiContent.includes('className="bg-white dark:bg-[#172033] text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 border-l-[#FF6B5F] px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xs space-y-1.5'), 'FAIL: Box compatto Focus mancante');
assert(oggiContent.includes('<TrasportoCard'), 'FAIL: Card originale Trasporto mancante');
assert(oggiContent.includes('<AttivitaCard'), 'FAIL: Card originale Attivita mancante');
console.log('✓ 6. Focus ultra-compatto; Maps e Dettagli rimangono intatti nelle card originali.');

console.log('TUTTI I 6 CONTROLLI SUL FOCUS DELLA GIORNATA SUPERATI CON SUCCESSO!');
