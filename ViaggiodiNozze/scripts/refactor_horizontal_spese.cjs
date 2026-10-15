const fs = require('fs');

const code = `import { useState, useEffect, useMemo, useRef } from "react";
import { storageService } from "../../storage/storageService";
import type { Spesa, StatoSpesa, CategoriaSpesa } from "../../types";
import { Search, ChevronRight } from "lucide-react";
import Modal from "../../components/common/Modal";

// ============================================================================
// TIPI & COSTANTI
// ============================================================================

export interface UnifiedExpense {
  id: string;
  category: 'trasporti' | 'alloggi' | 'attivita' | 'ristoranti' | 'shopping' | 'altro';
  title: string;
  date?: string;
  cost: number;
  paid: boolean;
  rawItem: any; // riferimento all'oggetto originale
}

export const CATEGORY_CONFIG: Record<
  CategoriaSpesa | "shopping",
  { label: string; icon: string; color: string; bg: string; border: string; text: string }
> = {
  trasporti: {
    label: "Trasporti",
    icon: "✈️",
    color: "bg-sky-500",
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-800",
  },
  alloggi: {
    label: "Alloggi",
    icon: "🏨",
    color: "bg-purple-500",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
  },
  attivita: {
    label: "Attività",
    icon: "🎟️",
    color: "bg-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
  },
  ristoranti: {
    label: "Ristoranti",
    icon: "🍽️",
    color: "bg-amber-600",
    bg: "bg-amber-100",
    border: "border-amber-300",
    text: "text-amber-900",
  },
  shopping: {
    label: "Shopping",
    icon: "🛍️",
    color: "bg-pink-500",
    bg: "bg-pink-50",
    border: "border-pink-200",
    text: "text-pink-700",
  },
  altro: {
    label: "Extra",
    icon: "📦",
    color: "bg-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
  },
};

const parseEuro = (val: any): number => {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const str = String(val).replace(/[^0-9,.-]/g, "").replace(",", ".");
  return parseFloat(str) || 0;
};

const formatEuro = (val: number): string => {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(val);
};

interface Props {
  onBack?: () => void;
}

export default function SpeseBudgetView({ onBack: _onBack }: Props) {
  const [deviceRole] = useState(() => storageService.getDeviceRole());
  const canEdit = deviceRole === ("sposi" as any) || deviceRole === ("copilota" as any);

  // Dati Grezzi
  const [spese, setSpese] = useState<Spesa[]>([]);
  const [trasporti, setTrasporti] = useState<any[]>([]);
  const [alloggi, setAlloggi] = useState<any[]>([]);
  const [attivita, setAttivita] = useState<any[]>([]);
  const [ristoranti, setRistoranti] = useState<any[]>([]);
  const [shoppingItemsList, setShoppingItemsList] = useState<any[]>([]);

  // Filtri e Modali
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoriaSpesa | "tutte" | "shopping">("tutte");
  const [drillDownCategory, setDrillDownCategory] = useState<CategoriaSpesa | "shopping" | null>(null);

  // Editor Inline
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemCost, setEditingItemCost] = useState("");
  const [editingItemStatus, setEditingItemStatus] = useState<StatoSpesa>("saldato");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // CARICAMENTO DATI
  // ============================================================================
  const loadAllData = async () => {
    setSpese(await storageService.getSpese());
    setTrasporti(await storageService.getTransports());
    setAlloggi(await storageService.getAccommodations());
    setAttivita(await storageService.getActivities());
    
    const r = storageService.getRistoranti ? await storageService.getRistoranti() : [];
    setRistoranti(r);
    
    const s = (storageService as any).getShoppingItems ? await (storageService as any).getShoppingItems() : (storageService as any).getShopping ? await (storageService as any).getShopping() : [];
    setShoppingItemsList(s);
  };

  useEffect(() => {
    loadAllData();
    const handleStorageChange = () => loadAllData();
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // ============================================================================
  // MAPPATURA CENTRALIZZATA (UnifiedExpense)
  // ============================================================================
  const unifiedExpenses = useMemo<UnifiedExpense[]>(() => {
    const list: UnifiedExpense[] = [];

    // 1. Spese Extra (Altro)
    spese.forEach((s) => {
      const costNum = parseEuro(s.amount);
      if (costNum > 0) {
        list.push({
          id: s.id,
          category: s.category || 'altro',
          title: s.title || s.notes || 'Spesa Extra',
          date: s.date,
          cost: costNum,
          paid: s.status === 'saldato',
          rawItem: s,
        });
      }
    });

    // 2. Trasporti
    trasporti.forEach((t) => {
      const costNum = parseEuro(t.cost);
      if (costNum > 0) {
        const acconto = parseEuro(t.depositPaid || t.acconto);
        const isPaid = (t.paymentStatus === 'saldato' || t.status === 'saldato') || (acconto >= costNum);
        list.push({
          id: t.id,
          category: 'trasporti',
          title: t.carrier || \`\${t.departureLocation} → \${t.arrivalLocation}\`,
          date: t.date || t.startDate,
          cost: costNum,
          paid: isPaid,
          rawItem: t,
        });
      }
    });

    // 3. Alloggi
    alloggi.forEach((a) => {
      const costNum = parseEuro(a.cost);
      if (costNum > 0) {
        list.push({
          id: a.id,
          category: 'alloggi',
          title: a.name || a.title,
          date: a.checkIn || a.startDate,
          cost: costNum,
          paid: a.paymentStatus === 'saldato' || a.status === 'saldato',
          rawItem: a,
        });
      }
    });

    // 4. Attività
    attivita.forEach((a) => {
      const costNum = parseEuro(a.cost);
      if (costNum > 0) {
        list.push({
          id: a.id,
          category: 'attivita',
          title: a.title || a.name,
          date: a.date || a.startDate,
          cost: costNum,
          paid: a.paymentStatus === 'saldato' || a.status === 'saldato',
          rawItem: a,
        });
      }
    });

    // 5. Ristoranti
    ristoranti.forEach((r) => {
      const costNum = parseEuro(r.budget || r.cost);
      if (costNum > 0) {
        list.push({
          id: r.id,
          category: 'ristoranti',
          title: r.name || r.nome,
          date: r.date || r.data,
          cost: costNum,
          paid: r.paymentStatus === 'saldato' || r.status === 'saldato',
          rawItem: r,
        });
      }
    });

    // 6. Shopping
    shoppingItemsList.forEach((s) => {
      const costNum = parseEuro(s.budget || s.cost);
      if (costNum > 0) {
        list.push({
          id: s.id,
          category: 'shopping',
          title: s.name || s.nome || s.item,
          date: s.date || s.data,
          cost: costNum,
          paid: s.paymentStatus === 'saldato' || s.status === 'saldato',
          rawItem: s,
        });
      }
    });

    // Sort by date desc (if present)
    list.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return list;
  }, [spese, trasporti, alloggi, attivita, ristoranti, shoppingItemsList]);

  // Filtro
  const filteredUnifiedExpenses = useMemo(() => {
    return unifiedExpenses.filter((e) => {
      const matchesSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = selectedCategory === "tutte" || e.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [unifiedExpenses, searchTerm, selectedCategory]);

  // Calcoli Budget
  const stats = useMemo(() => {
    let totSaldato = 0;
    let totDaSaldare = 0;
    let maxCategoryTotal = 0;
    const catStats = {
      trasporti: { saldato: 0, daSaldare: 0, total: 0 },
      alloggi: { saldato: 0, daSaldare: 0, total: 0 },
      attivita: { saldato: 0, daSaldare: 0, total: 0 },
      ristoranti: { saldato: 0, daSaldare: 0, total: 0 },
      shopping: { saldato: 0, daSaldare: 0, total: 0 },
      altro: { saldato: 0, daSaldare: 0, total: 0 },
    };

    unifiedExpenses.forEach((e) => {
      const cat = e.category;
      if (e.paid) {
        totSaldato += e.cost;
        catStats[cat].saldato += e.cost;
      } else {
        totDaSaldare += e.cost;
        catStats[cat].daSaldare += e.cost;
      }
      catStats[cat].total += e.cost;
      if (catStats[cat].total > maxCategoryTotal) {
        maxCategoryTotal = catStats[cat].total;
      }
    });

    return { totSaldato, totDaSaldare, totGenerale: totSaldato + totDaSaldare, catStats, maxCategoryTotal };
  }, [unifiedExpenses]);

  // ============================================================================
  // HANDLERS CENTRALIZZATI
  // ============================================================================
  const openItemEdit = (e: UnifiedExpense) => {
    setEditingItemId(e.id);
    setEditingItemCost(e.cost > 0 ? e.cost.toFixed(2) : "");
    setEditingItemStatus(e.paid ? "saldato" : "da_saldare");
    setTimeout(() => inlineInputRef.current?.focus(), 80);
  };

  const handleUpdateExpense = async (e: UnifiedExpense, newCostStr: string, newStatus: StatoSpesa) => {
    setSavingItemId(e.id);
    try {
      const raw = e.rawItem;
      const formattedCost = newCostStr ? \`\${newCostStr} €\` : raw.cost || raw.budget || raw.amount;
      const updated = { ...raw, paymentStatus: newStatus, status: newStatus, updatedAt: Date.now() };

      switch (e.category) {
        case 'trasporti':
          updated.cost = formattedCost;
          await storageService.saveTransport(updated);
          break;
        case 'alloggi':
          updated.cost = formattedCost;
          await storageService.saveAccommodation(updated);
          break;
        case 'attivita':
          updated.cost = formattedCost;
          await storageService.saveActivity(updated);
          break;
        case 'ristoranti':
          updated.budget = formattedCost;
          await storageService.updateRistorante(e.id, updated);
          break;
        case 'shopping':
          updated.budget = formattedCost;
          await storageService.updateShopping(e.id, updated);
          break;
        case 'altro':
        default:
          updated.amount = newCostStr;
          await storageService.saveSpesa(updated);
          break;
      }
      await loadAllData();
      setEditingItemId(null);
    } finally {
      setSavingItemId(null);
    }
  };

  const handleDeleteExpense = async (e: UnifiedExpense, ev: React.MouseEvent) => {
    ev.stopPropagation(); // Evita di chiudere/aprire l'edit se clicchiamo su elimina
    if (!confirm('Rimuovere questa spesa dal budget? L\\'elemento rimarrà nell\\'itinerario ma con importo a 0.')) return;
    
    if (e.category === 'altro') {
      // Per spese manuali (altro), eliminiamo fisicamente
      await storageService.deleteSpesa(e.id);
    } else {
      // Per gli altri elementi, azzeriamo il costo/budget
      const raw = e.rawItem;
      const updated = { ...raw, updatedAt: Date.now() };
      switch (e.category) {
        case 'trasporti':
          updated.cost = "0 €";
          await storageService.saveTransport(updated);
          break;
        case 'alloggi':
          updated.cost = "0 €";
          await storageService.saveAccommodation(updated);
          break;
        case 'attivita':
          updated.cost = "0 €";
          await storageService.saveActivity(updated);
          break;
        case 'ristoranti':
          updated.budget = "0 €";
          await storageService.updateRistorante(e.id, updated);
          break;
        case 'shopping':
          updated.budget = "0 €";
          await storageService.updateShopping(e.id, updated);
          break;
      }
    }
    await loadAllData();
  };

  // ============================================================================
  // COMPONENTE RIGA (Condiviso tra Drill-Down e Lista Principale)
  // ============================================================================
  const ExpenseRow = ({ item }: { item: UnifiedExpense }) => {
    const config = CATEGORY_CONFIG[item.category];
    const isEditingThis = editingItemId === item.id;

    return (
      <div 
        onClick={() => {
          if (canEdit && !isEditingThis) {
            openItemEdit(item);
          }
        }}
        className={\`p-3 \${config.bg}/40 rounded-3xl border \${config.border} shadow-2xs hover:shadow-sm transition-all mb-3 \${canEdit && !isEditingThis ? "cursor-pointer active:scale-95 hover:bg-slate-50" : ""}\`}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-slate-900 truncate">{config.icon} {item.title}</h4>
              <span className={\`text-[9px] font-bold px-1.5 py-0.2 rounded-md \${config.bg} \${config.text}\`}>{config.label}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
              {item.date && <span>{item.date}</span>}
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <span className={\`text-xs font-black \${config.text.replace('text-', 'text-').replace('600', '950')} font-mono block\`}>
                {formatEuro(item.cost)}
              </span>
              <button 
                onClick={(ev) => {
                  if (canEdit) {
                    ev.stopPropagation();
                    handleUpdateExpense(item, item.cost.toString(), item.paid ? "da_saldare" : "saldato");
                  }
                }}
                disabled={!canEdit}
                className={\`text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-block mt-0.5 cursor-pointer \${item.paid ? "bg-[#FFF0ED] text-[#172033] border border-slate-200 hover:bg-slate-200" : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"}\`}
              >
                {item.paid ? "✓ Saldato" : "⏳ Da saldare"}
              </button>
            </div>
            {canEdit && (
              <>
                <button 
                  type="button" 
                  onClick={(ev) => {
                    ev.stopPropagation();
                    isEditingThis ? setEditingItemId(null) : openItemEdit(item);
                  }} 
                  className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer" 
                  title={isEditingThis ? "Chiudi" : "Modifica"}
                >
                  {isEditingThis ? "✕" : "✏️"}
                </button>
                <button 
                  type="button" 
                  onClick={(ev) => handleDeleteExpense(item, ev)} 
                  className="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs transition-colors cursor-pointer" 
                  title={item.category === 'altro' ? "Elimina Spesa" : "Azzera Costo (Mantieni Tappa)"}
                >
                  🗑️
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inline editor */}
        {isEditingThis && (
          <div 
            className={\`mt-2.5 pt-2.5 border-t \${config.border} space-y-2\`}
            onClick={(e) => e.stopPropagation()} // evita click-through
          >
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
              <button type="button" onClick={() => handleUpdateExpense(item, editingItemCost, editingItemStatus)} disabled={savingItemId === item.id} className="px-3 py-1 rounded-lg text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60">{savingItemId === item.id ? 'Salvo...' : 'Salva'}</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // RENDER MAIN
  // ============================================================================
  return (
    <div className="flex flex-col h-full animate-fade-in pb-20">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        
        {/* Riepilogo Totali */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-60"></div>
          <div className="relative">
            <h2 className="text-sm font-bold text-slate-500 mb-1">Costo Totale Viaggio</h2>
            <div className="text-3xl font-black text-slate-900 tracking-tight font-mono mb-4">
              {formatEuro(stats.totGenerale)}
            </div>
            <div className="flex gap-4">
              <div className="flex-1 bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">Già Saldato</div>
                <div className="text-sm font-black text-emerald-700 font-mono">{formatEuro(stats.totSaldato)}</div>
              </div>
              <div className="flex-1 bg-amber-50 rounded-2xl p-3 border border-amber-100">
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Da Saldare</div>
                <div className="text-sm font-black text-amber-700 font-mono">{formatEuro(stats.totDaSaldare)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Drill Down Categorie (Orizzontale / Liste Compatte) */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-3 px-1">Spese per Categoria</h3>
          <div className="flex flex-col gap-2">
            {(Object.entries(CATEGORY_CONFIG) as [CategoriaSpesa | "shopping", any][]).map(([catKey, config]) => {
              const catStats = stats.catStats[catKey];
              const count = unifiedExpenses.filter(e => e.category === catKey).length;
              
              // Calcolo percentuale rispetto al budget totale speso per mostrare una mini-barra
              const percentage = stats.totGenerale > 0 ? Math.round((catStats.total / stats.totGenerale) * 100) : 0;
              const barWidth = stats.maxCategoryTotal > 0 ? (catStats.total / stats.maxCategoryTotal) * 100 : 0;

              return (
                <div 
                  key={catKey} 
                  onClick={() => setDrillDownCategory(catKey)} 
                  className={\`bg-white px-3 py-3 rounded-2xl border border-slate-100 shadow-sm cursor-pointer hover:shadow-md transition-all active:scale-95 flex items-center gap-3\`}
                >
                  <div className={\`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg \${config.bg}\`}>
                    {config.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{config.label}</span>
                        {count > 0 && (
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{count}</span>
                        )}
                      </div>
                      <span className="text-xs font-black text-slate-900 font-mono">{formatEuro(catStats.total)}</span>
                    </div>
                    
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex items-center relative">
                       <div 
                         className={\`h-full \${config.color} rounded-full transition-all duration-500\`}
                         style={{ width: \`\${barWidth}%\` }}
                       />
                    </div>
                  </div>
                  
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 ml-1" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Lista Dettagliata (Filtro e Risultati) */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-sm font-bold text-slate-900">Tutte le Spese</h3>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredUnifiedExpenses.length} registrate
            </span>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca spesa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar -mx-4 px-4 snap-x">
            <button
              onClick={() => setSelectedCategory("tutte")}
              className={\`snap-start shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all \${selectedCategory === "tutte" ? "bg-slate-800 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}\`}
            >
              Tutte
            </button>
            {(Object.entries(CATEGORY_CONFIG) as [CategoriaSpesa | "shopping", any][]).map(([catKey, config]) => (
              <button
                key={catKey}
                onClick={() => setSelectedCategory(catKey)}
                className={\`snap-start shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all \${selectedCategory === catKey ? config.color + " text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}\`}
              >
                {config.icon} {config.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {filteredUnifiedExpenses.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl opacity-50">💸</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">Nessuna spesa trovata</h4>
                <p className="text-xs text-slate-500">Non ci sono spese che corrispondono ai filtri attuali.</p>
              </div>
            ) : (
              filteredUnifiedExpenses.map((expense) => (
                <ExpenseRow key={\`\${expense.category}_\${expense.id}\`} item={expense} />
              ))
            )}
          </div>
        </div>

      </div>

      {/* Modale Drill-Down Categoria */}
      <Modal
        isOpen={drillDownCategory !== null}
        onClose={() => setDrillDownCategory(null)}
        title={drillDownCategory ? \`Dettaglio \${CATEGORY_CONFIG[drillDownCategory].label}\` : ""}
      >
        {drillDownCategory && (() => {
          const catConfig = CATEGORY_CONFIG[drillDownCategory];
          const catStats = stats.catStats[drillDownCategory];
          const items = unifiedExpenses.filter(e => e.category === drillDownCategory);

          return (
            <div className="space-y-4">
              <div className={\`p-4 rounded-2xl \${catConfig.bg} border \${catConfig.border}\`}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Subtotale {catConfig.label}</span>
                  <span className={\`text-lg font-black \${catConfig.text} font-mono\`}>{formatEuro(catStats.total)}</span>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 bg-white/60 rounded-xl p-2 border border-white">
                    <div className="text-[9px] font-bold text-slate-500 mb-0.5">Saldato</div>
                    <div className="text-xs font-bold text-emerald-700 font-mono">{formatEuro(catStats.saldato)}</div>
                  </div>
                  <div className="flex-1 bg-white/60 rounded-xl p-2 border border-white">
                    <div className="text-[9px] font-bold text-slate-500 mb-0.5">Da saldare</div>
                    <div className="text-xs font-bold text-amber-700 font-mono">{formatEuro(catStats.daSaldare)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 pb-4">
                {items.length === 0 ? (
                  <div className="text-center py-6">
                    <span className="text-slate-400 text-xs">Nessuna spesa in questa categoria.</span>
                  </div>
                ) : (
                  items.map(expense => (
                    <ExpenseRow key={\`drill_\${expense.id}\`} item={expense} />
                  ))
                )}
              </div>
              
              <div className="flex items-center justify-end pt-3 border-t border-slate-100 gap-2">
                <button
                  type="button"
                  onClick={() => setDrillDownCategory(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Chiudi
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

    </div>
  );
}
`;
fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code, 'utf8');
console.log('Saved horizontal refactored file');
