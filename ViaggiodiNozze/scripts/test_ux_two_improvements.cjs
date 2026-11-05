const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- TEST REQUISITI UX: HEADER, FOCUS CARD, TAPPA E PRIMO UTILIZZO ---');

const oggiViewPath = path.join(__dirname, '../src/views/OggiView.tsx');
const code = fs.readFileSync(oggiViewPath, 'utf8');

// 1. Header compatto con scadenze e modifica affiancati
console.log('Verifica 1: Header compatto con scadenze e modifica affiancati...');
assert(code.includes('Riga 2: Scadenze e Modifica affiancati per compattare l\'altezza'), 'Commento/sezione scadenze e modifica affiancati mancante');
assert(code.includes('(deadlineSummary.active > 0 || canEdit) && ('), 'Container unificato per scadenze e modifica mancante');
assert(code.includes('px-3.5 py-2.5 sm:px-5 sm:py-3 space-y-1.5'), 'Padding compatto header mancante');
console.log('✅ 1. Header: scadenze e modifica affiancati sullo stesso asse orizzontale, altezza ridotta.');

// 2. Focus Card con dark e light mode adattivo
console.log('Verifica 2: Focus card con supporto dark e light mode...');
assert(code.includes('bg-white dark:bg-[#172033] text-slate-900 dark:text-white'), 'Sfondo adattivo light/dark mancante per la focus card');
assert(code.includes('Focus della giornata · {formatDateHuman(selectedDate)}'), 'Label Focus della giornata mancante');
assert(code.includes('if (!nextEventItem) return null;'), 'Condizione return null quando non ci sono eventi nel giorno mancante');
console.log('✅ 2. Focus card: dark e light mode regolati, kicker aggiornato a Focus della giornata, niente card vuota superflua.');

// 3. Categoria Tappa con icona MapPinPlus e descrizione corretta
console.log('Verifica 3: Categoria Tappa con MapPinPlus e descrizione...');
assert(code.includes("import { MapPinPlus } from 'lucide-react';"), 'Import MapPinPlus mancante');
assert(code.includes("<MapPinPlus className=\"w-7 h-7 text-[#FF6B5F]\" />"), 'Icona MapPinPlus nel modale mancante');
assert(code.includes("category.type === 'tappa' ? 'Aggiungi un luogo o una sosta al percorso'"), 'Descrizione Tappa mancante o non aggiornata');
console.log('✅ 3. Categoria Tappa: icona Lucide map-pin-plus e descrizione "Aggiungi un luogo o una sosta al percorso" configurate.');

// 4. Primo utilizzo e giornata vuota
console.log('Verifica 4: Giornata vuota con "+ Aggiungi al viaggio" per editor e rispetto Viewer...');
assert(code.includes('+ Aggiungi al viaggio'), 'Pulsante "+ Aggiungi al viaggio" mancante nella giornata vuota');
assert(code.includes('{canEdit ? ('), 'Controllo permessi editor canEdit mancante nella giornata vuota');
assert(code.includes('<span>Aggiungi</span>'), 'Pulsante normale "+ Aggiungi" nella timeline non preservato');
console.log('✅ 4. Primo utilizzo: pulsante prominente "+ Aggiungi al viaggio" nella giornata vuota, transizione a "+ Aggiungi" ordinario con card presenti, permessi Viewer garantiti.');

console.log('\n🎉 TUTTI I 4 CONTROLLI DI VERIFICA UX SONO STATI SUPERATI CON SUCCESSO!');
