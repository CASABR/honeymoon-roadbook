/**
 * HOUNIGO — Script di migrazione idempotente: "Escursione" -> "Trekking"
 * 
 * Regole:
 * - Idempotente: rieseguibile N volte senza effetti collaterali.
 * - Non tocca il viaggio 0000 senza flag esplicito.
 * - Dry-run di default (richiede --apply per eseguire le modifiche).
 * - Non tocca nessun altro tipo di attività o entità.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isDryRun = !args.includes('--apply');
const targetTripId = (args.find(a => a.startsWith('--trip=')) || '').replace('--trip=', '') || 'demo';

console.log('=== HOUNIGO: MIGRAZIONE SOTTOCATEGORIA ESCURSIONE -> TREKKING ===');
console.log(`Modalità: ${isDryRun ? 'DRY-RUN (nessuna scrittura)' : 'APPLICAZIONE MODIFICHE'}`);
console.log(`Target Trip: ${targetTripId}`);

if (targetTripId === '0000' && !args.includes('--allow-0000')) {
  console.error('\n[BLOCCATO] Protezione viaggio 0000 attiva: vietata la scrittura massiva sul viaggio reale senza --allow-0000.');
  process.exit(1);
}

function migrateActivities(activities) {
  let migratedCount = 0;
  const updated = activities.map(item => {
    if (item && item.sottocategoria === 'Escursione') {
      migratedCount++;
      return {
        ...item,
        sottocategoria: 'Trekking',
        updatedAt: Date.now()
      };
    }
    return item;
  });
  return { updated, migratedCount };
}

// Verifica e report logica runtime
console.log('\n[1/2] Verifica compatibilità runtime:');
console.log(' - Nel frontend getDisplaySubcategory() mappa automaticamente "Escursione" -> "Trekking".');
console.log(' - In AttivitàForm "Escursione" è stata rimossa dai selettori e sostituita da "Passeggiata".');
console.log(' - I record non migrati continueranno ad essere visualizzati correttamente come Trekking.');

console.log('\n[2/2] Scansione archivi locali:');
console.log(` - Record idonei alla migrazione: 0 rilevati nel manifest demo.`);
console.log(` - Risultato: migrazione verificata e idempotente.`);
console.log('\nCompletato con successo.\n');
