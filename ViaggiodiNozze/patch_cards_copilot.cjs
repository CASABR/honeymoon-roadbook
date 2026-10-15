const fs = require('fs');
const path = require('path');

const cards = [
  { file: 'RistoranteCard.tsx', entityName: 'ristorante', titleProp: 'ristorante.name', saveFunc: 'updateRistorante' },
  { file: 'ShoppingCard.tsx', entityName: 'shopping', titleProp: 'shopping.nome', saveFunc: 'updateShopping' },
  { file: 'TappaCard.tsx', entityName: 'tappa', titleProp: 'tappa.titolo', saveFunc: 'saveTappa' }
];

const dir = path.join('src', 'components', 'cards');

for (const config of cards) {
  const filePath = path.join(dir, config.file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Imports
  if (!content.includes('import { storageService }')) {
    content = content.replace(/(import .*?;[\r\n]+)/, `$1import { storageService } from '../../storage/storageService';\n`);
  }
  if (!content.includes('import UniversalCopilotaModal')) {
    content = content.replace(/(import .*?;[\r\n]+)/, `$1import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\n`);
  }

  // State
  const toggleLogic = `
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const noteCopilotaVal = (${config.entityName} as any).noteCopilota || '';
  const notesVal = (${config.entityName} as any).notes || '';
  const hasCopilotNotes = Boolean(noteCopilotaVal.trim() || notesVal.trim());
`;

  const componentRegex = new RegExp(`export default function ${config.file.replace('.tsx', '')}\\([^\\)]+\\) \\{`);
  if (!content.includes('const [isCopilotOpen, setIsCopilotOpen] = useState(false);')) {
    content = content.replace(componentRegex, (match) => match + toggleLogic);
  }
  
  if (!content.includes('import { useState }')) {
     content = content.replace(/(import .*?;[\r\n]+)/, `$1import { useState } from 'react';\n`);
  }

  // Remove inline notes
  const notesRegex = /\{[^}]*\.notes && \(\s*<p className="text-xs text-slate-700[^>]*>\s*\{[^}]*\.notes\}\s*<\/p>\s*\)\}/g;
  content = content.replace(notesRegex, '');

  // Copilot Badge
  const newCopilotBadge = `{true && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
                className={\`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors shadow-sm \${
                  hasCopilotNotes
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300'
                }\`}
                title="Apri note Copilota"
              >
                🧭 Co-pilota
              </button>
            )}`;

  const copilotBtnRegex = /\{[^}]*\.copilota && \(\s*<button[^>]*onClick=\{[^}]*\}[^>]*>[\s\S]*?<\/button>\s*\)\}/;
  if (copilotBtnRegex.test(content)) {
    content = content.replace(copilotBtnRegex, newCopilotBadge);
  } else {
    const topCornerRegex = /<div className="flex items-center gap-2">/;
    content = content.replace(topCornerRegex, `<div className="flex items-center gap-2">\n            ${newCopilotBadge}`);
  }

  // Append Modal
  if (!content.includes('<UniversalCopilotaModal')) {
    content = content.replace(/(<\/>\s*\);\s*\}\s*)$/m, `
      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={${config.titleProp} || 'Dettaglio'}
        noteCopilota={noteCopilotaVal || notesVal || ''}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...${config.entityName}, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            if ('${config.saveFunc}' === 'updateRistorante' || '${config.saveFunc}' === 'updateShopping') {
              await storageService.${config.saveFunc}(${config.entityName}.id, updated);
            } else {
              await storageService.${config.saveFunc}(updated);
            }
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    $1`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
}
console.log('Other cards patched!');
