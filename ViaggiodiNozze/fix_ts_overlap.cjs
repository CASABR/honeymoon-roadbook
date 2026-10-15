const fs = require('fs');
const path = require('path');

const dir = path.join('src', 'components', 'cards');

// Fix AlloggioCard
let f = path.join(dir, 'AlloggioCard.tsx');
let c = fs.readFileSync(f, 'utf8');
c = c.replace(/import { useState } from 'react';\nimport { useState } from 'react';/, "import { useState } from 'react';");
c = c.replace(/\{ accommodation, onEdit \}: AlloggioCardProps/, "{ accommodation, onEdit, onUpdate }: AlloggioCardProps");
c = c.replace(/if \('AlloggioCard\.tsx' === 'AttivitaCard\.tsx'\)[\s\S]*?if \('AlloggioCard\.tsx' === 'AlloggioCard\.tsx'\) await storageService\.saveAccommodation\(updated\);/, "await storageService.saveAccommodation(updated);");
c = c.replace(/if \('AlloggioCard\.tsx' === 'AttivitaCard\.tsx'\) await storageService\.saveActivity\(updated\);\s*if \('AlloggioCard\.tsx' === 'TrasportoCard\.tsx'\) await storageService\.saveTransport\(updated\);\s*if \('AlloggioCard\.tsx' === 'AlloggioCard\.tsx'\) await storageService\.saveAccommodation\(updated\);/g, "await storageService.saveAccommodation(updated);");
fs.writeFileSync(f, c, 'utf8');

// Fix AttivitaCard
f = path.join(dir, 'AttivitaCard.tsx');
c = fs.readFileSync(f, 'utf8');
if (!c.includes('<UniversalCopilotaModal')) {
    // Append it!
    c = c.replace(/(<\/div>\s*\);\s*\})/m, `
      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={activity.title || 'Dettaglio'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...activity, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            await storageService.saveActivity(updated);
            try { if (eval("typeof onUpdate === 'function'")) eval("onUpdate(updated)"); } catch(e){}
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    </div>
  );
}`);
}
fs.writeFileSync(f, c, 'utf8');

// Fix TrasportoCard
f = path.join(dir, 'TrasportoCard.tsx');
c = fs.readFileSync(f, 'utf8');
if (!c.includes('<UniversalCopilotaModal')) {
    // Append it!
    c = c.replace(/(<\/div>\s*\);\s*\})/m, `
      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={'Dettaglio Trasporto'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...transport, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            await storageService.saveTransport(updated);
            try { if (eval("typeof onUpdate === 'function'")) eval("onUpdate(updated)"); } catch(e){}
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    </div>
  );
}`);
}
c = c.replace(/\{transport\.notes && \(/g, "{(transport as any).notes && (");
c = c.replace(/\{transport\.notes\}/g, "{(transport as any).notes}");
fs.writeFileSync(f, c, 'utf8');


// Fix RistoranteCard
f = path.join(dir, 'RistoranteCard.tsx');
c = fs.readFileSync(f, 'utf8');
c = c.replace(/if \('updateRistorante' === 'updateRistorante' \|\| 'updateRistorante' === 'updateShopping'\) \{\s*await storageService\.updateRistorante\(ristorante\.id, updated\);\s*\} else \{\s*await storageService\.updateRistorante\(updated\);\s*\}/, "await storageService.updateRistorante(ristorante.id, updated);");
fs.writeFileSync(f, c, 'utf8');

// Fix ShoppingCard
f = path.join(dir, 'ShoppingCard.tsx');
c = fs.readFileSync(f, 'utf8');
c = c.replace(/if \('updateShopping' === 'updateRistorante' \|\| 'updateShopping' === 'updateShopping'\) \{\s*await storageService\.updateShopping\(shopping\.id, updated\);\s*\} else \{\s*await storageService\.updateShopping\(updated\);\s*\}/, "await storageService.updateShopping(shopping.id, updated);");
fs.writeFileSync(f, c, 'utf8');

// Fix TappaCard
f = path.join(dir, 'TappaCard.tsx');
c = fs.readFileSync(f, 'utf8');
c = c.replace(/if \('saveTappa' === 'updateRistorante' \|\| 'saveTappa' === 'updateShopping'\) \{\s*await storageService\.saveTappa\(tappa\.id, updated\);\s*\} else \{\s*await storageService\.saveTappa\(updated\);\s*\}/, "await storageService.saveTappa(updated);");
fs.writeFileSync(f, c, 'utf8');

console.log('Fixed TS overlap issues');
