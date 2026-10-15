const fs = require('fs');

let content = fs.readFileSync('src/storage/storageService.ts', 'utf8');

const targetContent = `    const { SEED_SHOPPING } = await import('./seedShopping');
    const { SEED_ALLOGGI } = await import('./seedAlloggi');
    const { REAL_TAPPE } = await import('./seedTappe');`;

const replacementContent = `    const { SEED_SHOPPING } = await import('./seedShopping');
    const { SEED_ALLOGGI } = await import('./seedAlloggi');
    const { REAL_TAPPE } = await import('./seedTappe');
    const { SEED_RISTORANTI } = await import('./seedRistoranti');`;

if (content.includes(targetContent)) {
    content = content.replace(targetContent, replacementContent);
    
    // Add logic to ensureRefuels
    const targetUpsert = `    notifyDataChanged('tappe', 'save', {});`;
    
    const replacementUpsert = `    notifyDataChanged('tappe', 'save', {});

    // Upsert rigoroso Ristoranti basato su date + nome
    const existingRist = await idbGetAll<import('../types').Ristorante>(STORES.RISTORANTI);
    for (const rist of SEED_RISTORANTI) {
      const existing = existingRist.find(e => 
        e.date === rist.date && 
        e.nome.toLowerCase().trim() === rist.nome.toLowerCase().trim()
      );

      if (existing) {
         const updated = { 
            ...existing, 
            ...rist, 
            id: existing.id, 
            updatedAt: now 
         };
         await idbPut(STORES.RISTORANTI, updated);
      } else {
         await idbPut(STORES.RISTORANTI, { ...rist, createdAt: now, updatedAt: now });
      }
    }
    notifyDataChanged('ristoranti', 'save', {});

    // Upsert rigoroso Shopping basato su date + nome
    const existingShop = await idbGetAll<import('../types').Shopping>(STORES.SHOPPING);
    for (const shop of SEED_SHOPPING) {
      const existing = existingShop.find(e => 
        e.date === shop.date && 
        e.nome.toLowerCase().trim() === shop.nome.toLowerCase().trim()
      );

      if (existing) {
         const updated = { 
            ...existing, 
            ...shop, 
            id: existing.id, 
            updatedAt: now 
         };
         await idbPut(STORES.SHOPPING, updated);
      } else {
         await idbPut(STORES.SHOPPING, { ...shop, createdAt: now, updatedAt: now });
      }
    }
    notifyDataChanged('shopping', 'save', {});`;
    
    content = content.replace(targetUpsert, replacementUpsert);
    
    fs.writeFileSync('src/storage/storageService.ts', content, 'utf8');
    console.log("storageService.ts updated with Ristoranti and Shopping logic");
} else {
    console.log("Target content not found in storageService.ts");
}
