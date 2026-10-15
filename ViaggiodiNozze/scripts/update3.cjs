const fs = require('fs');
const file_path = 'src/views/altro/SpeseBudgetView.tsx';
let content = fs.readFileSync(file_path, 'utf8');

// 1. Add shopping to CATEGORIE_CONFIG
if (!content.includes('shopping: {')) {
    content = content.replace(
        '  altro: {',
        `  shopping: {
    label: "Shopping",
    icon: "🛍️",
    color: "bg-pink-500",
    bg: "bg-pink-50",
    border: "border-pink-200",
    text: "text-pink-700",
  },
  altro: {`
    );
}

// 2. Add state for shopping
if (!content.includes('const [shoppingItemsList, setShoppingItemsList]')) {
    content = content.replace(
        '  const [ristoranti, setRistoranti] = useState<import("../../types").Ristorante[]>([]);',
        '  const [ristoranti, setRistoranti] = useState<import("../../types").Ristorante[]>([]);\n  const [shoppingItemsList, setShoppingItemsList] = useState<import("../../types").Shopping[]>([]);'
    );
}

// 3. Fetch shopping in loadAllData
if (!content.includes('storageService.getShopping()')) {
    content = content.replace(
        '        loadedRistoranti,',
        '        loadedRistoranti,\n        loadedShopping,'
    );
    content = content.replace(
        '        storageService.getRistoranti(),',
        '        storageService.getRistoranti(),\n        storageService.getShopping(),'
    );
    content = content.replace(
        '      setRistoranti(loadedRistoranti);',
        '      setRistoranti(loadedRistoranti);\n      setShoppingItemsList(loadedShopping);'
    );
}

// 4. Update stats catTotals for shopping
if (!content.includes('shopping: { total: 0, saldato: 0, daSaldare: 0 }')) {
    content = content.replace(
        '        ristoranti: { total: 0, saldato: 0, daSaldare: 0 },',
        '        ristoranti: { total: 0, saldato: 0, daSaldare: 0 },\n        shopping: { total: 0, saldato: 0, daSaldare: 0 },'
    );
}

// 5. Calculate shopping costs in stats
if (!content.includes('// 5. Shopping')) {
    content = content.replace(
        '    // 6. Ristoranti (budget stimulati)',
        `    // 5. Shopping
    shoppingItemsList.forEach((sh) => {
      const costNum = parseEuro(sh.budget);
      catTotals.shopping.total += costNum;
      // Shopping non ha paymentStatus nativamente
      catTotals.shopping.saldato += costNum; // assumiamo saldato
    });

    // 6. Ristoranti (budget stimulati)`
    );
}

// 6. Add shoppingItems inside drilldown category
if (!content.includes('const shoppingItems =')) {
    content = content.replace(
        '            const ristorantiItems =',
        `            // Shopping se la categoria è 'shopping'
            const shoppingItems =
              drillDownCategory === "shopping"
                ? shoppingItemsList.filter((s: import("../../types").Shopping) => parseEuro(s.budget || "") > 0)
                : [];

            const ristorantiItems =`
    );
}

// 7. Add shoppingItems.length === 0 in condition
if (!content.includes('shoppingItems.length === 0')) {
    content = content.replace(
        '                  ristorantiItems.length === 0 ? (',
        '                  ristorantiItems.length === 0 &&\n                  shoppingItems.length === 0 ? ('
    );
}

// 8. Add Shopping UI in the drilldown list
const shoppingUI = `                {/* Voci da Shopping (se categoria shopping) */}
                {shoppingItems.map(sh => {
                  const costNum = parseEuro(sh.budget);
                  const isEditingThis = editingTransportId === sh.id;

                  return (
                    <div
                      key={\`sh_\${sh.id}\`}
                      className="p-3 bg-pink-50/40 rounded-2xl border border-pink-100 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              🛍️ {sh.nome}
                            </h4>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-pink-100 text-pink-800 shrink-0">
                              Shopping
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                                <span className="text-xs font-black text-pink-950 font-mono block">
                                € {costNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => isEditingThis ? setEditingTransportId(null) : openTransportEdit(sh as any)}
                                  className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                                  title={isEditingThis ? 'Chiudi editor' : 'Modifica importo'}
                                >
                                  {isEditingThis ? '✕' : '✏️'}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if(confirm('Sei sicuro di eliminare questo shopping dal piano?')) {
                                      await storageService.deleteShopping(sh.id);
                                      await loadAllData();
                                    }
                                  }}
                                  className="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                                  title="Elimina dal piano"
                                >
                                  🗑️
                                </button>
                              </div>
                            )}
                        </div>
                      </div>
                      {/* Inline editor importi */}
                      {isEditingThis && (
                        <div className="mt-2.5 pt-2.5 border-t border-pink-200 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-pink-800 mb-1">Costo stimato (€)</label>
                              <input
                                ref={inlineInputRef}
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={editingTransportCost}
                                onChange={e => setEditingTransportCost(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-pink-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingTransportId(null)}
                              className="px-3 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              Annulla
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setSavingTransportId(sh.id);
                                try {
                                  const newCost = parseFloat(editingTransportCost) || 0;
                                  const updated = { ...sh, budget: newCost > 0 ? \`\${newCost.toFixed(2)} €\` : sh.budget, updatedAt: Date.now() };
                                  await storageService.updateShopping(sh.id, updated as any);
                                  await loadAllData();
                                  setEditingTransportId(null);
                                } finally { setSavingTransportId(null); }
                              }}
                              disabled={savingTransportId === sh.id}
                              className="px-3 py-1 rounded-lg text-[10px] font-bold bg-pink-600 hover:bg-pink-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                            >
                              {savingTransportId === sh.id ? 'Salvo...' : 'Salva'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Voci da Ristoranti`;

if (!content.includes('Voci da Shopping')) {
    content = content.replace('                {/* Voci da Ristoranti', shoppingUI);
}

fs.writeFileSync(file_path, content);
console.log('Update successful');
