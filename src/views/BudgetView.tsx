import { useState, useEffect } from "react";
import {
  BUDGET_TOTAL,
  TRANSPORTS,
  ACCOMMODATIONS,
  INSURANCE,
} from "../data/mockData";
import type { Transport, Accommodation } from "../data/mockData";
import { IcPlus, IcChevronRight } from "../components/Icons";

// ── Interfaccia Spesa Manuale ──────────────────────────────────────────────────
interface BudgetEntry {
  id: string;
  date: string; // es. "06 jul"
  label: string;
  amount: number;
  category: "Trasporti" | "Alloggi" | "Attività" | "Cibo & Extra" | "Altro";
}

const LS_TRANSPORTS = "hrb_transports_v2";
const LS_ACCOMMODATIONS = "hrb_accommodations_v2";
const LS_BUDGET_ENTRIES = "hrb_budget_entries_v2";

function loadTransports(): Transport[] {
  try {
    const raw = localStorage.getItem(LS_TRANSPORTS);
    if (raw) return JSON.parse(raw) as Transport[];
  } catch { /* ignore */ }
  return TRANSPORTS;
}

function loadAccommodations(): Accommodation[] {
  try {
    const raw = localStorage.getItem(LS_ACCOMMODATIONS);
    if (raw) return JSON.parse(raw) as Accommodation[];
  } catch { /* ignore */ }
  return ACCOMMODATIONS;
}

const INITIAL_ENTRIES: BudgetEntry[] = [
  // Dato reale: costo esatto da polizza Heymondo (HEY2101185)
  { id: "entry-insurance", date: "18 giu", label: "Assicurazione Heymondo Premium", amount: 294.21, category: "Altro" },
  // Attività prenotate / stimate (non inventate ma non ancora confermate con ricevuta)
  { id: "entry-maori-village", date: "03 dic", label: "Mitai Maori Village (Cena + Show)", amount: 120, category: "Attività" },
  { id: "entry-surf-bondi", date: "26 dic", label: "Corso di Surf (Bondi Beach)", amount: 80, category: "Attività" },
  { id: "entry-glowworm-caves", date: "02 dic", label: "Waitomo Glowworm Caves Entry", amount: 65, category: "Attività" },
  // Cibo: voce mock — da aggiornare durante il viaggio
  { id: "entry-food-mock", date: "30 dic", label: "Pranzo di pesce a Boracay", amount: 45, category: "Cibo & Extra" },
];

function loadBudgetEntries(): BudgetEntry[] {
  try {
    const raw = localStorage.getItem(LS_BUDGET_ENTRIES);
    if (raw) {
      let list = JSON.parse(raw) as BudgetEntry[];

      // 1. Migrazione: Spostiamo i record con category "Assicurazione" (vecchio tipo) sotto "Altro"
      list = list.map((e) => {
        if ((e.category as any) === "Assicurazione") {
          return { ...e, category: "Altro" };
        }
        return e;
      });

      // 2. Integrazione: Aggiungiamo i record di default di INITIAL_ENTRIES che non sono ancora presenti nella lista salvata
      INITIAL_ENTRIES.forEach((init) => {
        if (!list.some((e) => e.id === init.id)) {
          list.push(init);
        }
      });

      return list;
    }
  } catch { /* ignore */ }
  return INITIAL_ENTRIES;
}

function saveBudgetEntries(list: BudgetEntry[]) {
  try {
    localStorage.setItem(LS_BUDGET_ENTRIES, JSON.stringify(list));
  } catch { /* ignore */ }
}

function pct(spent: number, budget: number) {
  return Math.min(100, Math.round((spent / budget) * 100));
}

// ── Detail Category Sheet (Popup Dettaglio Spese Categoria) ─────────────────────
function CategoryDetailSheet({
  category,
  transports,
  accommodations,
  entries,
  onDeleteEntry,
  onClose,
}: {
  category: string;
  transports: Transport[];
  accommodations: Accommodation[];
  entries: BudgetEntry[];
  onDeleteEntry: (id: string) => void;
  onClose: () => void;
}) {
  let listItems: { label: string; date: string; amount: number; isManual?: boolean; id?: string }[] = [];
  let total = 0;

  if (category === "Trasporti") {
    // 1. Spese reali da trasporti
    transports.forEach((tr) => {
      if (tr.price && tr.price > 0) {
        listItems.push({
          label: `${tr.from} → ${tr.to} (${tr.airline || tr.detail || "Tratta"})`,
          date: tr.dateLabel,
          amount: tr.price,
        });
        total += tr.price;
      }
    });
    // 2. Eventuali spese manuali assegnate a Trasporti
    entries.filter((e) => e.category === "Trasporti").forEach((e) => {
      listItems.push({ label: e.label, date: e.date, amount: e.amount, isManual: true, id: e.id });
      total += e.amount;
    });
  } else if (category === "Alloggi") {
    // 1. Spese reali da alloggi
    accommodations.forEach((acc) => {
      if (acc.price && acc.price > 0) {
        listItems.push({
          label: `${acc.name} (${acc.city})`,
          date: acc.dates.split(" 2026")[0],
          amount: acc.price,
        });
        total += acc.price;
      }
    });
    // 2. Eventuali spese manuali assegnate ad Alloggi
    entries.filter((e) => e.category === "Alloggi").forEach((e) => {
      listItems.push({ label: e.label, date: e.date, amount: e.amount, isManual: true, id: e.id });
      total += e.amount;
    });
  } else {
    // Attività, Cibo & Extra, Altro derivano interamente da entries
    entries.filter((e) => e.category === category).forEach((e) => {
      listItems.push({ label: e.label, date: e.date, amount: e.amount, isManual: true, id: e.id });
      total += e.amount;
    });
  }

  // Dati reali polizza per il popup Altro
  const showInsuranceCard = category === "Altro";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-[2px]"
      style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-white rounded-t-[32px] p-5 pb-8 max-h-[80dvh] overflow-y-auto shadow-2xl border-t border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[17px] font-black text-gray-900">Dettaglio: {category}</h2>
          <span className="text-[16px] font-extrabold text-blue-600">Total: €{total.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <p className="text-[12px] text-gray-400 mb-4">Composizione analitica dei costi reali registrati</p>

        {/* Card polizza assicurazione — visibile solo nel popup Altro */}
        {showInsuranceCard && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3">
            <p className="text-[11px] font-black text-blue-700 uppercase tracking-wider mb-1">🛡️ Polizza {INSURANCE.brand} · {INSURANCE.policyNumber}</p>
            <p className="text-[11px] text-blue-600 font-medium">{INSURANCE.plan} · {INSURANCE.insured}</p>
            <p className="text-[11px] text-blue-500 mt-0.5">{INSURANCE.startDate} – {INSURANCE.endDate} · {INSURANCE.coverage}</p>
          </div>
        )}

        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
          {listItems.length === 0 ? (
            <p className="text-[12px] text-gray-400 italic text-center py-6 bg-gray-50 rounded-xl">
              Nessuna spesa inserita per questa categoria.
            </p>
          ) : (
            listItems.map((item, idx) => (
              <div key={idx} className="bg-gray-50/70 border border-gray-100 p-3 rounded-xl flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-gray-800 leading-snug truncate">{item.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{item.date}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[13px] font-black text-gray-900">€{item.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
                  {item.isManual && item.id && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Rimuovere la spesa: ${item.label}?`)) {
                          onDeleteEntry(item.id!);
                        }
                      }}
                      className="text-red-500 text-[10px] font-bold ml-1 hover:underline"
                    >
                      Elimina
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <button
          className="w-full mt-5 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px]"
          onClick={onClose}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

// ── Sheet per inserire spesa manuale ──────────────────────────────────────────
function AddExpenseSheet({
  onSave,
  onClose,
}: {
  onSave: (entry: BudgetEntry) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [category, setCategory] = useState<BudgetEntry["category"]>("Cibo & Extra");

  function handleSubmit() {
    const amt = parseFloat(amountStr.replace(",", "."));
    if (!label.trim() || isNaN(amt) || amt <= 0) return;

    // Data odierna formattata in modo compatto (es. "06 lug")
    const d = new Date();
    const months = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
    const formattedDate = `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]}`;

    const newEntry: BudgetEntry = {
      id: `expense-${Date.now()}`,
      date: formattedDate,
      label: label.trim(),
      amount: amt,
      category,
    };
    onSave(newEntry);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-[2px]"
      style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-white rounded-t-[32px] p-5 pb-8 max-h-[85dvh] overflow-y-auto shadow-2xl border-t border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-black text-gray-900 mb-4">Aggiungi spesa</h2>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Descrizione *</label>
            <input
              type="text"
              value={label}
              placeholder="es. Cena tipica a Boracay, Souvenir Adelaide"
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Importo (€) *</label>
            <input
              type="text"
              value={amountStr}
              placeholder="es. 45.50"
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1.5">Categoria</label>
            <div className="grid grid-cols-2 gap-2">
              {(["Cibo & Extra", "Trasporti", "Alloggi", "Attività", "Altro"] as BudgetEntry["category"][]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`py-2 rounded-xl text-[12px] font-semibold transition-colors ${category === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-[14px]"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="flex-1 py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-[14px]"
            onClick={handleSubmit}
            disabled={!label.trim() || !amountStr.trim() || isNaN(parseFloat(amountStr.replace(",", ".")))}
            style={{ opacity: label.trim() && amountStr.trim() ? 1 : 0.5 }}
          >
            Salva spesa
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main BudgetView ───────────────────────────────────────────────────────────
export default function BudgetView() {
  const [transports] = useState<Transport[]>(loadTransports);
  const [accommodations] = useState<Accommodation[]>(loadAccommodations);
  const [entries, setEntries] = useState<BudgetEntry[]>(loadBudgetEntries);

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);

  useEffect(() => {
    saveBudgetEntries(entries);
  }, [entries]);

  // Eredita i prezzi reali di default per i record privi di price nel localStorage
  const finalTransports = transports.map(t => {
    if (t.price === undefined) {
      const def = TRANSPORTS.find(d => d.id === t.id);
      if (def && def.price !== undefined) {
        return { ...t, price: def.price };
      }
    }
    return t;
  });

  const finalAccommodations = accommodations.map(a => {
    if (a.price === undefined) {
      const def = ACCOMMODATIONS.find(d => d.id === a.id);
      if (def && def.price !== undefined) {
        return { ...a, price: def.price };
      }
    }
    return a;
  });

  // Ricalcolo dinamico delle spese per categoria
  let spentTransports = 0;
  finalTransports.forEach((t) => { if (t.price && t.price > 0) spentTransports += t.price; });
  entries.filter((e) => e.category === "Trasporti").forEach((e) => spentTransports += e.amount);

  let spentAccommodations = 0;
  finalAccommodations.forEach((a) => { if (a.price && a.price > 0) spentAccommodations += a.price; });
  entries.filter((e) => e.category === "Alloggi").forEach((e) => spentAccommodations += e.amount);

  let spentActivities = 0;
  entries.filter((e) => e.category === "Attività").forEach((e) => spentActivities += e.amount);

  let spentFoodExtra = 0;
  entries.filter((e) => e.category === "Cibo & Extra").forEach((e) => spentFoodExtra += e.amount);

  let spentAltro = 0;
  entries.filter((e) => e.category === "Altro").forEach((e) => spentAltro += e.amount);

  const totalSpent = spentTransports + spentAccommodations + spentActivities + spentFoodExtra + spentAltro;
  const residuo = BUDGET_TOTAL - totalSpent;
  const totalPct = pct(totalSpent, BUDGET_TOTAL);

  // Mappatura delle categorie per il rendering
  const categoriesRender = [
    { id: "cat-tr", label: "Trasporti", icon: "✈️", spent: spentTransports, budget: 4000 },
    { id: "cat-acc", label: "Alloggi", icon: "🏨", spent: spentAccommodations, budget: 3000 },
    { id: "cat-act", label: "Attività", icon: "🎫", spent: spentActivities, budget: 2000 },
    { id: "cat-food", label: "Cibo & Extra", icon: "🍜", spent: spentFoodExtra, budget: 3000 },
    { id: "cat-other", label: "Altro", icon: "📁", spent: spentAltro, budget: 1000 },
  ];

  function handleSaveExpense(newEntry: BudgetEntry) {
    setEntries((prev) => [newEntry, ...prev]);
  }

  function handleDeleteEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="px-4 pt-5 pb-28">
      <h1 className="text-[24px] font-extrabold text-gray-900 mb-5">Budgeter</h1>

      {/* ── Totale ─────────────────────────────────────────────────────────── */}
      <div className="card p-4 mb-4">
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-[12px] text-gray-400 font-medium mb-0.5">Totale speso</p>
            <p className="text-[32px] font-extrabold text-gray-900">
              €{totalSpent.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-gray-400 font-medium mb-0.5">Residuo</p>
            <p className={`text-[22px] font-bold ${residuo >= 0 ? "text-green-600" : "text-red-500"}`}>
              €{residuo.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="budget-bar-track">
          <div
            className="budget-bar-fill"
            style={{
              width: `${totalPct}%`,
              background:
                totalPct > 90
                  ? "#ef4444"
                  : totalPct > 70
                    ? "#f97316"
                    : "#1d4ed8",
            }}
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5 text-right font-medium">
          {totalPct}% di €{BUDGET_TOTAL.toLocaleString("it-IT")}
        </p>
      </div>

      {/* ── Categorie ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Categorie</h2>
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Tocca per dettagli</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {categoriesRender.map((cat, idx) => {
          const p = pct(cat.spent, cat.budget);
          const isLastAndOdd = idx === categoriesRender.length - 1 && categoriesRender.length % 2 !== 0;
          return (
            <button
              key={cat.id}
              className={`card p-3.5 text-left w-full transition-all hover:scale-[1.01] active:scale-[0.99] ${isLastAndOdd ? "col-span-2" : ""
                }`}
              onClick={() => setSelectedCat(cat.label)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[18px]">{cat.icon}</span>
                  <span className="text-[13px] font-black text-gray-700 truncate">{cat.label}</span>
                </div>
                <IcChevronRight size={13} className="text-gray-300 flex-shrink-0" />
              </div>
              <p className="text-[18px] font-black text-gray-900 leading-none mb-1.5">
                €{cat.spent.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
              </p>
              <div className="budget-bar-track mb-1">
                <div
                  className="budget-bar-fill"
                  style={{
                    width: `${p}%`,
                    background: p > 90 ? "#ef4444" : p > 70 ? "#f97316" : "#2563eb",
                  }}
                />
              </div>
              <p className="text-[9.5px] text-gray-400 font-semibold uppercase tracking-wider">
                {p}% · max €{cat.budget / 1000}k
              </p>
            </button>
          );
        })}
      </div>

      {/* ── Movimenti recenti ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Movimenti manuali & Extra</h2>
      </div>
      <div className="card divide-y divide-gray-50 mb-5 overflow-hidden">
        {entries.length === 0 ? (
          <p className="text-[12px] text-gray-400 italic text-center py-4 bg-white">
            Nessun movimento manuale inserito.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="px-3 py-2.5 flex items-center justify-between transition-colors hover:bg-gray-50/20">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-800 truncate leading-snug">{entry.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{entry.date} · {entry.category}</p>
              </div>
              <div className="flex items-center gap-2.5 ml-3 flex-shrink-0">
                <span className="text-[14px] font-black text-gray-900">
                  −€{entry.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                </span>
                <button
                  onClick={() => {
                    if (window.confirm(`Eliminare il movimento: ${entry.label}?`)) {
                      handleDeleteEntry(entry.id);
                    }
                  }}
                  className="text-red-400 hover:text-red-600 text-[11px] font-bold px-1"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Aggiungi spesa — sticky FAB ──────────────────────────────────── */}
      {/* Spacer visivo ridondante rimosso: il padding pb-28 tiene spazio */}

      {/* Pulsante fisso sempre visibile in basso, sopra la bottom nav */}
      <div
        className="fixed bottom-[68px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 z-40"
        style={{ pointerEvents: "none" }}
      >
        <button
          onClick={() => setShowAddExpense(true)}
          style={{ pointerEvents: "auto" }}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-extrabold text-[14px] py-3.5 rounded-2xl shadow-xl shadow-blue-300/50 transition-all hover:bg-blue-700 active:scale-[0.98]"
        >
          <IcPlus size={18} />
          Aggiungi spesa
        </button>
      </div>

      {selectedCat && (
        <CategoryDetailSheet
          category={selectedCat}
          transports={finalTransports}
          accommodations={finalAccommodations}
          entries={entries}
          onDeleteEntry={handleDeleteEntry}
          onClose={() => setSelectedCat(null)}
        />
      )}

      {showAddExpense && (
        <AddExpenseSheet
          onSave={handleSaveExpense}
          onClose={() => setShowAddExpense(false)}
        />
      )}
    </div>
  );
}
