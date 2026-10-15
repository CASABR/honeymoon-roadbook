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

    // --- AUTOMATIC DEDUPLICATION SCRIPT (HARDCODED FOR USER DUPLICATES) ---
    try {
      const allTransports = await idbGetAll<import('../types').Trasporto>(STORES.TRASPORTI);
      let deletedAny = false;

      for (const t of allTransports) {
        // 1. Treno 28 Nov - Rimuovi il vecchio generico
        if (t.type === 'treno' && t.date === '2026-11-28') {
          if (t.carrier === 'TRENO ROMA TERMINI - MILANO CENTRALE' || t.departureTime === '00:00' || !t.departureTime) {
            await idbDelete(STORES.TRASPORTI, t.id);
            deletedAny = true;
          }
        }
        
        // 2. Volo 29 Nov / 01 Dic - Rimuovi volo aggregato Air China CA950 + CA783
        if (t.type === 'volo' && (t.date === '2026-11-29' || t.date === '2026-12-01')) {
          if (t.carrier && t.carrier.includes('CA950 + CA783')) {
            await idbDelete(STORES.TRASPORTI, t.id);
            deletedAny = true;
          }
        }

        // 3. Traghetto 06 Dic - Rimuovi vecchio Interislander (tieni Bluebridge Livia)
        if (t.type === 'traghetto' && t.date === '2026-12-06') {
          if (t.carrier && t.carrier.includes('Interislander')) {
            await idbDelete(STORES.TRASPORTI, t.id);
            deletedAny = true;
          }
        }
      }

      if (deletedAny) {
        notifyDataChanged('trasporti', 'delete', {}); // trigger UI refresh
      }
    } catch(err) {
      console.warn('[StorageService] Errore deduplicazione', err);
    }
  }`;

const match = content.match(/  async ensureRefuels\(\): Promise<void> \{[\s\S]*?console\.warn\('\[StorageService\] Errore deduplicazione', err\);\n    \}\n  \}/);

if (match) {
  content = content.replace(match[0], newEnsureRefuels);
  fs.writeFileSync('src/storage/storageService.ts', content, 'utf8');
  console.log('Replaced successfully!');
} else {
  console.log('Could not find existing ensureRefuels regex!');
}
