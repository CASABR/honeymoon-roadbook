const fs = require('fs');

let content = fs.readFileSync('src/storage/storageService.ts', 'utf8');

// Insert deduplication for activities in seedRealActivities
const targetContent = `
    // --- SEED ATTIVITÀ REALI ---
    async seedRealActivities(): Promise<void> {
      try {
        console.log('[StorageService] Avvio seeding forzato attività reali...');
        const now = Date.now();
        
        // Inseriamo o sovrascriviamo le attività reali. 
        // Poiché hanno un 'id' fisso in seedActivities.ts, idbPut aggiornerà quelle esistenti o creerà le nuove.
        for (const act of REAL_ACTIVITIES) {
          await this.saveActivity({ ...act, createdAt: now, updatedAt: now } as any);
        }
`;

const replacementContent = `
    // --- SEED ATTIVITÀ REALI ---
    async seedRealActivities(): Promise<void> {
      try {
        console.log('[StorageService] Avvio seeding forzato attività reali...');
        const now = Date.now();
        const existingActivities = await idbGetAll<Attivita>(STORES.ATTIVITA);
        
        // Upsert rigoroso basato su date + title
        for (const act of REAL_ACTIVITIES) {
          // Cerca se esiste già un'attività per la stessa data con nome simile (incluso lower/upper case)
          const existing = existingActivities.find(e => 
            e.date === act.date && 
            e.title.toLowerCase().trim() === act.title.toLowerCase().trim()
          );

          if (existing) {
             // Aggiorna l'esistente
             const updated = { 
                ...existing, 
                ...act, 
                id: existing.id, 
                updatedAt: now 
             };
             await this.saveActivity(updated as any);
          } else {
             // Creazione nuova (con ID che potrebbe collidere, se lo fa sovrascrive)
             await this.saveActivity({ ...act, createdAt: now, updatedAt: now } as any);
          }
        }
        
        // Pulizia eventuali duplicati (stessa data, titolo diverso ma in realtà era lo stesso ev. "Waitomo Glowworm Caves" vs "Waitomo Caves (Glowworm Caves Tour)")
        const updatedActivities = await idbGetAll<Attivita>(STORES.ATTIVITA);
        for (const act of updatedActivities) {
            if (act.title === 'Waitomo Glowworm Caves' && act.id !== 'att_05') {
                 await this.deleteActivity(act.id);
            }
            if (act.title === 'Ruakuri Bushwalk' || act.title === 'Te Pā Tū (Esperienza Culturale Māori)' || act.title === 'Waiotapu Thermal Wonderland') {
                 await this.deleteActivity(act.id);
            }
        }
`;

if (content.includes('async seedRealActivities()')) {
    content = content.replace(targetContent, replacementContent);
    fs.writeFileSync('src/storage/storageService.ts', content, 'utf8');
    console.log("Updated storageService.ts for activities deduplication.");
} else {
    console.log("Could not find seedRealActivities in storageService.ts");
}
