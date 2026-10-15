const fs = require('fs');
const file_path = 'src/views/altro/SpeseBudgetView.tsx';
let content = fs.readFileSync(file_path, 'utf8');

content = content.replace(
    '          // Alloggi se la categoria è \\'alloggi\\'',
    `          // Attivita se la categoria è 'attivita'
          const attivitaItems = drillDownCategory === 'attivita'
            ? attivita.filter(a => parseEuro(a.cost) > 0)
            : [];
          // Ristoranti se la categoria è 'ristoranti'
          const ristorantiItems = drillDownCategory === 'ristoranti'
            ? ristoranti.filter(r => parseEuro(r.budget) > 0)
            : [];
          // Alloggi se la categoria è 'alloggi'`
);

content = content.replace(
    '                {manualItems.length === 0 && alloggiItems.length === 0 && trasportiItems.length === 0 ? (',
    '                {manualItems.length === 0 && alloggiItems.length === 0 && trasportiItems.length === 0 && attivitaItems.length === 0 && ristorantiItems.length === 0 ? ('
);

const alloggi_old = `                {/* Voci da Alloggi (se categoria alloggi) */}
                {alloggiItems.map(acc => {
                  const costNum = parseEuro(acc.cost);
                  const isPaid = acc.paymentStatus === 'saldato';
                  return (
                    <div
                      key={\`acc_\${acc.id}\`}
                      className="p-3 bg-purple-50/40 rounded-2xl border border-purple-100 shadow-2xs flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            🏨 {acc.name}
                          </h4>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800">
                            Alloggio
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          <span>{acc.checkIn} → {acc.checkOut}</span>
                          {acc.location && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[130px]">{acc.location}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-purple-950 font-mono block">
                          € {costNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={\`text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-block \${
                          isPaid
                            ? 'bg-[#FFF0ED] text-[#172033] border border-slate-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }\`}>
                          {isPaid ? '✓ Saldato' : '⏳ Da saldare'}
                        </span>
                      </div>
                    </div>
                  );
                })}`;

const alloggi_new = `                {/* Voci da Alloggi (se categoria alloggi) */}
                {alloggiItems.map(acc => {
                  const costNum = parseEuro(acc.cost);
                  const isPaid = acc.paymentStatus === 'saldato';
                  const isEditingThis = editingTransportId === acc.id;

                  return (
                    <div
                      key={\`acc_\${acc.id}\`}
                      className="p-3 bg-purple-50/40 rounded-2xl border border-purple-100 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              🏨 {acc.name}
                            </h4>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800 shrink-0">
                              Alloggio
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                            <span>{acc.checkIn} → {acc.checkOut}</span>
                            {acc.location && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[130px]">{acc.location}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                                <span className="text-xs font-black text-purple-950 font-mono block">
                                € {costNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <button type="button" onClick={async (e) => {
                                  e.stopPropagation();
                                  const updated = { ...acc, paymentStatus: isPaid ? 'da_saldare' : 'saldato', updatedAt: Date.now() };
                                  await storageService.saveAccommodation(updated as any);
                                  await loadAllData();
                                }}
                                className={\`cursor-pointer text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-block \${
                                isPaid
                                    ? 'bg-[#FFF0ED] text-[#172033] border border-slate-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }\`}>
                                {isPaid ? '🟢 Saldato' : '🔴 Da saldare'}
                                </button>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => isEditingThis ? setEditingTransportId(null) : openTransportEdit(acc as any)}
                                  className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                                  title={isEditingThis ? 'Chiudi editor' : 'Modifica importo'}
                                >
                                  {isEditingThis ? '✕' : '✏️'}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if(confirm('Sei sicuro di eliminare questo alloggio dal piano?')) {
                                      await storageService.deleteAccommodation(acc.id);
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
                        <div className="mt-2.5 pt-2.5 border-t border-purple-200 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-purple-800 mb-1">Costo totale (€)</label>
                              <input
                                ref={inlineInputRef}
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={editingTransportCost}
                                onChange={e => setEditingTransportCost(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-purple-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
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
                                setSavingTransportId(acc.id);
                                try {
                                  const newCost = parseFloat(editingTransportCost) || 0;
                                  const updated = { ...acc, cost: newCost > 0 ? \`\${newCost.toFixed(2)} €\` : acc.cost, updatedAt: Date.now() };
                                  await storageService.saveAccommodation(updated as any);
                                  await loadAllData();
                                  setEditingTransportId(null);
                                } finally { setSavingTransportId(null); }
                              }}
                              disabled={savingTransportId === acc.id}
                              className="px-3 py-1 rounded-lg text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                            >
                              {savingTransportId === acc.id ? 'Salvo...' : 'Salva'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}`;

content = content.replace(alloggi_old, alloggi_new);

const attivita_ristoranti = `
                {/* Voci da Attivita (se categoria attivita) */}
                {attivitaItems.map(act => {
                  const costNum = parseEuro(act.cost);
                  const isPaid = (act as any).paymentStatus === 'saldato';
                  const isEditingThis = editingTransportId === act.id;

                  return (
                    <div
                      key={\`act_\${act.id}\`}
                      className="p-3 bg-amber-50/40 rounded-2xl border border-amber-100 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              🎟️ {act.title}
                            </h4>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 shrink-0">
                              Attività
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                                <span className="text-xs font-black text-amber-950 font-mono block">
                                € {costNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <button type="button" onClick={async (e) => {
                                  e.stopPropagation();
                                  const updated = { ...act, paymentStatus: isPaid ? 'da_saldare' : 'saldato', updatedAt: Date.now() };
                                  await storageService.saveActivity(updated as any);
                                  await loadAllData();
                                }}
                                className={\`cursor-pointer text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-block \${
                                isPaid
                                    ? 'bg-[#FFF0ED] text-[#172033] border border-slate-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }\`}>
                                {isPaid ? '🟢 Saldato' : '🔴 Da saldare'}
                                </button>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => isEditingThis ? setEditingTransportId(null) : openTransportEdit(act as any)}
                                  className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                                  title={isEditingThis ? 'Chiudi editor' : 'Modifica importo'}
                                >
                                  {isEditingThis ? '✕' : '✏️'}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if(confirm('Sei sicuro di eliminare questa attività dal piano?')) {
                                      await storageService.deleteActivity(act.id);
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
                        <div className="mt-2.5 pt-2.5 border-t border-amber-200 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-amber-800 mb-1">Costo totale (€)</label>
                              <input
                                ref={inlineInputRef}
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={editingTransportCost}
                                onChange={e => setEditingTransportCost(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
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
                                setSavingTransportId(act.id);
                                try {
                                  const newCost = parseFloat(editingTransportCost) || 0;
                                  const updated = { ...act, cost: newCost > 0 ? \`\${newCost.toFixed(2)} €\` : act.cost, updatedAt: Date.now() };
                                  await storageService.saveActivity(updated as any);
                                  await loadAllData();
                                  setEditingTransportId(null);
                                } finally { setSavingTransportId(null); }
                              }}
                              disabled={savingTransportId === act.id}
                              className="px-3 py-1 rounded-lg text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                            >
                              {savingTransportId === act.id ? 'Salvo...' : 'Salva'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Voci da Ristoranti (se categoria ristoranti) */}
                {ristorantiItems.map(rist => {
                  const costNum = parseEuro(rist.budget);
                  const isEditingThis = editingTransportId === rist.id;

                  return (
                    <div
                      key={\`rist_\${rist.id}\`}
                      className="p-3 bg-emerald-50/40 rounded-2xl border border-emerald-100 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              🍽️ {rist.nome}
                            </h4>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 shrink-0">
                              Ristorante
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                                <span className="text-xs font-black text-emerald-950 font-mono block">
                                € {costNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => isEditingThis ? setEditingTransportId(null) : openTransportEdit(rist as any)}
                                  className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                                  title={isEditingThis ? 'Chiudi editor' : 'Modifica importo'}
                                >
                                  {isEditingThis ? '✕' : '✏️'}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if(confirm('Sei sicuro di eliminare questo ristorante dal piano?')) {
                                      await storageService.deleteRistorante(rist.id);
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
                        <div className="mt-2.5 pt-2.5 border-t border-emerald-200 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-emerald-800 mb-1">Budget Stimato (€)</label>
                              <input
                                ref={inlineInputRef}
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={editingTransportCost}
                                onChange={e => setEditingTransportCost(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
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
                                setSavingTransportId(rist.id);
                                try {
                                  const newCost = parseFloat(editingTransportCost) || 0;
                                  const updated = { ...rist, budget: newCost > 0 ? \`\${newCost.toFixed(2)} €\` : rist.budget, updatedAt: Date.now() };
                                  await storageService.saveRistorante(updated as any);
                                  await loadAllData();
                                  setEditingTransportId(null);
                                } finally { setSavingTransportId(null); }
                              }}
                              disabled={savingTransportId === rist.id}
                              className="px-3 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                            >
                              {savingTransportId === rist.id ? 'Salvo...' : 'Salva'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
`;

content = content.replace(
    `title={isEditingThis ? 'Chiudi editor' : 'Modifica importo'}
                            >
                              {isEditingThis ? '✕' : '✏️'}
                            </button>`,
    `title={isEditingThis ? 'Chiudi editor' : 'Modifica importo'}
                            >
                              {isEditingThis ? '✕' : '✏️'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if(confirm('Sei sicuro di eliminare questo trasporto dal piano?')) {
                                  await storageService.deleteTransport(tr.id);
                                  await loadAllData();
                                }
                              }}
                              className="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                              title="Elimina dal piano"
                            >
                              🗑️
                            </button>`
);

content = content.replace(
    '{trasportiItems.map(tr => {',
    attivita_ristoranti + '\n                {trasportiItems.map(tr => {'
);

fs.writeFileSync(file_path, content);
