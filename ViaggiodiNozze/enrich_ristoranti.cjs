const fs = require('fs');

function refactorRistorantiView() {
    let content = fs.readFileSync('src/views/altro/RistorantiView.tsx', 'utf8');

    if (!content.includes('import { enrichRistorante }')) {
        content = content.replace(/import { getTripDateRange, type TripDayItem } from '\.\.\/\.\.\/utils\/tripDates';/, 
            "import { getTripDateRange, type TripDayItem } from '../../utils/tripDates';\nimport { enrichRistorante } from '../../services/enrichmentService';");
    }

    // Add enrichment logic inside loadData
    const setRistorantiStr = "setRistoranti(loadedRistoranti || []);";
    const enrichmentLogic = `setRistoranti(loadedRistoranti || []);

      // Background Enrichment
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setTimeout(async () => {
          const toEnrich = (loadedRistoranti || []).filter(r => 
            r.nome && (!r.telefono || !r.linkPrenotazione) && !r._enriched
          );
          for (const r of toEnrich) {
            try {
              const enrichedData = await enrichRistorante(r.nome, r.indirizzo || '');
              if (enrichedData.telefono || enrichedData.linkMenu) {
                const updated = { 
                  ...r, 
                  telefono: r.telefono || enrichedData.telefono || '', 
                  linkPrenotazione: r.linkPrenotazione || enrichedData.linkMenu || '',
                  _enriched: true 
                };
                await storageService.updateRistorante(updated.id, updated as any);
                setRistoranti(prev => prev.map(pr => pr.id === updated.id ? updated as any : pr));
              } else {
                // segna come arricchito per non riprovare
                const updated = { ...r, _enriched: true };
                await storageService.updateRistorante(updated.id, updated as any);
              }
            } catch (e) {
              console.error("Errore durante auto-enrichment:", e);
            }
          }
        }, 3000);
      }`;
    
    if (!content.includes('Background Enrichment')) {
        content = content.replace(setRistorantiStr, enrichmentLogic);
    }

    fs.writeFileSync('src/views/altro/RistorantiView.tsx', content, 'utf8');
    console.log("Updated RistorantiView.tsx");
}

refactorRistorantiView();

// Also update Ristorante interface in src/types/index.ts to allow _enriched
function updateTypes() {
    let content = fs.readFileSync('src/types/index.ts', 'utf8');
    if (!content.includes('_enriched?: boolean;')) {
        content = content.replace(/linkPrenotazione\?: string;/g, "linkPrenotazione?: string;\n  _enriched?: boolean;");
        fs.writeFileSync('src/types/index.ts', content, 'utf8');
        console.log("Updated src/types/index.ts");
    }
}
updateTypes();
