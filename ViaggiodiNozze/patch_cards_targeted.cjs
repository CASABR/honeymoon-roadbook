const fs = require('fs');
const path = require('path');

// MAPS for types
// We only want to add Payment toggle to Attivita, Trasporto, Alloggio (and maybe Ristorante/Shopping if they have it).
// Actually, let's just do it for Attivita, Trasporto, Alloggio which are the main ones in OggiView.

const cards = [
  {
    file: 'AttivitaCard.tsx',
    entityName: 'activity',
    hasCost: true,
    costProp: 'cost',
    paymentCheck: "activity.paymentStatus === 'saldato' || activity.status === 'completato'",
    toggleBody: `
      const isSaldato = activity.paymentStatus === 'saldato' || activity.status === 'completato';
      const updated = { ...activity, paymentStatus: isSaldato ? 'da_saldare' : 'saldato', status: isSaldato ? 'prenotato' : 'completato' } as any;
      updated.amountPaid = isSaldato ? "0" : activity.cost;
      updated.updatedAt = Date.now();
      await storageService.saveActivity(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
    `,
    titleProp: 'activity.title'
  },
  {
    file: 'TrasportoCard.tsx',
    entityName: 'transport',
    hasCost: true,
    costProp: 'cost',
    paymentCheck: "transport.status === 'completato'",
    toggleBody: `
      const isSaldato = transport.status === 'completato';
      const updated = { ...transport, status: isSaldato ? 'prenotato' : 'completato' } as any;
      updated.depositPaid = isSaldato ? "0" : transport.cost;
      updated.updatedAt = Date.now();
      await storageService.saveTransport(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
    `,
    titleProp: "'Dettaglio Trasporto'"
  },
  {
    file: 'AlloggioCard.tsx',
    entityName: 'accommodation',
    hasCost: true,
    costProp: 'cost',
    paymentCheck: "accommodation.completed",
    toggleBody: `
      const isSaldato = accommodation.completed;
      const updated = { ...accommodation, completed: !isSaldato, status: isSaldato ? 'prenotato' : 'confermato' } as any;
      updated.acconto = isSaldato ? "0" : accommodation.cost;
      updated.updatedAt = Date.now();
      await storageService.saveAccommodation(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
    `,
    titleProp: "accommodation.name"
  }
];

const dir = path.join('src', 'components', 'cards');

for (const config of cards) {
  const filePath = path.join(dir, config.file);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Imports
  if (!content.includes('import { storageService }')) {
    content = content.replace(/(import .*?;[\r\n]+)/, `$1import { storageService } from '../../storage/storageService';\n`);
  }
  if (!content.includes('import UniversalCopilotaModal')) {
    content = content.replace(/(import .*?;[\r\n]+)/, `$1import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\n`);
  }

  // 2. State & Toggle functions
  const toggleLogic = `
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      ${config.toggleBody}
    } catch (err) {
      console.error(err);
    }
  };
  const noteCopilotaVal = (${config.entityName} as any).noteCopilota || '';
  const notesVal = (${config.entityName} as any).notes || '';
  const hasCopilotNotes = Boolean(noteCopilotaVal.trim() || notesVal.trim());
`;

  const componentRegex = new RegExp(`export default function ${config.file.replace('.tsx', '')}\\([^\\)]+\\) \\{`);
  if (!content.includes('handleTogglePayment')) {
    content = content.replace(componentRegex, (match) => match + toggleLogic);
  }

  // 3. Remove inline notes completely
  const notesRegex = /\{[^}]*\.notes && \(\s*<p className="text-xs text-slate-700[^>]*>\s*\{[^}]*\.notes\}\s*<\/p>\s*\)\}/g;
  content = content.replace(notesRegex, '');

  // 4. Copilot Badge
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

  // Find existing copilot button and replace
  const copilotBtnRegex = /\{[^}]*\.copilota && \(\s*<button[^>]*onClick=\{[^}]*\}[^>]*>[\s\S]*?<\/button>\s*\)\}/;
  if (copilotBtnRegex.test(content)) {
    content = content.replace(copilotBtnRegex, newCopilotBadge);
  } else {
    // Or insert at top right flex
    const topCornerRegex = /<div className="flex items-center gap-2">/;
    content = content.replace(topCornerRegex, `<div className="flex items-center gap-2">\n            ${newCopilotBadge}`);
  }

  // 5. Payment Badge
  const costRegex = /<div className="flex items-center">[\s\S]*?<\/div>/;
  if (content.match(costRegex) && !content.includes('onClick={handleTogglePayment}')) {
    const newCostBlock = `<div className="flex items-center gap-2">
            {(!${config.entityName}.${config.costProp} || isNaN(parseFloat(String(${config.entityName}.${config.costProp}).replace(/[^0-9,.-]/g, '').replace(',', '.'))) || parseFloat(String(${config.entityName}.${config.costProp}).replace(/[^0-9,.-]/g, '').replace(',', '.')) === 0) ? (
              <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                Gratuito
              </span>
            ) : (
              <span className="text-sm font-semibold text-gray-800 bg-slate-50 dark:bg-slate-800 dark:text-slate-200 px-2 py-1 rounded-md">
                {String(${config.entityName}.${config.costProp})}
              </span>
            )}
            
            {${config.entityName}.${config.costProp} && String(${config.entityName}.${config.costProp}) !== '0' && (
              <span 
                onClick={handleTogglePayment}
                className={\`cursor-pointer hover:opacity-80 active:scale-95 transition-all text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs hover:shadow-sm \${
                  (${config.paymentCheck})
                    ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400" 
                    : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400"
                }\`}
              >
                {(${config.paymentCheck}) ? '✓ Saldato' : '⏳ Da saldare'}
              </span>
            )}
          </div>`;
    content = content.replace(costRegex, newCostBlock);
  }

  // 6. Append Modal
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
            await storageService.${config.file === 'AttivitaCard.tsx' ? 'saveActivity' : config.file === 'TrasportoCard.tsx' ? 'saveTransport' : 'saveAccommodation'}(updated);
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
console.log('Cards patched!');
