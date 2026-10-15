const fs = require('fs');
const path = require('path');

const file = path.join('src', 'views', 'altro', 'SpeseBudgetView.tsx');
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('handleTogglePaidStatus')) {
  // Add handleTogglePaidStatus just after handleDeleteExpense
  const target1 = `const handleDeleteExpense = async (e: UnifiedExpense, ev: React.MouseEvent) => {`;
  const toggleFunc = `const handleTogglePaidStatus = async (item: UnifiedExpense, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!canEdit) return;

    const actuallyPaid = item.paidAmount || (item.paid ? item.cost : 0);
    const remaining = Math.max(0, item.cost - actuallyPaid);
    const isFullyPaid = item.paid || remaining === 0;

    const newStatus = isFullyPaid ? 'da_saldare' : 'completato';
    const newPaidStr = isFullyPaid ? "0" : item.cost.toString();
    const newCostStr = item.cost.toString();
    
    await handleUpdateExpense(item, newCostStr, newPaidStr, newStatus);
  };

  `;

  content = content.replace(target1, toggleFunc + target1);

  // Replace rendering part
  const oldJSX = `            {/* Visualizzazione Parziale o Badge Stato */}
            <div className="mt-2">
              {isPartiallyPaid ? (
                <div className="flex items-center gap-2 text-[10px] font-bold">
                  <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                    🟢 Saldato: {formatEuro(actuallyPaid)}
                  </span>
                  <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                    ⏳ Da saldare: {formatEuro(remaining)}
                  </span>
                </div>
              ) : (
                <span className={\`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 \${isFullyPaid ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}\`}>
                  {isFullyPaid ? "✓ Saldato" : "⏳ Da saldare"}
                </span>
              )}
            </div>`;

  const newJSX = `            {/* Visualizzazione Parziale o Badge Stato */}
            <div className="mt-2">
              {isPartiallyPaid ? (
                <div className="flex items-center gap-2 text-[10px] font-bold">
                  <span onClick={(ev) => handleTogglePaidStatus(item, ev)} className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-emerald-100 transition-colors shadow-xs hover:shadow-sm">
                    🟢 Saldato: {formatEuro(actuallyPaid)}
                  </span>
                  <span onClick={(ev) => handleTogglePaidStatus(item, ev)} className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-amber-100 transition-colors shadow-xs hover:shadow-sm">
                    ⏳ Da saldare: {formatEuro(remaining)}
                  </span>
                </div>
              ) : (
                <span onClick={(ev) => handleTogglePaidStatus(item, ev)} className={\`cursor-pointer hover:opacity-80 active:scale-95 transition-all text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 shadow-xs hover:shadow-sm \${isFullyPaid ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"}\`}>
                  {isFullyPaid ? "✓ Saldato" : "⏳ Da saldare"}
                </span>
              )}
            </div>`;

  content = content.replace(oldJSX, newJSX);
  fs.writeFileSync(file, content, 'utf8');
  console.log('SpeseBudgetView updated with interactive badges!');
} else {
  console.log('Already updated or target not found');
}
