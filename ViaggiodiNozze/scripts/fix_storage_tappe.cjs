const fs = require('fs');

let content = fs.readFileSync('src/storage/storageService.ts', 'utf8');

const targetContent = `    const { SEED_SHOPPING } = await import('./seedShopping');
    const { SEED_ALLOGGI } = await import('./seedAlloggi');`;

const replacementContent = `    const { SEED_SHOPPING } = await import('./seedShopping');
    const { SEED_ALLOGGI } = await import('./seedAlloggi');
    const { REAL_TAPPE } = await import('./seedTappe');`;

if (content.includes(targetContent)) {
    content = content.replace(targetContent, replacementContent);
    
    // Add logic to ensureRefuels
    const targetUpsert = `    for (const acc of SEED_ALLOGGI) {
      if (!existingAlloggi.some(s => s.id === acc.id)) {
        const item: import('../types').Alloggio = { ...acc, createdAt: now, updatedAt: now };
        await idbPut(STORES.ALLOGGI, item);
        notifyDataChanged('alloggi', 'save', item);
      }
    }`;
    
    const replacementUpsert = `    for (const acc of SEED_ALLOGGI) {
      if (!existingAlloggi.some(s => s.id === acc.id)) {
        const item: import('../types').Alloggio = { ...acc, createdAt: now, updatedAt: now };
        await idbPut(STORES.ALLOGGI, item);
        notifyDataChanged('alloggi', 'save', item);
      }
    }
    
    // Upsert rigoroso Tappe basato su date + titolo
    const existingTappe = await idbGetAll<import('../types').Tappa>(STORES.TAPPE);
    for (const tappa of REAL_TAPPE) {
      const existing = existingTappe.find(e => 
        e.date === tappa.date && 
        e.titolo.toLowerCase().trim() === tappa.titolo.toLowerCase().trim()
      );

      if (existing) {
         const updated = { 
            ...existing, 
            ...tappa, 
            id: existing.id, 
            updatedAt: now 
         };
         await idbPut(STORES.TAPPE, updated);
      } else {
         await idbPut(STORES.TAPPE, { ...tappa, createdAt: now, updatedAt: now });
      }
    }
    notifyDataChanged('tappe', 'save', {});`;
    
    content = content.replace(targetUpsert, replacementUpsert);
    
    fs.writeFileSync('src/storage/storageService.ts', content, 'utf8');
    console.log("storageService.ts updated with Tappe logic");
} else {
    console.log("Target content not found in storageService.ts");
}
