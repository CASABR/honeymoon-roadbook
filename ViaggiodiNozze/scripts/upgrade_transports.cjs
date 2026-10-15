const fs = require('fs');

let content = fs.readFileSync('src/storage/storageService.ts', 'utf8');

const newEnsureRefuels = `  async ensureRefuels(): Promise<void> {
    const existingShopping = await idbGetAll<import('../types').Shopping>(STORES.SHOPPING);
    const existingAlloggi = await idbGetAll<import('../types').Alloggio>(STORES.ALLOGGI);
    const now = Date.now();
    
    const { SEED_SHOPPING } = await import('./seedShopping');
    const { SEED_ALLOGGI } = await import('./seedAlloggi');

    for (const fuel of SEED_SHOPPING) {
      if (!existingShopping.some(s => s.id === fuel.id)) {
        const item = { ...fuel, createdAt: now, updatedAt: now } as import('../types').Shopping;
        await idbPut(STORES.SHOPPING, item);
        notifyDataChanged('shopping', 'save', item);
      }
    }

    for (const acc of SEED_ALLOGGI) {
      if (!existingAlloggi.some(s => s.id === acc.id)) {
        const item: import('../types').Alloggio = { ...acc, createdAt: now, updatedAt: now };
        await idbPut(STORES.ALLOGGI, item);
        notifyDataChanged('alloggi', 'save', item);
      }
    }

    // --- AUTOMATIC DEDUPLICATION & UPDATE SCRIPT ---
    try {
      const allTransports = await idbGetAll<import('../types').Trasporto>(STORES.TRASPORTI);
      let changedAny = false;

      for (const t of allTransports) {
        let dirty = false;
        
        // 1. Treno 28 Nov - Rimuovi il vecchio generico
        if (t.type === 'treno' && t.date === '2026-11-28') {
          if (t.carrier === 'TRENO ROMA TERMINI - MILANO CENTRALE' || t.departureTime === '00:00' || !t.departureTime) {
            await idbDelete(STORES.TRASPORTI, t.id);
            changedAny = true;
            continue;
          }
        }
        
        // 2. Volo 29 Nov / 01 Dic - Rimuovi volo aggregato Air China CA950 + CA783
        if (t.type === 'volo' && (t.date === '2026-11-29' || t.date === '2026-12-01')) {
          if (t.carrier && t.carrier.includes('CA950 + CA783')) {
            await idbDelete(STORES.TRASPORTI, t.id);
            changedAny = true;
            continue;
          }
        }

        // 3. Traghetto 06 Dic - Rimuovi vecchio Interislander
        if (t.type === 'traghetto' && t.date === '2026-12-06') {
          if (t.carrier && t.carrier.includes('Interislander')) {
            await idbDelete(STORES.TRASPORTI, t.id);
            changedAny = true;
            continue;
          } else if (t.carrier && t.carrier.includes('Bluebridge')) {
            t.cost = '198.00'; 
            t.noteCopilota = 'Costo Totale: 356,13 NZD. Include 2 adulti + veicolo auto fino a 5m. Inserire marcia, freno a mano e disattivare allarme. All\\'arrivo alle 17:15 rotta verso Kaikoura con sosta foche a Ohau Point.';
            dirty = true;
          }
        }

        // 4. Volo 15 Dec CHC-ADL
        if (t.type === 'volo' && t.date === '2026-12-15') {
          t.cost = '355.71';
          t.noteCopilota = 'Atterraggio 17:35; chiamare subito lo shuttle di Bargain Car Rentals (+61 3 6165 0838 o 1300 729 230, tasto 1) per il ritiro auto prima della chiusura delle 18:45–19:00.';
          dirty = true;
        }

        // 5. Volo 17 Dec ADL-MEL
        if (t.type === 'volo' && t.date === '2026-12-17') {
          t.cost = '186.60';
          t.posti = '16A (Nunzio), 16B (Giusy)';
          t.noteCopilota = 'Arrivo a Melbourne Tullamarine alle 21:40; trasferimento al piazzale Travellers Autobarn per il ritiro notturno/contactless del Budgie Van con cassetta a codice.';
          dirty = true;
        }

        // 6. Volo 28 Dec SYD-MNL
        if (t.type === 'volo' && t.date === '2026-12-28') {
          t.noteCopilota = 'Compilare il modulo eTravel (etravel.gov.ph) entro 72 ore prima del decollo del 28 dicembre. Sbarco a Manila T3 la sera del 28; sosta notturna al Tess and Tessha Condotel vicino al Terminal 3 e rientro in aeroporto la mattina del 29 per il volo verso Caticlan.';
          dirty = true;
        }
        
        // 7. Volo 02 Jan MPH-ENI
        if (t.type === 'volo' && t.date === '2027-01-02') {
          t.posti = '5C (Nunzio), 5D (Giusy)';
          t.cost = '450.00';
          t.noteCopilota = 'Atterraggio a El Nido Lio alle 16:40; check-in al Desert Rose e presentazione al briefing obbligatorio della spedizione TAO previsto per il tardo pomeriggio.';
          dirty = true;
        }

        // 8. Volo 08 Jan USU-CEB
        if (t.type === 'volo' && t.date === '2027-01-08') {
          t.posti = '06D (Nunzio), 06C (Giusy)';
          t.cost = '105.00';
          t.noteCopilota = 'Partenza dall\\'aeroporto Francisco B. Reyes di Busuanga; arrivo a Cebu Mactan T1 e alloggio all\\'Appleton Boutique Hotel vicino all\\'aeroporto.';
          dirty = true;
        }

        // 9. Voli 09-10 Jan CEB-TPE-FCO
        if (t.type === 'volo' && t.date === '2027-01-09') {
          if (t.arrivalIata === 'TPE') t.posti = '51K (Nunzio), 51J (Giusy)';
          if (t.arrivalIata === 'FCO') t.posti = '45K (Nunzio), 45J (Giusy)';
          dirty = true;
        }

        // 10. Elimina vecchi duplicati generici (Volo e Traghetto) se non hanno dati completi
        if ((t.type === 'volo' || t.type === 'traghetto') && (!t.carrier || t.carrier === 'Volo' || t.carrier === 'Traghetto') && (!t.departureTime || t.departureTime === '00:00')) {
             await idbDelete(STORES.TRASPORTI, t.id);
             changedAny = true;
             continue;
        }

        if (dirty) {
          await idbPut(STORES.TRASPORTI, t);
          changedAny = true;
        }
      }

      if (changedAny) {
        notifyDataChanged('trasporti', 'save', {}); // trigger UI refresh
      }
    } catch(err) {
      console.warn('[StorageService] Errore deduplicazione', err);
    }
  }`;

const match = content.match(/  async ensureRefuels\(\): Promise<void> \{[\s\S]*?console\.warn\('\[StorageService\] Errore deduplicazione', err\);\n    \}\n  \}/);

if (match) {
  content = content.replace(match[0], newEnsureRefuels);
  fs.writeFileSync('src/storage/storageService.ts', content, 'utf8');
  console.log('Replaced successfully with UPGRADE logic!');
} else {
  console.log('Could not find existing ensureRefuels regex!');
}
