const fs = require('fs');
const path = require('path');

const cardsDir = path.join('src', 'components', 'cards');
const cardFiles = fs.readdirSync(cardsDir).filter(f => f.endsWith('Card.tsx') && !f.includes('GiornoCard'));

for (const file of cardFiles) {
  const filePath = path.join(cardsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  let entityType = '';
  let costProp = '';
  let saveFunc = '';
  let paymentProp = '';
  let entityName = '';

  if (file === 'AttivitaCard.tsx') { entityType = 'Attivita'; costProp = 'cost'; saveFunc = 'saveActivity'; paymentProp = 'paymentStatus'; entityName = 'activity'; }
  if (file === 'TrasportoCard.tsx') { entityType = 'Trasporto'; costProp = 'cost'; saveFunc = 'saveTransport'; paymentProp = 'status'; entityName = 'transport'; }
  if (file === 'AlloggioCard.tsx') { entityType = 'Alloggio'; costProp = 'cost'; saveFunc = 'saveAccommodation'; paymentProp = 'status'; entityName = 'accommodation'; }
  if (file === 'RistoranteCard.tsx') { entityType = 'Ristorante'; costProp = 'budget'; saveFunc = 'updateRistorante'; paymentProp = 'status'; entityName = 'ristorante'; }
  if (file === 'ShoppingCard.tsx') { entityType = 'Shopping'; costProp = 'budget'; saveFunc = 'updateShopping'; paymentProp = 'status'; entityName = 'shopping'; }
  if (file === 'TappaCard.tsx') { entityType = 'Tappa'; costProp = 'cost'; saveFunc = 'saveTappa'; paymentProp = 'status'; entityName = 'tappa'; }

  // 1. Add storageService import if not there
  if (!content.includes('import { storageService }')) {
    content = content.replace(/(import .*?;[\r\n]+)/, `$1import { storageService } from '../../storage/storageService';\n`);
  }
  // Add UniversalCopilotaModal import if not there
  if (!content.includes('import UniversalCopilotaModal')) {
    content = content.replace(/(import .*?;[\r\n]+)/, `$1import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\n`);
  }
  // Add parseEuro / parseNumber logic import if not there (we can just define a small helper inside)

  // 2. Inject state and toggle logic inside the component
  const toggleLogic = `
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  
  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const current = ${entityName};
      const rawCostStr = current.${costProp};
      let rawCost = 0;
      if (rawCostStr && typeof rawCostStr === 'string') {
        rawCost = parseFloat(rawCostStr.replace(/[^0-9,.-]/g, '').replace(',', '.'));
      } else if (typeof rawCostStr === 'number') {
        rawCost = rawCostStr;
      }
      
      const isSaldato = current.${paymentProp} === 'saldato' || current.${paymentProp} === 'completato' || current.completed;
      
      const updated = { ...current };
      const newStatus = isSaldato ? 'da_saldare' : 'saldato';
      
      if ('${paymentProp}' === 'status') {
        updated.status = newStatus as any;
      } else {
        updated.paymentStatus = newStatus as any;
        updated.status = newStatus as any;
      }
      
      if ('completed' in updated) {
         updated.completed = !isSaldato;
      }

      if ('amountPaid' in updated || 'depositPaid' in updated || 'acconto' in updated) {
        if (!isSaldato) {
           if ('depositPaid' in updated) updated.depositPaid = updated.${costProp};
           if ('amountPaid' in updated) updated.amountPaid = updated.${costProp};
           if ('acconto' in updated) updated.acconto = updated.${costProp};
        } else {
           if ('depositPaid' in updated) updated.depositPaid = "0";
           if ('amountPaid' in updated) updated.amountPaid = "0";
           if ('acconto' in updated) updated.acconto = "0";
        }
      }

      updated.updatedAt = Date.now();
      
      if ('${saveFunc}' === 'updateRistorante' || '${saveFunc}' === 'updateShopping') {
        await storageService.${saveFunc}(current.id, updated as any);
      } else {
        await storageService.${saveFunc}(updated as any);
      }
      
      if (typeof onUpdate === 'function') {
        onUpdate(updated as any);
      }
      
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { entityType: '${entityName}', action: 'update', data: updated }
      }));
    } catch (err) {
      console.error("Errore toggle payment", err);
    }
  };

  const hasCopilotNotes = Boolean(${entityName}.noteCopilota?.trim() || ${entityName}.notes?.trim());
`;

  if (!content.includes('const handleTogglePayment')) {
    // Find the opening brace of the component
    const componentRegex = new RegExp(`export default function ${file.replace('.tsx', '')}\\([^\\)]+\\) \\{`);
    content = content.replace(componentRegex, (match) => match + toggleLogic);
  }

  // 3. Render the interactive payment badge next to the cost
  // We'll replace the cost rendering block.
  // Actually, let's find the div containing the cost and replace it.
  const costRegex = /<div className="flex items-center">[\s\S]*?<\/div>/;
  
  if (content.match(costRegex) && !content.includes('handleTogglePayment(e)')) {
    const newCostBlock = `<div className="flex items-center gap-2">
            {(!${entityName}.${costProp} || isNaN(parseFloat(String(${entityName}.${costProp}).replace(/[^0-9,.-]/g, '').replace(',', '.'))) || parseFloat(String(${entityName}.${costProp}).replace(/[^0-9,.-]/g, '').replace(',', '.')) === 0) ? (
              <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                Gratuito
              </span>
            ) : (
              <span className="text-sm font-semibold text-gray-800 bg-slate-50 dark:bg-slate-800 dark:text-slate-200 px-2 py-1 rounded-md">
                {String(${entityName}.${costProp})}
              </span>
            )}
            
            {${entityName}.${costProp} && String(${entityName}.${costProp}) !== '0' && (
              <span 
                onClick={handleTogglePayment}
                className={\`cursor-pointer hover:opacity-80 active:scale-95 transition-all text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs hover:shadow-sm \${
                  (${entityName}.${paymentProp} === 'saldato' || ${entityName}.${paymentProp} === 'completato' || ${entityName}.completed)
                    ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400" 
                    : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400"
                }\`}
              >
                {(${entityName}.${paymentProp} === 'saldato' || ${entityName}.${paymentProp} === 'completato' || ${entityName}.completed) ? '✓ Saldato' : '⏳ Da saldare'}
              </span>
            )}
          </div>`;
    
    content = content.replace(costRegex, newCostBlock);
  }

  // 4. Update the Copilot badge and remove inline notes
  // First, remove inline notes
  const notesRegex = /\{[^}]*\.notes && \(\s*<p className="text-xs text-slate-700[^>]*>\s*\{[^}]*\.notes\}\s*<\/p>\s*\)\}/;
  if (notesRegex.test(content)) {
    content = content.replace(notesRegex, '');
  }

  // Update Copilot badge
  // Replace existing copilot badge logic
  const copilotBadgeRegex = /\{[^}]*\.copilota && \(\s*<button[^>]*onClick=\{[^}]*\}[^>]*>[\s\S]*?<\/button>\s*\)\}/;
  const newCopilotBadge = `{hasCopilotNotes && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
                className={\`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors shadow-sm \${
                  ${entityName}.noteCopilota?.trim()
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300'
                }\`}
                title="Apri per visualizzare la nota del co-pilota"
              >
                🧭 Co-pilota
              </button>
            )}`;

  if (copilotBadgeRegex.test(content)) {
    content = content.replace(copilotBadgeRegex, newCopilotBadge);
  } else {
    // If not found, inject it in the top right corner
    // Usually `<div className="flex items-center gap-2">` near the TOP
    const topCornerRegex = /<div className="flex items-center gap-2">/;
    content = content.replace(topCornerRegex, `<div className="flex items-center gap-2">\n            ${newCopilotBadge}`);
  }

  // Inject UniversalCopilotaModal JSX at the end before `</>`
  if (!content.includes('<UniversalCopilotaModal')) {
    content = content.replace(/(<\/>\s*\);\s*\}\s*)$/m, `
      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={${entityName}.title || ${entityName}.name || 'Dettaglio'}
        noteCopilota={${entityName}.noteCopilota || ${entityName}.notes || ''}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...${entityName}, noteCopilota: notes.trim(), updatedAt: Date.now() };
            if ('${saveFunc}' === 'updateRistorante' || '${saveFunc}' === 'updateShopping') {
              await storageService.${saveFunc}(${entityName}.id, updated as any);
            } else {
              await storageService.${saveFunc}(updated as any);
            }
            if (typeof onUpdate === 'function') onUpdate(updated as any);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
              detail: { entityType: '${entityName}', action: 'update', data: updated }
            }));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
    $1`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Patched', file);
}
