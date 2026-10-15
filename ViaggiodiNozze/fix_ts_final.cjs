const fs = require('fs');
const path = require('path');
const dir = path.join('src', 'components', 'cards');

// Fix AlloggioCard
let f = path.join(dir, 'AlloggioCard.tsx');
let c = fs.readFileSync(f, 'utf8');
c = c.replace(/import { useState } from 'react';\nimport UniversalCopilotaModal from '\.\.\/modals\/UniversalCopilotaModal';\nimport \{ storageService \} from '\.\.\/\.\.\/storage\/storageService';\nimport type \{ Alloggio \} from '\.\.\/\.\.\/types';/g, "import { useState } from 'react';\nimport UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\nimport { storageService } from '../../storage/storageService';\nimport type { Alloggio } from '../../types';");
c = c.replace(/export default function AlloggioCard\(\{ accommodation, onEdit, onUpdate \}: AlloggioCardProps\) \{/, "export default function AlloggioCard({ accommodation, onEdit, onUpdate }: AlloggioCardProps & { onUpdate?: (updated: Alloggio) => void }) {");
fs.writeFileSync(f, c, 'utf8');

// Fix AttivitaCard
f = path.join(dir, 'AttivitaCard.tsx');
c = fs.readFileSync(f, 'utf8');
if (!c.includes('<UniversalCopilotaModal')) {
    c = c.replace(/<\/div>\s*<\/div>\s*<AttivitaTicketsModal/, `</div>
    </div>
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
    c = c.replace(/<\/div>\s*<\/div>\s*<\/div>\s*\)/, `</div>
          </div>
        </div>
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
      )`);
}
fs.writeFileSync(f, c, 'utf8');

console.log('Fixed remainder TS');
