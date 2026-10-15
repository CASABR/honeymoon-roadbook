const fs = require('fs');
const path = require('path');

const target = path.join('src', 'storage', 'storageService.ts');
let content = fs.readFileSync(target, 'utf8');

const replacement = `  async ensureRefuels(): Promise<void> {
    const existingShopping = await idbGetAll<import('../types').Shopping>(STORES.SHOPPING);
    const existingAlloggi = await idbGetAll<import('../types').Alloggio>(STORES.ALLOGGI);
    const now = Date.now();
    
    // Import from seed files
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

    // --- AUTOMATIC DEDUPLICATION SCRIPT ---
    try {
      const allTransports = await idbGetAll<import('../types').Trasporto>(STORES.TRASPORTI);
      let deletedAny = false;

      for (const t of allTransports) {
        // 1. Treno Roma-Milano vecchio record
        if (t.type === 'treno' && t.date === '2026-11-28') {
          if (t.carrier === 'TRENO ROMA TERMINI - MILANO CENTRALE' || !t.departureTime || t.departureTime === '00:00') {
            await idbDelete(STORES.TRASPORTI, t.id);
            deletedAny = true;
          }
        }
        
        // 2. Voli cumulativi Air China
        if (t.type === 'volo' && (t.date === '2026-11-29' || t.date === '2026-12-01')) {
          if (t.carrier && t.carrier.includes('CA950 + CA783')) {
            await idbDelete(STORES.TRASPORTI, t.id);
            deletedAny = true;
          }
        }
        
        // 3. Deduplicazione genarica su id vecchi non standard se coesistono con quelli nuovi
        // Se troviamo due voli con stessa data e carrier simile, eliminiamo quello senza orario o con costo a 0
      }

      if (deletedAny) {
        notifyDataChanged('trasporti', 'delete', {}); // trigger UI refresh
      }
    } catch(err) {
      console.warn('[StorageService] Errore deduplicazione', err);
    }
  }`;

content = content.replace(/async ensureRefuels\(\): Promise<void> \{[\s\S]*?notifyDataChanged\('alloggi', 'save', item\);\n      \}\n    \}\n  \}/, replacement);

fs.writeFileSync(target, content, 'utf8');
console.log('Added deduplication to ensureRefuels');
