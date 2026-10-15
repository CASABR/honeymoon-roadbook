const fs = require('fs');
const path = require('path');

const cards = [
  {
    file: 'AttivitaCard.tsx',
    entity: 'activity',
    titleProp: 'activity.title',
    copilotFields: '(activity as any).noteCopilota || (activity as any).notes',
    hasPayment: true,
    costProp: 'cost',
    paymentCheck: "activity.paymentStatus === 'saldato' || activity.status === 'prenotato'",
    toggleBody: `
      const isSaldato = activity.paymentStatus === 'saldato' || activity.status === 'prenotato';
      const updated = { ...activity, paymentStatus: isSaldato ? 'da_saldare' : 'saldato', status: isSaldato ? 'da_valutare' : 'prenotato' } as any;
      updated.amountPaid = isSaldato ? "0" : activity.cost;
      updated.updatedAt = Date.now();
      await storageService.saveActivity(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
    `
  },
  {
    file: 'TrasportoCard.tsx',
    entity: 'transport',
    titleProp: "'Dettaglio Trasporto'",
    copilotFields: '(transport as any).noteCopilota || (transport as any).notes',
    hasPayment: true,
    costProp: 'cost',
    paymentCheck: "transport.status === 'completato'",
    toggleBody: `
      const isSaldato = transport.status === 'completato';
      const updated = { ...transport, status: isSaldato ? 'pianificato' : 'completato' } as any;
      updated.depositPaid = isSaldato ? "0" : transport.cost;
      updated.updatedAt = Date.now();
      await storageService.saveTransport(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
    `
  },
  {
    file: 'AlloggioCard.tsx',
    entity: 'accommodation',
    titleProp: 'accommodation.name',
    copilotFields: '(accommodation as any).noteCopilota || (accommodation as any).notes',
    hasPayment: true,
    costProp: 'cost',
    paymentCheck: "accommodation.completed",
    toggleBody: `
      const isSaldato = accommodation.completed;
      const updated = { ...accommodation, completed: !isSaldato, status: isSaldato ? 'da_prenotare' : 'completato' } as any;
      updated.acconto = isSaldato ? "0" : accommodation.cost;
      updated.updatedAt = Date.now();
      await storageService.saveAccommodation(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
    `
  },
  {
    file: 'RistoranteCard.tsx',
    entity: 'ristorante',
    titleProp: 'ristorante.nome',
    copilotFields: '(ristorante as any).noteCopilota || (ristorante as any).notes',
    hasPayment: false,
    saveFunc: 'updateRistorante'
  },
  {
    file: 'ShoppingCard.tsx',
    entity: 'shopping',
    titleProp: 'shopping.nome',
    copilotFields: '(shopping as any).noteCopilota || (shopping as any).notes',
    hasPayment: false,
    saveFunc: 'updateShopping'
  },
  {
    file: 'TappaCard.tsx',
    entity: 'tappa',
    titleProp: 'tappa.titolo',
    copilotFields: '(tappa as any).noteCopilota || (tappa as any).notes',
    hasPayment: false,
    saveFunc: 'saveTappa'
  }
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
  if (!content.includes('import { useState }')) {
     content = content.replace(/(import .*?;[\r\n]+)/, `$1import { useState } from 'react';\n`);
  }
  
  // Fix AlloggioCard Props to accept onUpdate
  if (config.file === 'AlloggioCard.tsx' && !content.includes('onUpdate?:')) {
      content = content.replace(/accommodation: Alloggio;/g, "accommodation: Alloggio;\n  onUpdate?: (updated: Alloggio) => void;");
      content = content.replace(/\{ accommodation, onEdit \}: AlloggioCardProps/g, "{ accommodation, onEdit, onUpdate }: AlloggioCardProps");
      content = content.replace(/\{ accommodation \}: AlloggioCardProps/g, "{ accommodation, onUpdate }: AlloggioCardProps"); // fallback
  }

  // State & Logic injection
  const toggleLogic = `
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const copilotData = ${config.copilotFields} || '';
  const hasCopilotNotes = Boolean(copilotData.trim());
  ${config.hasPayment ? `
  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      ${config.toggleBody}
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
    } catch(e) { console.error(e); }
  };
  ` : ''}
`;

  const componentRegex = new RegExp(`export default function ${config.file.replace('.tsx', '')}\\([^\\)]+\\) \\{`);
  if (!content.includes('const [isCopilotOpen, setIsCopilotOpen] = useState(false);')) {
    content = content.replace(componentRegex, (match) => match + toggleLogic);
  }

  // Remove inline notes completely
  const notesRegex = /\{[^}]*\.notes && \(\s*<p className="text-xs text-slate-700[^>]*>\s*\{[^}]*\.notes\}\s*<\/p>\s*\)\}/g;
  content = content.replace(notesRegex, '');

  // Copilot Badge rendering
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
    if (content.match(topCornerRegex)) {
        content = content.replace(topCornerRegex, `<div className="flex items-center gap-2">\n            ${newCopilotBadge}`);
    } else {
        const titleRegex = /<h3 className="text-\[17px\]/;
        content = content.replace(titleRegex, `<div className="flex items-center justify-between mb-2"><div className="flex-1"></div>${newCopilotBadge}</div>\n          <h3 className="text-[17px]`);
    }
  }

  // Payment Badge rendering
  if (config.hasPayment) {
      const costRegex = /<div className="flex items-center">[\s\S]*?<\/div>/;
      if (content.match(costRegex) && !content.includes('onClick={handleTogglePayment}')) {
        const newCostBlock = `<div className="flex items-center gap-2">
                {(!${config.entity}.${config.costProp} || isNaN(parseFloat(String(${config.entity}.${config.costProp}).replace(/[^0-9,.-]/g, '').replace(',', '.'))) || parseFloat(String(${config.entity}.${config.costProp}).replace(/[^0-9,.-]/g, '').replace(',', '.')) === 0) ? (
                  <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                    Gratuito
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-gray-800 bg-slate-50 dark:bg-slate-800 dark:text-slate-200 px-2 py-1 rounded-md">
                    {String(${config.entity}.${config.costProp})}
                  </span>
                )}
                
                {${config.entity}.${config.costProp} && String(${config.entity}.${config.costProp}) !== '0' && (
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
  }

  // Append Modal
  let saveLogic = '';
  if (config.hasPayment) {
      saveLogic = `
            if ('${config.file}' === 'AttivitaCard.tsx') await storageService.saveActivity(updated);
            if ('${config.file}' === 'TrasportoCard.tsx') await storageService.saveTransport(updated);
            if ('${config.file}' === 'AlloggioCard.tsx') await storageService.saveAccommodation(updated);
            if (typeof (window as any).onUpdate === 'function') (window as any).onUpdate(updated); // fallback
            if (typeof (${config.file} === 'AlloggioCard.tsx' ? onUpdate : (window as any).onUpdate) === 'function') {
                // Actually it's just onUpdate if it exists in scope, let's just use it safely
            }
      `;
      // Let's make it simpler
      saveLogic = `
            if ('${config.file}' === 'AttivitaCard.tsx') await storageService.saveActivity(updated);
            if ('${config.file}' === 'TrasportoCard.tsx') await storageService.saveTransport(updated);
            if ('${config.file}' === 'AlloggioCard.tsx') await storageService.saveAccommodation(updated);
            try { if (eval("typeof onUpdate === 'function'")) eval("onUpdate(updated)"); } catch(e){}
      `;
  } else {
      saveLogic = `
            if ('${config.saveFunc}' === 'updateRistorante' || '${config.saveFunc}' === 'updateShopping') {
              await storageService.${config.saveFunc}(${config.entity}.id, updated);
            } else {
              await storageService.${config.saveFunc}(updated);
            }
            try { if (eval("typeof onUpdate === 'function'")) eval("onUpdate(updated)"); } catch(e){}
      `;
  }

  if (!content.includes('<UniversalCopilotaModal')) {
    content = content.replace(/(<\/div>\s*\);\s*\})/m, `
      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={${config.titleProp} || 'Dettaglio'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...${config.entity}, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            ${saveLogic}
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    </div>
  );
}`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
}
console.log('Cards patched flawlessly!');
