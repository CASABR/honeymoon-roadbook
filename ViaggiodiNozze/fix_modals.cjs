const fs = require('fs');
const path = require('path');
const dir = path.join('src', 'components', 'cards');

// Fix AttivitaCard
let f = path.join(dir, 'AttivitaCard.tsx');
let c = fs.readFileSync(f, 'utf8');
if (!c.includes('<UniversalCopilotaModal')) {
    c = c.replace(/<AttivitaTicketsModal/, `
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
      <AttivitaTicketsModal`);
}
fs.writeFileSync(f, c, 'utf8');

// Fix TrasportoCard
f = path.join(dir, 'TrasportoCard.tsx');
c = fs.readFileSync(f, 'utf8');
if (!c.includes('<UniversalCopilotaModal')) {
    c = c.replace(/<TrasportoTicketsModal/, `
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
      <TrasportoTicketsModal`);
}
fs.writeFileSync(f, c, 'utf8');

console.log('Fixed UniversalCopilotaModal!');
