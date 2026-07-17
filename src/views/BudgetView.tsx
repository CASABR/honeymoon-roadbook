import { useState, useEffect, useRef } from "react";
import { IcChevronRight, IcPlus, IcMapPin } from "../components/Icons";
import {
  BUDGET_TOTAL,
  TRANSPORTS,
  ACCOMMODATIONS,
} from "../data/mockData";
import type { Transport, Accommodation, DayData, Activity } from "../data/mockData";
import { repository } from "../services/repository";
import type { BudgetEntry } from "../services/repository";
import { syncService } from "../services/sync";

const INITIAL_ENTRIES: BudgetEntry[] = [
  { id: "entry-insurance", date: "18 giu", label: "Assicurazione Heymondo Premium", amount: 294, category: "Altro" },
  { id: "entry-maori-village", date: "03 dic", label: "Mitai Maori Village (Cena + Show)", amount: 120, category: "Attività" },
  { id: "entry-surf-bondi", date: "26 dic", label: "Corso di Surf (Bondi Beach)", amount: 80, category: "Attività" },
  { id: "entry-glowworm-caves", date: "02 dic", label: "Waitomo Glowworm Caves Entry", amount: 65, category: "Attività" },
  { id: "entry-food-mock", date: "30 dic", label: "Pranzo di pesce a Boracay", amount: 45, category: "Cibo & Extra" },
];

function pct(spent: number, budget: number) {
  return Math.min(100, Math.round((spent / budget) * 100));
}

// ── Detail Category Sheet (Popup Dettaglio Spese Categoria) ─────────────────────
interface DetailItem {
  id: string;
  label: string;
  date: string;
  amount: number;
  isPaid: boolean;
  type: "transport" | "accommodation" | "entry" | "activity";
  rawObject: any; // Riferimento all'oggetto originale per l'update
}

function CategoryDetailSheet({
  category,
  transports,
  accommodations,
  entries,
  tripDays,
  onDeleteEntry,
  onUpdateTransport,
  onUpdateAccommodation,
  onUpdateEntry,
  onUpdateActivity,
  onClose,
}: {
  category: string;
  transports: Transport[];
  accommodations: Accommodation[];
  entries: BudgetEntry[];
  tripDays: DayData[];
  onDeleteEntry: (id: string) => void;
  onUpdateTransport: (tr: Transport) => void;
  onUpdateAccommodation: (acc: Accommodation) => void;
  onUpdateEntry: (entry: BudgetEntry) => void;
  onUpdateActivity: (act: Activity) => void;
  onClose: () => void;
}) {
  const [selectedSubCat, setSelectedSubCat] = useState<string | null>(null);

  // Mappatura e raggruppamento
  let listItems: DetailItem[] = [];
  let total = 0;

  if (category === "Trasporti") {
    // Carichiamo tutti i trasporti reali
    transports.forEach((tr) => {
      const amt = tr.price || 0;
      if (amt > 0) {
        listItems.push({
          id: tr.id,
          label: `${tr.from} → ${tr.to} (${tr.airline || tr.detail || "Tratta"})`,
          date: tr.dateLabel,
          amount: amt,
          isPaid: !!tr.isPaid,
          type: "transport",
          rawObject: tr,
        });
      }
    });
    // Aggiungiamo le spese manuali assegnate a Trasporti
    entries.filter((e) => e.category === "Trasporti").forEach((e) => {
      listItems.push({
        id: e.id,
        label: e.label,
        date: e.date,
        amount: e.amount,
        isPaid: !!e.isPaid,
        type: "entry",
        rawObject: e,
      });
    });
  } else if (category === "Alloggi") {
    // Carichiamo tutti gli alloggi reali
    accommodations.forEach((acc) => {
      const amt = acc.price || 0;
      if (amt > 0) {
        listItems.push({
          id: acc.id,
          label: `${acc.name} (${acc.city})`,
          date: acc.dates.split(" 2026")[0],
          amount: amt,
          isPaid: !!acc.isPaid,
          type: "accommodation",
          rawObject: acc,
        });
      }
    });
    // Aggiungiamo le spese manuali alloggi
    entries.filter((e) => e.category === "Alloggi").forEach((e) => {
      listItems.push({
        id: e.id,
        label: e.label,
        date: e.date,
        amount: e.amount,
        isPaid: !!e.isPaid,
        type: "entry",
        rawObject: e,
      });
    });
  } else if (category === "Attività") {
    // Carichiamo le attività pianificate con prezzo dal calendario/itinerario
    tripDays.forEach((d) => {
      d.activities.forEach((act) => {
        if (act.price && act.price > 0) {
          listItems.push({
            id: act.id,
            label: `${act.title} (Itinerario ${d.dateShort} ${d.monthShort})`,
            date: `${d.dateShort} ${d.monthShort}`,
            amount: act.price,
            isPaid: !!act.isPaid,
            type: "activity",
            rawObject: act,
          });
        }
      });
    });
    // Aggiungiamo le attività inserite a mano nel budgeter
    entries.filter((e) => e.category === "Attività").forEach((e) => {
      listItems.push({
        id: e.id,
        label: e.label,
        date: e.date,
        amount: e.amount,
        isPaid: !!e.isPaid,
        type: "entry",
        rawObject: e,
      });
    });
  } else {
    // Altre categorie (Cibo, Altro)
    entries.filter((e) => e.category === category).forEach((e) => {
      listItems.push({
        id: e.id,
        label: e.label,
        date: e.date,
        amount: e.amount,
        isPaid: !!e.isPaid,
        type: "entry",
        rawObject: e,
      });
    });
  }

  // Calcolo totale
  total = listItems.reduce((sum, item) => sum + item.amount, 0);

  // Definizione sottocategorie per i trasporti
  const subCategories = [
    { key: "plane", label: "Voli & Aerei", icon: "✈️" },
    { key: "ferry", label: "Traghetti & Navi", icon: "🚢" },
    { key: "train", label: "Treni", icon: "🚆" },
    { key: "car", label: "Auto & Noleggi", icon: "🚗" },
    { key: "other", label: "Altro / Extra", icon: "🚌" },
  ];

  // Filtra per sottocategoria di trasporti se selezionata
  let displayedItems = listItems;
  if (category === "Trasporti" && selectedSubCat) {
    displayedItems = listItems.filter((item) => {
      if (item.type === "transport") {
        const t = item.rawObject.type;
        if (selectedSubCat === "plane") return t === "plane";
        if (selectedSubCat === "ferry") return t === "ferry";
        if (selectedSubCat === "train") return t === "train";
        if (selectedSubCat === "car") return t === "car" || t === "transfer";
        return t !== "plane" && t !== "ferry" && t !== "train" && t !== "car" && t !== "transfer";
      } else {
        // Le entrate manuali dei trasporti vanno in "other"
        return selectedSubCat === "other";
      }
    });
  }

  // Calcola totali parziali per ciascuna sottocategoria di Trasporti
  function getSubCatTotal(key: string) {
    return listItems
      .filter((item) => {
        if (item.type === "transport") {
          const t = item.rawObject.type;
          if (key === "plane") return t === "plane";
          if (key === "ferry") return t === "ferry";
          if (key === "train") return t === "train";
          if (key === "car") return t === "car" || t === "transfer";
          return t !== "plane" && t !== "ferry" && t !== "train" && t !== "car" && t !== "transfer";
        }
        return key === "other";
      })
      .reduce((sum, i) => sum + i.amount, 0);
  }

  function handleTogglePaid(item: DetailItem) {
    if (item.type === "transport") {
      onUpdateTransport({ ...item.rawObject, isPaid: !item.isPaid });
    } else if (item.type === "accommodation") {
      onUpdateAccommodation({ ...item.rawObject, isPaid: !item.isPaid });
    } else if (item.type === "activity") {
      onUpdateActivity(item.rawObject);
    } else {
      onUpdateEntry({ ...item.rawObject, isPaid: !item.isPaid });
    }
  }

  const isTransportMainView = category === "Trasporti" && !selectedSubCat;

  return (
    <div
      className="bottom-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {category === "Trasporti" && selectedSubCat && (
              <button
                onClick={() => setSelectedSubCat(null)}
                className="text-[12px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold px-2.5 py-1 rounded-lg shrink-0"
              >
                ← Indietro
              </button>
            )}
            <h2 className="text-[17px] font-black text-gray-900">
              {category === "Trasporti" && selectedSubCat
                ? subCategories.find((s) => s.key === selectedSubCat)?.label
                : `Dettaglio: ${category}`}
            </h2>
          </div>
          <span className="text-[15px] font-black text-blue-600">
            €{
              (category === "Trasporti" && selectedSubCat
                ? getSubCatTotal(selectedSubCat)
                : total
              ).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            }
          </span>
        </div>
        <p className="text-[12px] text-gray-400 mb-4">
          {category === "Trasporti" && selectedSubCat
            ? "Voci incluse in questa tipologia di viaggio"
            : "Composizione analitica dei costi reali registrati"}
        </p>

        {/* Corpo principale */}
        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
          {isTransportMainView ? (
            // Vista delle Sottocategorie per i Trasporti
            <div className="space-y-2">
              {subCategories.map((sub) => {
                const subTotal = getSubCatTotal(sub.key);
                if (subTotal === 0) return null; // Mostra solo sottocategorie con costi
                return (
                  <button
                    key={sub.key}
                    onClick={() => setSelectedSubCat(sub.key)}
                    className="w-full bg-gray-50/70 border border-gray-100 p-3.5 rounded-xl flex items-center justify-between hover:bg-gray-100/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{sub.icon}</span>
                      <span className="text-[13px] font-bold text-gray-800">{sub.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-black text-gray-900">
                        €{subTotal.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <IcChevronRight size={13} className="text-gray-300" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : displayedItems.length === 0 ? (
            <p className="text-[12px] text-gray-400 italic text-center py-6 bg-gray-50 rounded-xl">
              Nessuna spesa inserita per questa categoria.
            </p>
          ) : (
            // Lista dei singoli elementi di spesa
            displayedItems.map((item, idx) => (
              <div key={idx} className="bg-gray-50/70 border border-gray-100 p-3 rounded-xl flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-[13px] font-bold text-gray-800 leading-snug truncate">{item.label}</p>
                    {item.type === "activity" && item.rawObject.mapsUrl && (
                      <a 
                        href={item.rawObject.mapsUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-500 hover:text-blue-650 hover:bg-blue-50 hover:border-blue-100 transition-colors shrink-0"
                        title="Apri posizione in Google Maps"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IcMapPin size={13} />
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{item.date}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Toggle di pagamento */}
                  <button
                    onClick={() => handleTogglePaid(item)}
                    className={`text-[9px] px-2 py-1 rounded font-extrabold uppercase shrink-0 active:scale-95 transition-all ${
                      item.isPaid
                        ? "bg-green-100 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-500 border border-red-100"
                    }`}
                  >
                    {item.isPaid ? "Pagato" : "Da pagare"}
                  </button>
                  <span className="text-[13px] font-black text-gray-900">
                    €{item.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </span>
                  {item.type === "entry" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Rimuovere la spesa: ${item.label}?`)) {
                          onDeleteEntry(item.id);
                        }
                      }}
                      className="text-red-400 hover:text-red-600 text-[12px] font-bold ml-1"
                    >
                      🗑️
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
  const [isPaid, setIsPaid] = useState(true); // default true per farla comparire nei saldati

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
      isPaid: isPaid,
    };
    onSave(newEntry);
    onClose();
  }

  return (
    <div
      className="bottom-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-container"
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

          {/* Toggle Stato Pagamento della nuova spesa */}
          <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl">
            <div>
              <p className="text-[12.5px] font-bold text-gray-800">Spesa già pagata / saldata</p>
              <p className="text-[10px] text-gray-400 font-medium">Contrassegna come già saldato</p>
            </div>
            <button
              onClick={() => setIsPaid(!isPaid)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-colors active:scale-95 border ${
                isPaid
                  ? "bg-green-50 text-green-600 border-green-200"
                  : "bg-red-50 text-red-500 border-red-150"
              }`}
            >
              {isPaid ? "💳 Pagato" : "⏳ Da pagare"}
            </button>
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
import { DAYS } from "../data/mockData";

export default function BudgetView() {
  const [transports, setTransports] = useState<Transport[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [tripDays, setTripDays] = useState<DayData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const enrichTripDays = (days: DayData[]): DayData[] => {
    return days.map(d => ({
      ...d,
      activities: d.activities.map(act => {
        if (act.howToGetThere && !act.mapsUrl) {
          return {
            ...act,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${act.title}, ${act.howToGetThere}`)}`
          };
        }
        return act;
      })
    }));
  };

  useEffect(() => {
    async function initData() {
      try {
        const tr = await repository.getTransports(TRANSPORTS);
        const acc = await repository.getAccommodations(ACCOMMODATIONS);
        const ent = await repository.getBudgetEntries(INITIAL_ENTRIES);
        const days = await repository.getTripDays(DAYS);
        setTransports(tr);
        setAccommodations(acc);
        setEntries(ent);
        setTripDays(enrichTripDays(days));
        isLoadedRef.current = true;
      } catch (e) {
        console.error("Errore caricamento dati budgeter:", e);
      } finally {
        setIsLoading(false);
      }
    }
    initData();
  }, []);

  const [syncStatus, setSyncStatus] = useState<"sincronizzato" | "pending" | "errore" | null>(() => {
    return syncService.getBudgetSyncStatus();
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setEntries((current) => {
          if (JSON.stringify(current) === JSON.stringify(detail)) return current;
          return detail;
        });
      }
    };
    window.addEventListener("hrb_budget_change", handler as EventListener);

    const tripDaysHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        const enriched = enrichTripDays(detail);
        setTripDays((current) => {
          if (JSON.stringify(current) === JSON.stringify(enriched)) return current;
          return enriched;
        });
      }
    };
    window.addEventListener("hrb_tripdays_change", tripDaysHandler as EventListener);

    const transportsHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setTransports((current) => {
          if (JSON.stringify(current) === JSON.stringify(detail)) return current;
          return detail;
        });
      }
    };
    window.addEventListener("hrb_transports_change", transportsHandler as EventListener);

    const accommodationsHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setAccommodations((current) => {
          if (JSON.stringify(current) === JSON.stringify(detail)) return current;
          return detail;
        });
      }
    };
    window.addEventListener("hrb_accommodations_change", accommodationsHandler as EventListener);

    const statusHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSyncStatus(detail);
    };
    window.addEventListener("hrb_budget_sync_status_change", statusHandler as EventListener);

    return () => {
      window.removeEventListener("hrb_budget_change", handler as EventListener);
      window.removeEventListener("hrb_tripdays_change", tripDaysHandler as EventListener);
      window.removeEventListener("hrb_transports_change", transportsHandler as EventListener);
      window.removeEventListener("hrb_accommodations_change", accommodationsHandler as EventListener);
      window.removeEventListener("hrb_budget_sync_status_change", statusHandler as EventListener);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60dvh] gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-[12px] text-slate-500 font-semibold">Caricamento budget...</span>
      </div>
    );
  }

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

  const finalTripDays = tripDays.map((d) => {
    const defDay = DAYS.find((day) => day.id === d.id);
    const nextActivities = d.activities.map((act) => {
      if (act.price === undefined && defDay) {
        const defAct = defDay.activities.find((a) => a.id === act.id);
        if (defAct && defAct.price !== undefined) {
          return { ...act, price: defAct.price, isPaid: act.isPaid ?? defAct.isPaid };
        }
      }
      return act;
    });
    return { ...d, activities: nextActivities };
  });

  // Ricalcolo dinamico delle spese per categoria
  let spentTransports = 0;
  finalTransports.forEach((t) => { if (t.price && t.price > 0) spentTransports += t.price; });
  entries.filter((e) => e.category === "Trasporti").forEach((e) => spentTransports += e.amount);

  let spentAccommodations = 0;
  finalAccommodations.forEach((a) => { if (a.price && a.price > 0) spentAccommodations += a.price; });
  entries.filter((e) => e.category === "Alloggi").forEach((e) => spentAccommodations += e.amount);

  let spentActivities = 0;
  finalTripDays.forEach((d) => {
    d.activities.forEach((act) => {
      if (act.price && act.price > 0) {
        spentActivities += act.price;
      }
    });
  });
  entries.filter((e) => e.category === "Attività").forEach((e) => spentActivities += e.amount);

  let spentFoodExtra = 0;
  entries.filter((e) => e.category === "Cibo & Extra").forEach((e) => spentFoodExtra += e.amount);

  let spentAltro = 0;
  entries.filter((e) => e.category === "Altro").forEach((e) => spentAltro += e.amount);

  const totalSpent = spentTransports + spentAccommodations + spentActivities + spentFoodExtra + spentAltro;
  const residuo = BUDGET_TOTAL - totalSpent;
  const totalPct = pct(totalSpent, BUDGET_TOTAL);

  // Calcolo del Pagato e Da Pagare
  let totalPaid = 0;
  finalTransports.forEach((t) => {
    if (t.price && t.price > 0 && t.isPaid) totalPaid += t.price;
  });
  entries.filter((e) => e.category === "Trasporti" && e.isPaid).forEach((e) => totalPaid += e.amount);

  finalAccommodations.forEach((a) => {
    if (a.price && a.price > 0 && a.isPaid) totalPaid += a.price;
  });
  entries.filter((e) => e.category === "Alloggi" && e.isPaid).forEach((e) => totalPaid += e.amount);

  // Spese attività pagate
  finalTripDays.forEach((d) => {
    d.activities.forEach((act) => {
      if (act.price && act.price > 0 && act.isPaid) {
        totalPaid += act.price;
      }
    });
  });
  entries.filter((e) => e.category === "Attività" && e.isPaid).forEach((e) => totalPaid += e.amount);
  entries.filter((e) => e.category === "Cibo & Extra" && e.isPaid).forEach((e) => totalPaid += e.amount);
  entries.filter((e) => e.category === "Altro" && e.isPaid).forEach((e) => totalPaid += e.amount);

  const totalUnpaid = totalSpent - totalPaid;

  // Mappatura delle categorie per il rendering
  const categoriesRender = [
    { id: "cat-tr", label: "Trasporti", icon: "✈️", spent: spentTransports, budget: 4000 },
    { id: "cat-acc", label: "Alloggi", icon: "🏨", spent: spentAccommodations, budget: 3000 },
    { id: "cat-act", label: "Attività", icon: "🎫", spent: spentActivities, budget: 2000 },
    { id: "cat-food", label: "Cibo & Extra", icon: "🍜", spent: spentFoodExtra, budget: 3000 },
    { id: "cat-other", label: "Altro", icon: "📁", spent: spentAltro, budget: 1000 },
  ];

  function handleSaveExpense(newEntry: BudgetEntry) {
    const next = [newEntry, ...entries];
    setEntries(next);
    repository.saveBudgetEntries(next);
    syncService.pushBudget().catch(e => console.error("Errore autosync budget:", e));
  }

  function handleDeleteEntry(id: string) {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    repository.saveBudgetEntries(next);
    syncService.pushBudget().catch(e => console.error("Errore autosync budget:", e));
  }

  function handleUpdateTransport(updated: Transport) {
    const next = transports.map((t) => (t.id === updated.id ? updated : t));
    setTransports(next);
    repository.saveTransports(next);
  }

  function handleUpdateAccommodation(updated: Accommodation) {
    const next = accommodations.map((a) => (a.id === updated.id ? updated : a));
    setAccommodations(next);
    repository.saveAccommodations(next);
  }

  function handleUpdateEntry(updated: BudgetEntry) {
    const next = entries.map((e) => (e.id === updated.id ? updated : e));
    setEntries(next);
    repository.saveBudgetEntries(next);
    syncService.pushBudget().catch(e => console.error("Errore autosync budget:", e));
  }

  function handleUpdateActivity(updatedAct: Activity) {
    const nextDays = tripDays.map((day) => {
      const hasAct = day.activities.some((a) => a.id === updatedAct.id);
      if (hasAct) {
        const nextActs = day.activities.map((a) =>
          a.id === updatedAct.id ? updatedAct : a
        );
        return { ...day, activities: nextActs };
      }
      return day;
    });
    setTripDays(nextDays);
    repository.saveTripDays(nextDays);
  }

  return (
    <div className="px-4 pt-5 pb-4">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-[24px] font-extrabold text-gray-900">Budgeter</h1>
        {syncStatus && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-gray-50 border border-gray-100 shadow-sm transition-all">
            {syncStatus === "sincronizzato" && (
              <>
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-700">Sincronizzato</span>
              </>
            )}
            {syncStatus === "pending" && (
              <>
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                <span className="text-amber-700">In attesa...</span>
              </>
            )}
            {syncStatus === "errore" && (
              <>
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                <span className="text-red-700">Offline / Errore</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Totale ─────────────────────────────────────────────────────────── */}
      <div className="card p-4 mb-4">
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-[12px] text-gray-400 font-medium mb-0.5">Totale speso</p>
            <p className="text-[32px] font-extrabold text-gray-900 leading-none">
              €{totalSpent.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-gray-400 font-medium mb-0.5">Residuo</p>
            <p className={`text-[22px] font-bold ${residuo >= 0 ? "text-green-600" : "text-red-500"} leading-none`}>
              €{residuo.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Breakdown Pagato / Da pagare */}
        <div className="grid grid-cols-2 gap-2 bg-gray-50/50 p-2.5 rounded-xl mb-3 border border-gray-100/50 text-[11px] font-semibold">
          <div className="text-center">
            <span className="text-gray-400 block mb-0.5 uppercase tracking-wider text-[9px]">Già Pagato / Bloccato</span>
            <span className="text-emerald-600 text-[12.5px] font-extrabold">
              €{totalPaid.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-center border-l border-gray-200/60">
            <span className="text-gray-400 block mb-0.5 uppercase tracking-wider text-[9px]">Da pagare in loco</span>
            <span className="text-amber-600 text-[12.5px] font-extrabold">
              €{totalUnpaid.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
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

      {/* ── Checklist Attività ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Checklist Attività & Prenotazioni</h2>
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Gestione Stati</span>
      </div>
      <div className="card p-3 mb-5 space-y-2 max-h-[350px] overflow-y-auto shadow-sm border border-gray-100/80">
        {(() => {
          const items = finalTripDays.flatMap(day =>
            day.activities
              .filter(act => act.price !== undefined && act.price > 0)
              .map(act => ({ day, act }))
          );
          if (items.length === 0) {
            return (
              <p className="text-[12px] text-gray-400 italic text-center py-4 bg-white">
                Nessuna attività con prezzo registrata nell'itinerario.
              </p>
            );
          }
          return items.map(({ day, act }) => {
            // Helper per aggiornare sia isPaid che isBooked
            const toggleState = (field: "isPaid" | "isBooked") => {
              const updatedAct = { ...act, [field]: !act[field] };
              handleUpdateActivity(updatedAct);
            };

            return (
              <div key={act.id} className="flex items-center justify-between gap-3 p-2 hover:bg-gray-50/50 rounded-xl transition-colors border-b border-gray-50/50 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-gray-800 leading-snug truncate">
                    {act.title}
                  </p>
                  <p className="text-[10.5px] text-gray-400">
                    Giorno {day.dayNumber} · {day.dateShort} {day.monthShort} {act.subtitle ? `· ${act.subtitle}` : ""}
                  </p>
                </div>
                
                {/* Controlli compatti di stato */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Tasto Prenotato */}
                  <button
                    onClick={() => toggleState("isBooked")}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-black border transition-all active:scale-95 ${
                      act.isBooked
                        ? "bg-blue-50 text-blue-600 border-blue-200"
                        : "bg-gray-50 text-gray-400 border-gray-200"
                    }`}
                  >
                    {act.isBooked ? "🎫 Prenotato" : "🎫 No Pren."}
                  </button>

                  {/* Tasto Pagato */}
                  <button
                    onClick={() => toggleState("isPaid")}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-black border transition-all active:scale-95 ${
                      act.isPaid
                        ? "bg-green-50 text-green-600 border-green-200"
                        : "bg-red-50 text-red-500 border-red-100"
                    }`}
                  >
                    {act.isPaid ? "💳 Pagato" : "💳 Da pagare"}
                  </button>

                  <span className="text-[12px] font-black text-gray-700 ml-1">
                    €{act.price}
                  </span>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* ── Movimenti recenti ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Movimenti manuali & Extra</h2>
      </div>
      <div className="card divide-y divide-gray-100 mb-5 overflow-hidden">
        {(() => {
          // Filtra solo quelli pagati
          const paidEntries = entries.filter(e => e.isPaid);
          if (paidEntries.length === 0) {
            return (
              <p className="text-[12px] text-gray-400 italic text-center py-4 bg-white">
                Nessun movimento pagato registrato.
              </p>
            );
          }

          return paidEntries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <div key={entry.id} className="transition-colors hover:bg-gray-50/30">
                {/* Riga compatta principale */}
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="px-3 py-2 flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] text-gray-400 font-bold shrink-0">{entry.date}</span>
                    <p className="text-[12px] font-bold text-gray-800 truncate">{entry.label}</p>
                    <span className="text-[9px] px-1.5 bg-gray-100 text-gray-500 rounded shrink-0 font-medium">{entry.category}</span>
                  </div>
                  <span className="text-[12.5px] font-black text-gray-900 shrink-0 ml-2">
                    −€{entry.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Dettaglio espanso (Eliminazione) */}
                {isExpanded && (
                  <div className="px-3 pb-2 pt-0.5 flex justify-end items-center gap-2 bg-gray-50/50 animate-fade-in">
                    <span className="text-[10px] text-gray-400 mr-auto">Tocca di nuovo per chiudere</span>
                    <button
                      onClick={() => {
                        if (window.confirm(`Eliminare il movimento: ${entry.label}?`)) {
                          handleDeleteEntry(entry.id);
                        }
                      }}
                      className="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-red-200"
                    >
                      🗑️ Elimina Spesa
                    </button>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* ── Aggiungi spesa ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setShowAddExpense(true)}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-extrabold text-[14px] py-3.5 rounded-2xl shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 hover:scale-[1.01] active:scale-[0.99]"
      >
        <IcPlus size={18} />
        Aggiungi spesa
      </button>

      {selectedCat && (
        <CategoryDetailSheet
          category={selectedCat}
          transports={finalTransports}
          accommodations={finalAccommodations}
          entries={entries}
          tripDays={tripDays}
          onDeleteEntry={handleDeleteEntry}
          onUpdateTransport={handleUpdateTransport}
          onUpdateAccommodation={handleUpdateAccommodation}
          onUpdateEntry={handleUpdateEntry}
          onUpdateActivity={handleUpdateActivity}
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
