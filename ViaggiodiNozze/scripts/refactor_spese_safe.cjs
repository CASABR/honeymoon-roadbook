const fs = require('fs');
const file_path = 'src/views/altro/SpeseBudgetView.tsx';
let content = fs.readFileSync(file_path, 'utf8');

// 1. Rewrite count for category filters
content = content.replace(
  'const count = spese.filter((s) => s.category === catKey).length;',
  `let count = spese.filter((s) => s.category === catKey).length;
          if (catKey === 'alloggi') count += alloggi.filter(a => parseEuro(a.cost) > 0).length;
          if (catKey === 'trasporti') count += trasporti.filter(t => parseEuro(t.cost) > 0).length;
          if (catKey === 'attivita') count += attivita.filter(a => parseEuro(a.cost) > 0).length;
          if (catKey === 'ristoranti') count += ristoranti.filter((r: any) => parseEuro(r.budget || "") > 0).length;
          if (catKey === 'shopping') count += shoppingItemsList.filter((s: any) => parseEuro(s.budget || "") > 0).length;`
);

// 2. Add ToRender logic
const unifiedItemsDef = `
  const alloggiToRender = selectedCategory === "tutte" || selectedCategory === "alloggi" ? alloggi.filter(a => parseEuro(a.cost) > 0) : [];
  const trasportiToRender = selectedCategory === "tutte" || selectedCategory === "trasporti" ? trasporti.filter(t => parseEuro(t.cost) > 0) : [];
  const attivitaToRender = selectedCategory === "tutte" || selectedCategory === "attivita" ? attivita.filter(a => parseEuro(a.cost) > 0) : [];
  const ristorantiToRender = selectedCategory === "tutte" || selectedCategory === "ristoranti" ? ristoranti.filter((r: any) => parseEuro(r.budget || "") > 0) : [];
  const shoppingToRender = selectedCategory === "tutte" || selectedCategory === "shopping" ? shoppingItemsList.filter((s: any) => parseEuro(s.budget || "") > 0) : [];
  
  const totalItemsCount = filteredSpese.length + alloggiToRender.length + trasportiToRender.length + attivitaToRender.length + ristorantiToRender.length + shoppingToRender.length;
`;

content = content.replace(
  '  return (\n    <div className="flex flex-col h-full animate-fade-in pb-20">',
  unifiedItemsDef + '\n  return (\n    <div className="flex flex-col h-full animate-fade-in pb-20">'
);

// 3. Fix the "registrate" count text
content = content.replace(
  '{filteredSpese.length} registrate',
  '{totalItemsCount} registrate'
);
content = content.replace(
  'filteredSpese.length === 0 ? (',
  'totalItemsCount === 0 ? ('
);

// 4. Inject handlers and renderItemRow BEFORE `return (`
const handlers = `
  // Generic state for inline editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemCost, setEditingItemCost] = useState('');
  const [editingItemAcconto, setEditingItemAcconto] = useState('');
  const [editingItemStatus, setEditingItemStatus] = useState<StatoSpesa>('saldato');
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const openItemEdit = (id: string, cost: number, acconto: number, status: StatoSpesa = 'da_saldare') => {
    setEditingItemId(id);
    setEditingItemCost(cost > 0 ? cost.toFixed(2) : '');
    setEditingItemAcconto(acconto > 0 ? acconto.toFixed(2) : '');
    setEditingItemStatus(status);
    setTimeout(() => inlineInputRef.current?.focus(), 80);
  };

  const handleUpdateAlloggio = async (id: string, cost: string, status: StatoSpesa) => {
    const acc = alloggi.find(a => a.id === id);
    if (!acc) return;
    setSavingItemId(id);
    try {
      const updated = { ...acc, cost: cost ? \`\${cost} €\` : acc.cost, paymentStatus: status, updatedAt: Date.now() };
      await storageService.saveAccommodation(updated);
      await loadAllData();
      setEditingItemId(null);
    } finally { setSavingItemId(null); }
  };

  const handleDeleteAlloggio = async (id: string) => {
    if(!confirm('Eliminare questo alloggio?')) return;
    await storageService.deleteAccommodation(id);
    await loadAllData();
  };

  const handleUpdateAttivita = async (id: string, cost: string, status: StatoSpesa) => {
    const att = attivita.find(a => a.id === id);
    if (!att) return;
    setSavingItemId(id);
    try {
      const updated = { ...att, cost: cost ? \`\${cost} €\` : att.cost, paymentStatus: status, updatedAt: Date.now() };
      await storageService.saveActivity(updated as any);
      await loadAllData();
      setEditingItemId(null);
    } finally { setSavingItemId(null); }
  };

  const handleDeleteAttivita = async (id: string) => {
    if(!confirm('Eliminare questa attività?')) return;
    await storageService.deleteActivity(id);
    await loadAllData();
  };

  const handleUpdateRistorante = async (id: string, cost: string, status: StatoSpesa) => {
    const rist = ristoranti.find(r => r.id === id);
    if (!rist) return;
    setSavingItemId(id);
    try {
      const updated = { ...rist, budget: cost ? \`\${cost} €\` : rist.budget, updatedAt: Date.now() };
      await storageService.updateRistorante(id, updated);
      await loadAllData();
      setEditingItemId(null);
    } finally { setSavingItemId(null); }
  };

  const handleDeleteRistorante = async (id: string) => {
    if(!confirm('Eliminare questo ristorante?')) return;
    await storageService.deleteRistorante(id);
    await loadAllData();
  };

  const handleUpdateShopping = async (id: string, cost: string, status: StatoSpesa) => {
    const sh = shoppingItemsList.find(s => s.id === id);
    if (!sh) return;
    setSavingItemId(id);
    try {
      const updated = { ...sh, budget: cost ? \`\${cost} €\` : sh.budget, updatedAt: Date.now() };
      await storageService.updateShopping(id, updated as any);
      await loadAllData();
      setEditingItemId(null);
    } finally { setSavingItemId(null); }
  };

  const handleDeleteShopping = async (id: string) => {
    if(!confirm('Eliminare questo shopping?')) return;
    await storageService.deleteShopping(id);
    await loadAllData();
  };
  
  const handleDeleteTransport = async (id: string) => {
    if(!confirm('Eliminare questo trasporto?')) return;
    await storageService.deleteTransport(id);
    await loadAllData();
  };

  const renderItemRow = (
    item: any, 
    type: 'trasporto' | 'alloggio' | 'attivita' | 'ristorante' | 'shopping', 
    config: { icon: string; bg: string; text: string; border: string; label: string; deleteHandler: (id: string) => void; updateHandler: (id: string, cost: string, status: StatoSpesa) => void }
  ) => {
    const costNum = parseEuro(item.cost || item.budget);
    const acconto = parseEuro(item.depositPaid || item.acconto);
    const isPaid = item.paymentStatus === 'saldato' || item.status === 'saldato' || (type === 'trasporto' && acconto >= costNum && costNum > 0);
    const isEditingThis = editingItemId === item.id || (type === 'trasporto' && editingTransportId === item.id);
    
    const title = type === 'trasporto' ? (item.carrier || \`\${item.departureLocation} → \${item.arrivalLocation}\`) : (item.name || item.title || item.nome);
    const dateStr = item.date || item.data || item.startDate || item.checkIn;
    const locationStr = type === 'trasporto' ? \`\${item.departureLocation} → \${item.arrivalLocation}\` : (item.location || item.indirizzo || '');

    return (
      <div key={\`\${type}_\${item.id}\`} className={\`p-3 \${config.bg}/40 rounded-3xl border \${config.border} shadow-2xs hover:shadow-sm transition-all\`}>
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-slate-900 truncate">{config.icon} {title}</h4>
              <span className={\`text-[9px] font-bold px-1.5 py-0.2 rounded-md \${config.bg} \${config.text}\`}>{config.label}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
              {dateStr && <span>{dateStr}</span>}
              {dateStr && locationStr && <span>•</span>}
              {locationStr && <span className="truncate max-w-[130px]">{locationStr}</span>}
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <span className={\`text-xs font-black \${config.text.replace('text-', 'text-').replace('600', '950')} font-mono block\`}>
                € {costNum.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})}
              </span>
              <span className={\`text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-block mt-0.5 \${isPaid ? "bg-[#FFF0ED] text-[#172033] border border-slate-200" : "bg-rose-50 text-rose-700 border border-rose-200"}\`}>
                {isPaid ? "✓ Saldato" : "⏳ Da saldare"}
              </span>
            </div>
            {canEdit && (
              <>
                <button type="button" onClick={() => isEditingThis ? (type === 'trasporto' ? setEditingTransportId(null) : setEditingItemId(null)) : (type === 'trasporto' ? openTransportEdit(item) : openItemEdit(item.id, costNum, acconto, isPaid ? 'saldato' : 'da_saldare'))} className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer" title={isEditingThis ? "Chiudi" : "Modifica"}>{isEditingThis ? "✕" : "✏️"}</button>
                <button type="button" onClick={() => config.deleteHandler(item.id)} className="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs transition-colors cursor-pointer" title="Elimina">🗑️</button>
              </>
            )}
          </div>
        </div>

        {/* Inline editor */}
        {isEditingThis && type !== 'trasporto' && (
          <div className={\`mt-2.5 pt-2.5 border-t \${config.border} space-y-2\`}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={\`block text-[10px] font-bold \${config.text} mb-1\`}>Costo (€)</label>
                <input ref={inlineInputRef} type="number" inputMode="decimal" step="0.01" min="0" value={editingItemCost} onChange={e => setEditingItemCost(e.target.value)} placeholder="0.00" className={\`w-full px-2.5 py-1.5 rounded-lg border \${config.border} text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white\`} />
              </div>
              <div>
                <label className={\`block text-[10px] font-bold \${config.text} mb-1\`}>Stato</label>
                <select value={editingItemStatus} onChange={e => setEditingItemStatus(e.target.value as StatoSpesa)} className={\`w-full px-2.5 py-1.5 rounded-lg border \${config.border} text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white\`}>
                  <option value="saldato">Saldato</option>
                  <option value="da_saldare">Da saldare</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setEditingItemId(null)} className="px-3 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">Annulla</button>
              <button type="button" onClick={() => config.updateHandler(item.id, editingItemCost, editingItemStatus)} disabled={savingItemId === item.id} className="px-3 py-1 rounded-lg text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60">{savingItemId === item.id ? 'Salvo...' : 'Salva'}</button>
            </div>
          </div>
        )}
      </div>
    );
  };
`;
content = content.replace(
  '  // Open inline edit for a transport',
  handlers + '\n  // Open inline edit for a transport'
);

// 5. Replace bottom UI
const bottomUIRenderers = `
          {attivitaToRender.map((att: any) => renderItemRow(att, 'attivita', {icon: '🎟️', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Attività', deleteHandler: handleDeleteAttivita, updateHandler: handleUpdateAttivita}))}
          {ristorantiToRender.map((rist: any) => renderItemRow(rist, 'ristorante', {icon: '🍽️', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', label: 'Ristorante', deleteHandler: handleDeleteRistorante, updateHandler: handleUpdateRistorante}))}
          {shoppingToRender.map((sh: any) => renderItemRow(sh, 'shopping', {icon: '🛍️', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', label: 'Shopping', deleteHandler: handleDeleteShopping, updateHandler: handleUpdateShopping}))}
          {alloggiToRender.map((acc: any) => renderItemRow(acc, 'alloggio', {icon: '🏨', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Alloggio', deleteHandler: handleDeleteAlloggio, updateHandler: handleUpdateAlloggio}))}
          {trasportiToRender.map((tr: any) => renderItemRow(tr, 'trasporto', {icon: '✈️', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', label: 'Trasporto', deleteHandler: handleDeleteTransport, updateHandler: () => {} }))}
`;

content = content.replace(
  '          filteredSpese.map((s) => {',
  '          <>\n' + bottomUIRenderers + '\n          {filteredSpese.map((s) => {'
);
content = content.replace(
  '            );\n          })\n        )}',
  '            );\n          })}\n          </>\n        )}'
);

// 6. Replace drillDown modal ALLOGGI and TRASPORTI, and inject others.
// Find the exact strings.
const startAlloggiStr = '{/* Voci da Alloggi (se categoria alloggi) */}';
const alloggiIdx = content.indexOf(startAlloggiStr);

// Instead of looking for </div>, we can just look for the end of the trasportiItems.map
const endTrasportiStr = '                      </div>\\n                    );\\n                  })}';
const endTrasportiIdx = content.indexOf(endTrasportiStr, alloggiIdx);

if (alloggiIdx !== -1 && endTrasportiIdx !== -1) {
  const drillDownUIRenderers = `
                  {/* Voci da Attivita */}
                  {attivitaItems.map((att: any) => renderItemRow(att, 'attivita', {icon: '🎟️', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Attività', deleteHandler: handleDeleteAttivita, updateHandler: handleUpdateAttivita}))}
                  {/* Voci da Ristoranti */}
                  {ristorantiItems.map((rist: any) => renderItemRow(rist, 'ristorante', {icon: '🍽️', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', label: 'Ristorante', deleteHandler: handleDeleteRistorante, updateHandler: handleUpdateRistorante}))}
                  {/* Voci da Shopping */}
                  {shoppingItems.map((sh: any) => renderItemRow(sh, 'shopping', {icon: '🛍️', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', label: 'Shopping', deleteHandler: handleDeleteShopping, updateHandler: handleUpdateShopping}))}
                  {/* Voci da Alloggi */}
                  {alloggiItems.map((acc: any) => renderItemRow(acc, 'alloggio', {icon: '🏨', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Alloggio', deleteHandler: handleDeleteAlloggio, updateHandler: handleUpdateAlloggio}))}
                  {/* Voci da Trasporti */}
                  {trasportiItems.map((tr: any) => renderItemRow(tr, 'trasporto', {icon: '✈️', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', label: 'Trasporto', deleteHandler: handleDeleteTransport, updateHandler: () => {} }))}
`;
  content = content.substring(0, alloggiIdx) + drillDownUIRenderers.trim() + '\\n' + content.substring(endTrasportiIdx + endTrasportiStr.length);
}

fs.writeFileSync(file_path, content);
console.log('Update completed safely.');
