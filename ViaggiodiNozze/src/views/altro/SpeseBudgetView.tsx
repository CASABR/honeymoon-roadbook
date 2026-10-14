import { useState, useEffect, useMemo, useRef } from "react";
import { storageService, notifyDataChanged } from "../../storage/storageService";
import type { Spesa, StatoSpesa, CategoriaSpesa } from "../../types";
import { Search, ChevronRight } from "lucide-react";
import Modal from "../../components/common/Modal";

import { formatDate } from '../../utils/tripDates';
import { resolvePaymentInfo } from '../../utils/priceHelper';

// ============================================================================
// TIPI & COSTANTI
// ============================================================================

export interface UnifiedExpense {
  id: string;
  category: 'trasporti' | 'alloggi' | 'attivita' | 'ristoranti' | 'shopping' | 'altro';
  title: string;
  date?: string;
  cost: number;
  paidAmount: number;
  paid: boolean;
  rawItem: any;
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

export const parseEuro = (val: any): number => {
  if (!val) return 0;
  if (typeof val === "number") return val;
  let str = String(val).trim().replace(/[€a-zA-Z\\s]/g, "");
  
  // Se è un numero tipo "406.075,00", rimuovi i punti come separatori migliaia.
  if (str.includes(',') && str.includes('.')) {
    // Il punto è il separatore delle migliaia in formato europeo.
    str = str.replace(/\\./g, '');
  } else if ((str.match(/\\./g) || []).length > 1) {
    // Multipli punti "1.000.000"
    str = str.replace(/\\./g, '');
  } else if (str.includes('.') && !str.includes(',')) {
    // "1000.50" (format US) -> Lasciamo così
    const parts = str.split('.');
    if (parts[1].length === 3) {
      // Se dopo il punto ci sono 3 cifre es. "406.075", era un separatore migliaia
      str = str.replace(/\\./g, '');
    }
  }

  // Converti la virgola europea in punto per il parsing
  str = str.replace(',', '.');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
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
  const canEdit = deviceRole === 'guida' || deviceRole === 'copilota' || (deviceRole as any) === 'sposi';

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
  const [editingItemPaidAmount, setEditingItemPaidAmount] = useState("");
  const [editingItemStatus, setEditingItemStatus] = useState<StatoSpesa>("saldato");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // CARICAMENTO E AUTO-FIX
  // ============================================================================
  const loadAllData = async () => {
    // Esegue l'allineamento richiesto
    
    
    setSpese(await storageService.getSpese());
    let tList = await storageService.getTransports();
    
    // Rimosso auto-fix per evitare loop di render.
    
    setTrasporti(tList);
    setAlloggi(await storageService.getAccommodations());
    setAttivita(await storageService.getActivities());
    
    const r = storageService.getRistoranti ? await storageService.getRistoranti() : [];
    setRistoranti(r);
    
    const s = (storageService as any).getShoppingItems ? await (storageService as any).getShoppingItems() : (storageService as any).getShopping ? await (storageService as any).getShopping() : [];
    setShoppingItemsList(s);
  };

  useEffect(() => {
    loadAllData();
    let timeoutId: any;
    const handleStorageChange = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => loadAllData(), 250);
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("roadbook_data_mutated", handleStorageChange);
    window.addEventListener("roadbook_cloud_synced", handleStorageChange);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("roadbook_data_mutated", handleStorageChange);
      window.removeEventListener("roadbook_cloud_synced", handleStorageChange);
    };
  }, []);

  // ============================================================================
  // MAPPATURA CENTRALIZZATA (UnifiedExpense)
  // ============================================================================
  const unifiedExpenses = useMemo<UnifiedExpense[]>(() => {
    const list: UnifiedExpense[] = [];

    const addToList = (items: any[], cat: string, titleField1: string, titleField2: string, dateField: string, costField: string, altCostField: string) => {
      items.forEach((item) => {
        const rawCost = item[costField] || item[altCostField];
        const paymentInfo = resolvePaymentInfo({
          cost: rawCost,
          depositPaid: item.depositPaid || item.acconto || item.amountPaid,
          paymentStatus: item.paymentStatus,
          status: item.status,
          completed: item.completed,
          packageIncluded: item.packageIncluded
        });

        // Se è gratuito o incluso nel pacchetto, non è una spesa da saldare né un costo a carico del viaggiatore
        if (paymentInfo.isFree || paymentInfo.isPackageIncluded) {
          list.push({
            id: item.id,
            category: cat as any,
            title: item[titleField1] || item[titleField2] || 'Senza titolo',
            date: item[dateField] || item.startDate || item.checkIn || item.data,
            cost: 0,
            paidAmount: 0,
            paid: true,
            rawItem: item,
          });
          return;
        }

        const costNum = paymentInfo.costNum;
        if (costNum > 0) {
          const paidAmount = paymentInfo.paidNum;
          const isPaid = paymentInfo.isPaid || paidAmount >= costNum;

          list.push({
            id: item.id,
            category: cat as any,
            title: item[titleField1] || item[titleField2] || 'Senza titolo',
            date: item[dateField] || item.startDate || item.checkIn || item.data,
            cost: costNum,
            paidAmount: paidAmount,
            paid: isPaid,
            rawItem: item,
          });
        }
      });
    };

    addToList(spese, 'altro', 'title', 'notes', 'date', 'amount', 'amount');
    
    // Custom per trasporti
    trasporti.forEach((t) => {
      const paymentInfo = resolvePaymentInfo({
        cost: t.cost,
        depositPaid: t.depositPaid || t.acconto || t.amountPaid,
        paymentStatus: t.paymentStatus,
        status: t.status,
        completed: t.completed,
        packageIncluded: t.packageIncluded
      });

      if (paymentInfo.isFree || paymentInfo.isPackageIncluded) {
        list.push({
          id: t.id,
          category: 'trasporti',
          title: t.carrier || `${t.departureLocation} → ${t.arrivalLocation}`,
          date: t.date || t.startDate,
          cost: 0,
          paidAmount: 0,
          paid: true,
          rawItem: t,
        });
        return;
      }

      const costNum = paymentInfo.costNum;
      if (costNum > 0) {
        const acconto = paymentInfo.paidNum;
        const isPaid = paymentInfo.isPaid || acconto >= costNum;
        list.push({
          id: t.id,
          category: 'trasporti',
          title: t.carrier || `${t.departureLocation} → ${t.arrivalLocation}`,
          date: t.date || t.startDate,
          cost: costNum,
          paidAmount: acconto,
          paid: isPaid,
          rawItem: t,
        });
      }
    });

    addToList(alloggi, 'alloggi', 'name', 'title', 'checkIn', 'cost', 'cost');
    addToList(attivita, 'attivita', 'title', 'name', 'date', 'cost', 'cost');
    addToList(ristoranti, 'ristoranti', 'nome', 'name', 'date', 'budget', 'cost');
    addToList(shoppingItemsList, 'shopping', 'nome', 'name', 'date', 'budget', 'cost');

    // Deduplicazione deterministica per ID
    const uniqueMap = new Map<string, UnifiedExpense>();
    list.forEach(item => {
      if (item.id) {
        uniqueMap.set(item.id, item);
      }
    });
    const uniqueList = Array.from(uniqueMap.values());

    // Sort by date desc
    uniqueList.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      const isoA = ((a.date || '').split('-').length === 3 && (a.date || '').split('-')[0].length === 2 ? (a.date || '').split('-').reverse().join('-') : (a.date || ''));
      const isoB = ((b.date || '').split('-').length === 3 && (b.date || '').split('-')[0].length === 2 ? (b.date || '').split('-').reverse().join('-') : (b.date || ''));
      return new Date(isoA).getTime() - new Date(isoB).getTime();
    });

    return uniqueList;
  }, [spese, trasporti, alloggi, attivita, ristoranti, shoppingItemsList]);

  // Filtro
  const filteredUnifiedExpenses = useMemo(() => {
    return unifiedExpenses.filter((e) => {
      const safeTitle = (e.title || '').toLowerCase();
      const matchesSearch = safeTitle.includes(searchTerm.toLowerCase());
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
      
      const actuallyPaid = e.paidAmount || (e.paid ? e.cost : 0);
      const remaining = Math.max(0, e.cost - actuallyPaid);
      
      totSaldato += actuallyPaid;
      totDaSaldare += remaining;
      
      catStats[cat].saldato += actuallyPaid;
      catStats[cat].daSaldare += remaining;
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
    setEditingItemPaidAmount(e.paidAmount > 0 ? e.paidAmount.toFixed(2) : (e.paid ? e.cost.toFixed(2) : "0"));
    setEditingItemStatus(e.paid ? "saldato" : "da_saldare");
    setTimeout(() => inlineInputRef.current?.focus(), 80);
  };

  const handleUpdateExpense = async (e: UnifiedExpense, newCostStr: string, newPaidStr: string, newStatus: StatoSpesa) => {
    setSavingItemId(e.id);
    try {
      const raw = e.rawItem;
      const formattedCost = newCostStr ? `${newCostStr} €` : raw.cost || raw.budget || raw.amount;
      const formattedPaid = newPaidStr ? `${newPaidStr} €` : "0 €";
      const updated = { 
        ...raw, 
        paymentStatus: newStatus, 
        status: newStatus, 
        depositPaid: formattedPaid,
        acconto: formattedPaid,
        amountPaid: formattedPaid,
        updatedAt: Date.now() 
      };

      switch (e.category) {
        case 'trasporti':
          updated.cost = formattedCost;
          await storageService.saveTransport(updated);
          notifyDataChanged('trasporti', 'save', updated);
          break;
        case 'alloggi':
          updated.cost = formattedCost;
          await storageService.saveAccommodation(updated);
          notifyDataChanged('alloggi', 'save', updated);
          break;
        case 'attivita':
          updated.cost = formattedCost;
          await storageService.saveActivity(updated);
          notifyDataChanged('attivita', 'save', updated);
          break;
        case 'ristoranti':
          updated.budget = formattedCost;
          await storageService.saveRistorante(updated);
          notifyDataChanged('ristoranti', 'save', updated);
          break;
        case 'shopping':
          updated.budget = formattedCost;
          await storageService.saveShopping(updated);
          notifyDataChanged('shopping', 'save', updated);
          break;
        case 'altro':
        default:
          updated.status = newStatus;
          updated.paymentStatus = newStatus;
          updated.amount = newCostStr ? (parseFloat(newCostStr) || raw.amount) : raw.amount;
          await storageService.saveSpesa(updated);
          notifyDataChanged('spese', 'save', updated);
          break;
      }
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'save', entityType: e.category, data: updated } }));
      await loadAllData();
      setEditingItemId(null);
    } finally {
      setSavingItemId(null);
    }
  };

  const handleTogglePaidStatus = async (item: UnifiedExpense, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!canEdit) return;

    const actuallyPaid = item.paidAmount || (item.paid ? item.cost : 0);
    const remaining = Math.max(0, item.cost - actuallyPaid);
    const isFullyPaid = item.paid || remaining === 0;

    const newStatus = isFullyPaid ? 'da_saldare' : 'saldato';
    const newPaidStr = isFullyPaid ? "0" : item.cost.toString();
    const newCostStr = item.cost.toString();
    
    await handleUpdateExpense(item, newCostStr, newPaidStr, newStatus);
  };

  const handleDeleteExpense = async (e: UnifiedExpense, ev: React.MouseEvent) => {
    ev.stopPropagation(); 
    if (!confirm("Rimuovere questa spesa dal budget? L'elemento rimarrà nell'itinerario ma con importo a 0.")) return;
    
    if (e.category === 'altro') {
      await storageService.deleteSpesa(e.id);
    } else {
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
    
    const actuallyPaid = item.paidAmount || (item.paid ? item.cost : 0);
    const remaining = Math.max(0, item.cost - actuallyPaid);
    const isPartiallyPaid = actuallyPaid > 0 && remaining > 0;
    const isFullyPaid = item.paid || remaining === 0;

    return (
      <div 
        onClick={() => {
          if (canEdit && !isEditingThis) {
            openItemEdit(item);
          }
        }}
        className={`p-3 ${config.bg}/40 rounded-3xl border ${config.border} shadow-2xs hover:shadow-sm transition-all mb-3 ${canEdit && !isEditingThis ? "cursor-pointer active:scale-95 hover:bg-slate-50" : ""}`}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-slate-900 truncate">{config.icon} {item.title}</h4>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${config.bg} ${config.text}`}>{config.label}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
              {item.date && <span>{formatDate(item.date)}</span>}
            </div>
            
            {/* Visualizzazione Parziale o Badge Stato */}
            <div className="mt-2">
              {item.cost === 0 && item.category === 'trasporti' ? (
                <span className="cursor-default text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 shadow-xs bg-sky-50 text-sky-700 border border-sky-200">
                  Incluso nel pacchetto
                </span>
              ) : item.cost === 0 ? (
                <span className="cursor-default text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 shadow-xs bg-slate-50 text-slate-600 border border-slate-200">
                  Gratuito
                </span>
              ) : isPartiallyPaid ? (
                <div className="flex items-center gap-2 text-[10px] font-bold">
                  <span onClick={(ev) => handleTogglePaidStatus(item, ev)} className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-emerald-100 transition-colors shadow-xs hover:shadow-sm">
                    🟢 Saldato: {formatEuro(actuallyPaid)}
                  </span>
                  <span onClick={(ev) => handleTogglePaidStatus(item, ev)} className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-amber-100 transition-colors shadow-xs hover:shadow-sm">
                    ⏳ Da saldare: {formatEuro(remaining)}
                  </span>
                </div>
              ) : (
                <span onClick={(ev) => handleTogglePaidStatus(item, ev)} className={`cursor-pointer hover:opacity-80 active:scale-95 transition-all text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 shadow-xs hover:shadow-sm ${isFullyPaid ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"}`}>
                  {isFullyPaid ? "✓ Saldato" : "⏳ Da saldare"}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-end shrink-0 gap-2">
            <div className="text-right">
              <span className={`text-sm font-black ${config.text.replace('text-', 'text-').replace('600', '950')} font-mono block`}>
                {formatEuro(item.cost)}
              </span>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1">
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
              </div>
            )}
          </div>
        </div>

        {/* Inline editor */}
        {isEditingThis && (
          <div 
            className={`mt-3 pt-3 border-t ${config.border} space-y-3`}
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[10px] font-bold ${config.text} mb-1`}>Totale Spesa (€)</label>
                <input ref={inlineInputRef} type="number" inputMode="decimal" step="0.01" min="0" value={editingItemCost} onChange={e => setEditingItemCost(e.target.value)} placeholder="0.00" className={`w-full px-2.5 py-1.5 rounded-lg border ${config.border} text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${config.text} mb-1`}>Già Pagato (€)</label>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={editingItemPaidAmount} onChange={e => setEditingItemPaidAmount(e.target.value)} placeholder="0.00" className={`w-full px-2.5 py-1.5 rounded-lg border ${config.border} text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white`} />
              </div>
              <div className="col-span-2">
                <label className={`block text-[10px] font-bold ${config.text} mb-1`}>Stato Principale</label>
                <select value={editingItemStatus} onChange={e => setEditingItemStatus(e.target.value as StatoSpesa)} className={`w-full px-2.5 py-1.5 rounded-lg border ${config.border} text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white`}>
                  <option value="saldato">Completamente Saldato</option>
                  <option value="da_saldare">Da saldare (o parziale)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setEditingItemId(null)} className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">Annulla</button>
              <button type="button" onClick={() => handleUpdateExpense(item, editingItemCost, editingItemPaidAmount, editingItemStatus)} disabled={savingItemId === item.id} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60">{savingItemId === item.id ? 'Salvo...' : 'Salva'}</button>
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        
        {/* Header di navigazione con pulsante di ritorno ad Altro */}
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={_onBack || (() => window.history.back())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs border border-slate-200/60"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Torna ad Altro</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5 truncate">
              <span>💳</span> Spese &amp; Budget
            </h1>
          </div>
        </header>

        {/* Riepilogo Totali (Migliorato con progress bar) */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-60"></div>
          <div className="relative">
            <h2 className="text-sm font-bold text-slate-500 mb-1">Budget Totale Allocato</h2>
            <div className="text-3xl font-black text-slate-900 tracking-tight font-mono mb-4">
              {formatEuro(stats.totGenerale)}
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-emerald-50/50 rounded-2xl p-3 border border-emerald-100/50">
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">Già Saldato</div>
                <div className="text-sm font-black text-emerald-700 font-mono">{formatEuro(stats.totSaldato)}</div>
              </div>
              <div className="flex-1 bg-amber-50/50 rounded-2xl p-3 border border-amber-100/50">
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Da Saldare</div>
                <div className="text-sm font-black text-amber-700 font-mono">{formatEuro(stats.totDaSaldare)}</div>
              </div>
            </div>
            
            {/* ProgressBar Generale */}
            <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-400" style={{ width: `${stats.totGenerale > 0 ? (stats.totSaldato / stats.totGenerale) * 100 : 0}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${stats.totGenerale > 0 ? (stats.totDaSaldare / stats.totGenerale) * 100 : 0}%` }} />
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
              
              const barWidth = stats.maxCategoryTotal > 0 ? (catStats.total / stats.maxCategoryTotal) * 100 : 0;

              return (
                <div 
                  key={catKey} 
                  onClick={() => setDrillDownCategory(catKey)} 
                  className={`bg-white px-3 py-3 rounded-2xl border border-slate-100 shadow-sm cursor-pointer hover:shadow-md transition-all active:scale-95 flex items-center gap-3`}
                >
                  <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg ${config.bg}`}>
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
                         className={`h-full ${config.color} rounded-full transition-all duration-500`}
                         style={{ width: `${barWidth}%` }}
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
              className={`snap-start shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedCategory === "tutte" ? "bg-slate-800 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
            >
              Tutte
            </button>
            {(Object.entries(CATEGORY_CONFIG) as [CategoriaSpesa | "shopping", any][]).map(([catKey, config]) => (
              <button
                key={catKey}
                onClick={() => setSelectedCategory(catKey)}
                className={`snap-start shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedCategory === catKey ? config.color + " text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
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
                <ExpenseRow key={`${expense.category}_${expense.id}`} item={expense} />
              ))
            )}
          </div>
        </div>

      </div>

      {/* Modale Drill-Down Categoria */}
      <Modal
        isOpen={drillDownCategory !== null}
        onClose={() => setDrillDownCategory(null)}
        title={drillDownCategory ? `Dettaglio ${CATEGORY_CONFIG[drillDownCategory].label}` : ""}
      >
        {drillDownCategory && (() => {
          const catConfig = CATEGORY_CONFIG[drillDownCategory];
          const catStats = stats.catStats[drillDownCategory];
          const items = unifiedExpenses.filter(e => e.category === drillDownCategory);

          return (
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl ${catConfig.bg} border ${catConfig.border}`}>
                <div className="flex justify-between items-end mb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Subtotale {catConfig.label}</span>
                    <span className={`text-xl font-black ${catConfig.text} font-mono leading-none`}>{formatEuro(catStats.total)}</span>
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 bg-white/70 rounded-xl p-2.5 border border-white">
                    <div className="text-[9px] font-bold text-slate-500 mb-0.5">Saldato</div>
                    <div className="text-sm font-black text-emerald-700 font-mono">{formatEuro(catStats.saldato)}</div>
                  </div>
                  <div className="flex-1 bg-white/70 rounded-xl p-2.5 border border-white">
                    <div className="text-[9px] font-bold text-slate-500 mb-0.5">Da saldare</div>
                    <div className="text-sm font-black text-amber-700 font-mono">{formatEuro(catStats.daSaldare)}</div>
                  </div>
                </div>
                
                <div className="h-1 w-full bg-white/50 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-400" style={{ width: `${catStats.total > 0 ? (catStats.saldato / catStats.total) * 100 : 0}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${catStats.total > 0 ? (catStats.daSaldare / catStats.total) * 100 : 0}%` }} />
                </div>
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 pb-4">
                {items.length === 0 ? (
                  <div className="text-center py-6">
                    <span className="text-slate-400 text-xs">Nessuna spesa in questa categoria.</span>
                  </div>
                ) : (
                  items.map(expense => (
                    <ExpenseRow key={`drill_${expense.id}`} item={expense} />
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
