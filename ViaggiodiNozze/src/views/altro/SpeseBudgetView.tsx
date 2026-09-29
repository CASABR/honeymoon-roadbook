import { useState, useEffect, useMemo } from 'react';
import type { Spesa, CategoriaSpesa, StatoSpesa, Alloggio, Trasporto } from '../../types';
import { storageService } from '../../storage/storageService';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface SpeseBudgetViewProps {
  onBack?: () => void;
}

const CATEGORIE_CONFIG: Record<
  CategoriaSpesa,
  { label: string; icon: string; color: string; bg: string; border: string; text: string }
> = {
  trasporti: {
    label: 'Trasporti',
    icon: '✈️',
    color: 'bg-sky-500',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
  },
  alloggi: {
    label: 'Alloggi',
    icon: '🏨',
    color: 'bg-indigo-500',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
  },
  attivita: {
    label: 'Attività',
    icon: '🎟️',
    color: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
  },
  ristoranti: {
    label: 'Ristoranti',
    icon: '🍽️',
    color: 'bg-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
  },
  altro: {
    label: 'Altro',
    icon: '📦',
    color: 'bg-slate-500',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    text: 'text-slate-700',
  },
};

const parseEuro = (val?: string | number): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = val.replace(/[^0-9.,]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export default function SpeseBudgetView({ onBack }: SpeseBudgetViewProps) {
  const [spese, setSpese] = useState<Spesa[]>([]);
  const [alloggi, setAlloggi] = useState<Alloggio[]>([]);
  const [trasporti, setTrasporti] = useState<Trasporto[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Form state
  const [selectedCategory, setSelectedCategory] = useState<CategoriaSpesa | 'tutte'>('tutte');
  const [drillDownCategory, setDrillDownCategory] = useState<CategoriaSpesa | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSpesa, setEditingSpesa] = useState<Spesa | null>(null);
  const [deletingSpesa, setDeletingSpesa] = useState<Spesa | null>(null);

  // Role state
  const [deviceRole, setDeviceRole] = useState(() => storageService.getDeviceRole());
  const canEdit = deviceRole === 'guida' || deviceRole === 'copilota';

  // Form fields
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoriaSpesa>('altro');
  const [status, setStatus] = useState<StatoSpesa>('saldato');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [loadedSpese, loadedAlloggi, loadedTrasporti] = await Promise.all([
        storageService.getSpese(),
        storageService.getAccommodations(),
        storageService.getTransports(),
      ]);
      setSpese(loadedSpese);
      setAlloggi(loadedAlloggi);
      setTrasporti(loadedTrasporti);
    } catch (err) {
      console.error('Errore caricamento dati spese:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const handleDataMutated = () => {
      loadAllData();
    };
    const handleRoleChanged = (e: Event) => {
      const custom = e as CustomEvent<{ role: import('../../types').DeviceRole }>;
      if (custom.detail?.role) {
        setDeviceRole(custom.detail.role);
      } else {
        setDeviceRole(storageService.getDeviceRole());
      }
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    window.addEventListener('device_role_changed', handleRoleChanged);
    return () => {
      window.removeEventListener('roadbook_data_mutated', handleDataMutated);
      window.removeEventListener('device_role_changed', handleRoleChanged);
    };
  }, []);

  // Aggregated Cost Computations
  const stats = useMemo(() => {
    // 1. Spese manuali
    let manualTotale = 0;
    let manualSaldato = 0;
    let manualDaSaldare = 0;

    const catTotals: Record<CategoriaSpesa, { total: number; saldato: number; daSaldare: number }> = {
      trasporti: { total: 0, saldato: 0, daSaldare: 0 },
      alloggi: { total: 0, saldato: 0, daSaldare: 0 },
      attivita: { total: 0, saldato: 0, daSaldare: 0 },
      ristoranti: { total: 0, saldato: 0, daSaldare: 0 },
      altro: { total: 0, saldato: 0, daSaldare: 0 },
    };

    spese.forEach((s) => {
      const amt = Number(s.amount) || 0;
      manualTotale += amt;
      const isPaid = s.status === 'saldato';
      if (isPaid) {
        manualSaldato += amt;
      } else {
        manualDaSaldare += amt;
      }

      if (catTotals[s.category]) {
        catTotals[s.category].total += amt;
        if (isPaid) catTotals[s.category].saldato += amt;
        else catTotals[s.category].daSaldare += amt;
      }
    });

    // 2. Alloggi automatic costs
    let alloggiTotale = 0;
    let alloggiSaldato = 0;
    let alloggiDaSaldare = 0;

    alloggi.forEach((a) => {
      const cost = parseEuro(a.cost);
      if (cost > 0) {
        alloggiTotale += cost;
        if (a.paymentStatus === 'saldato') {
          alloggiSaldato += cost;
        } else {
          alloggiDaSaldare += cost;
        }
      }
    });

    catTotals.alloggi.total += alloggiTotale;
    catTotals.alloggi.saldato += alloggiSaldato;
    catTotals.alloggi.daSaldare += alloggiDaSaldare;

    // 3. Trasporti automatic costs
    let trasportiTotale = 0;
    let trasportiSaldato = 0;
    let trasportiDaSaldare = 0;

    trasporti.forEach((t) => {
      const cost = parseEuro(t.cost);
      const acconto = parseEuro(t.depositPaid || t.acconto);
      if (cost > 0) {
        trasportiTotale += cost;
        if (acconto > 0) {
          const sald = Math.min(acconto, cost);
          trasportiSaldato += sald;
          trasportiDaSaldare += Math.max(0, cost - sald);
        } else {
          trasportiSaldato += cost;
        }
      }
    });

    catTotals.trasporti.total += trasportiTotale;
    catTotals.trasporti.saldato += trasportiSaldato;
    catTotals.trasporti.daSaldare += trasportiDaSaldare;

    const totaleGenerale = manualTotale + alloggiTotale + trasportiTotale;
    const totaleSaldato = manualSaldato + alloggiSaldato + trasportiSaldato;
    const totaleDaSaldare = manualDaSaldare + alloggiDaSaldare + trasportiDaSaldare;

    return {
      totaleGenerale,
      totaleSaldato,
      totaleDaSaldare,
      catTotals,
    };
  }, [spese, alloggi, trasporti]);

  const handleOpenAdd = () => {
    setEditingSpesa(null);
    setTitle('');
    setAmount('');
    setCategory('altro');
    setStatus('saldato');
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (s: Spesa) => {
    setEditingSpesa(s);
    setTitle(s.title);
    setAmount(s.amount.toString());
    setCategory(s.category);
    setStatus(s.status);
    setDate(s.date || new Date().toISOString().split('T')[0]);
    setNotes(s.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveSpesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amount) return;

    const parsedAmt = parseEuro(amount);
    const spesaToSave: Spesa = {
      id: editingSpesa ? editingSpesa.id : 'spesa_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      title: title.trim(),
      amount: parsedAmt,
      category,
      status,
      date,
      notes: notes.trim() || undefined,
    };

    try {
      await storageService.saveSpesa(spesaToSave);
      setIsModalOpen(false);
      await loadAllData();
    } catch (err) {
      console.error('Errore salvataggio spesa:', err);
    }
  };

  const handleDelete = async () => {
    if (!deletingSpesa) return;
    try {
      await storageService.deleteSpesa(deletingSpesa.id);
      setDeletingSpesa(null);
      await loadAllData();
    } catch (err) {
      console.error('Errore eliminazione spesa:', err);
    }
  };

  const handleToggleSaldato = async (spesa: Spesa) => {
    if (!canEdit) return;
    try {
      const newStatus: StatoSpesa = spesa.status === 'saldato' ? 'da_saldare' : 'saldato';
      const updated = { ...spesa, status: newStatus };
      await storageService.saveSpesa(updated);
      await loadAllData();
    } catch (err) {
      console.error('Errore aggiornamento stato spesa:', err);
    }
  };

  const filteredSpese = useMemo(() => {
    if (selectedCategory === 'tutte') return [...spese].sort((a, b) => b.date.localeCompare(a.date));
    return spese.filter((s) => s.category === selectedCategory).sort((a, b) => b.date.localeCompare(a.date));
  }, [spese, selectedCategory]);

  return (
    <div className="flex flex-col h-full animate-fade-in pb-20">
      {/* HEADER */}
      <header className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>💳</span> Spese & Budget
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Monitora i costi totali e le spese del viaggio
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            onClick={handleOpenAdd}
            className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="text-sm leading-none">+</span>
            <span>Nuova Spesa</span>
          </button>
        )}
      </header>

      {/* 1. HERO SUMMARY CARD */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 text-white shadow-xl shadow-indigo-950/20 mb-4 border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
              Totale Generale Previsto
            </span>
            <div className="text-3xl font-black tracking-tight mt-0.5">
              € {stats.totaleGenerale.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-xl text-[10px] font-bold border border-white/10 text-indigo-200">
            {spese.length} spese registrate
          </div>
        </div>

        {/* Saldato vs Da Saldare Cards */}
        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold mb-1">
              <span>✓</span>
              <span>Già Saldato</span>
            </div>
            <div className="text-lg font-bold text-white tracking-tight">
              € {stats.totaleSaldato.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {stats.totaleGenerale > 0
                ? `${Math.round((stats.totaleSaldato / stats.totaleGenerale) * 100)}% del totale`
                : '0%'}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold mb-1">
              <span>⏳</span>
              <span>Residuo da Saldare</span>
            </div>
            <div className="text-lg font-bold text-white tracking-tight">
              € {stats.totaleDaSaldare.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {stats.totaleGenerale > 0
                ? `${Math.round((stats.totaleDaSaldare / stats.totaleGenerale) * 100)}% del totale`
                : '0%'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. BREAKDOWN PER CATEGORIA CON PROGRESS BAR */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
          <span>Ripartizione Spese per Categoria</span>
          <span className="text-[10px] font-normal lowercase text-slate-400">
            (Include alloggi e trasporti)
          </span>
        </h2>

        <div className="space-y-3">
          {(Object.keys(CATEGORIE_CONFIG) as CategoriaSpesa[]).map((catKey) => {
            const config = CATEGORIE_CONFIG[catKey];
            const catStat = stats.catTotals[catKey];
            const pct = stats.totaleGenerale > 0 ? (catStat.total / stats.totaleGenerale) * 100 : 0;

            return (
              <div 
                key={catKey} 
                onClick={() => setDrillDownCategory(catKey)}
                className="group p-2.5 -mx-1.5 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200/80 transition-all cursor-pointer active:scale-[0.99]"
                title={`Tocca per vedere i dettagli delle spese di ${config.label}`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{config.icon}</span>
                    <span className="font-bold text-slate-800">{config.label}</span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      ({pct.toFixed(1)}%)
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform inline-flex items-center">
                      dettagli ➔
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-slate-900">
                      € {catStat.total.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                  <div
                    className={`${config.color} h-full transition-all duration-500 rounded-full`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>

                {/* Sub-info: saldato vs da saldare */}
                {catStat.total > 0 && (
                  <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 px-0.5">
                    <span>Saldato: €{catStat.saldato.toFixed(2)}</span>
                    {catStat.daSaldare > 0 && (
                      <span className="text-rose-500 font-medium">Da saldare: €{catStat.daSaldare.toFixed(2)}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. FILTRI CATEGORIA */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 mb-3">
        <button
          onClick={() => setSelectedCategory('tutte')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
            selectedCategory === 'tutte'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Tutte ({spese.length})
        </button>
        {(Object.keys(CATEGORIE_CONFIG) as CategoriaSpesa[]).map((catKey) => {
          const config = CATEGORIE_CONFIG[catKey];
          const count = spese.filter((s) => s.category === catKey).length;
          const isSelected = selectedCategory === catKey;

          return (
            <button
              key={catKey}
              onClick={() => setSelectedCategory(catKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{config.icon}</span>
              <span>{config.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. LISTA DELLE SPESE MANUALI */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Registro Spese Singole
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">
            {filteredSpese.length} registrate
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Caricamento spese...</div>
        ) : filteredSpese.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <span className="text-3xl block mb-2">🧾</span>
            <p className="text-xs font-bold text-slate-700">Nessuna spesa inserita</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Tocca "+ Nuova Spesa" per aggiungere souvenir, cene o noleggi.
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-3 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <span>+</span> Aggiungi spesa
            </button>
          </div>
        ) : (
          filteredSpese.map((s) => {
            const config = CATEGORIE_CONFIG[s.category] || CATEGORIE_CONFIG.altro;
            const isPaid = s.status === 'saldato';

            return (
              <div
                key={s.id}
                className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs hover:shadow-sm hover:border-slate-300 transition-all flex items-center justify-between gap-3 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-2xl ${config.bg} ${config.text} ${config.border} border flex items-center justify-center text-lg shrink-0`}
                  >
                    {config.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate">
                      {s.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                      <span>{s.date}</span>
                      <span>•</span>
                      <span className="capitalize">{config.label}</span>
                      {s.notes && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[120px]">{s.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-slate-900 tracking-tight">
                      € {s.amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSaldato(s);
                      }}
                      className={`cursor-pointer px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                        isPaid
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      }`}
                    >
                      {isPaid ? '🟢 Saldato' : '🟡 Da saldare'}
                    </button>
                  </div>

                  {canEdit && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(s)}
                        className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                        title="Modifica"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setDeletingSpesa(s)}
                        className="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                        title="Elimina"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL NUOVA / MODIFICA SPESA */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSpesa ? 'Modifica Spesa' : 'Nuova Spesa'}
      >
        <form onSubmit={handleSaveSpesa} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Descrizione / Titolo *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="es. Cena al porto, Noleggio kayak, Souvenir..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Importo (€) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">€</span>
                <input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setAmount(val);
                    }
                  }}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Data
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
          </div>

          {/* Categoria Pill Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Categoria
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CATEGORIE_CONFIG) as CategoriaSpesa[]).map((catKey) => {
                const config = CATEGORIE_CONFIG[catKey];
                const isSelected = category === catKey;

                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setCategory(catKey)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? `${config.bg} ${config.text} ${config.border} border-2 shadow-xs scale-102`
                        : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{config.icon}</span>
                    <span>{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stato Pagamento */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Stato Pagamento
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus('saldato')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  status === 'saldato'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>✓</span>
                <span>Già Saldato</span>
              </button>
              <button
                type="button"
                onClick={() => setStatus('da_saldare')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  status === 'da_saldare'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>⏳</span>
                <span>Da Saldare</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Note (opzionale)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dettagli aggiuntivi, metodo di pagamento..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              {editingSpesa ? 'Salva Modifiche' : 'Aggiungi Spesa'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DIALOG CONFERMA ELIMINAZIONE */}
      <ConfirmDialog
        isOpen={Boolean(deletingSpesa)}
        title="Elimina Spesa"
        message={`Sei sicuro di voler eliminare la spesa "${deletingSpesa?.title}" (€ ${deletingSpesa?.amount})?`}
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        isDestructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingSpesa(null)}
      />

      {/* MODALE DRILL-DOWN CATEGORIA CON DETTAGLI E SUBTOTALE */}
      <Modal
        isOpen={Boolean(drillDownCategory)}
        onClose={() => setDrillDownCategory(null)}
        title={drillDownCategory ? `Dettaglio Spese: ${CATEGORIE_CONFIG[drillDownCategory].label}` : 'Dettaglio'}
        accentVariant={drillDownCategory === 'alloggi' ? 'purple' : drillDownCategory === 'trasporti' ? 'sky' : drillDownCategory === 'attivita' ? 'amber' : drillDownCategory === 'ristoranti' ? 'emerald' : 'indigo'}
      >
        {drillDownCategory && (() => {
          const config = CATEGORIE_CONFIG[drillDownCategory];
          const catStat = stats.catTotals[drillDownCategory];

          // Spese manuali di questa categoria
          const manualItems = spese.filter(s => s.category === drillDownCategory);

          // Alloggi se la categoria è 'alloggi'
          const alloggiItems = drillDownCategory === 'alloggi' 
            ? alloggi.filter(a => parseEuro(a.cost) > 0)
            : [];

          // Trasporti se la categoria è 'trasporti'
          const trasportiItems = drillDownCategory === 'trasporti'
            ? trasporti.filter(t => parseEuro(t.cost) > 0)
            : [];

          return (
            <div className="space-y-4">
              {/* Scheda Subtotale Categoria */}
              <div className={`p-4 rounded-2xl ${config.bg} border ${config.border} flex items-center justify-between`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{config.icon}</span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Subtotale {config.label}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Saldato: €{catStat.saldato.toFixed(2)} • Residuo: €{catStat.daSaldare.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-slate-900 font-mono">
                    € {catStat.total.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Elenco Voci */}
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto no-scrollbar pr-0.5">
                {manualItems.length === 0 && alloggiItems.length === 0 && trasportiItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    Nessuna voce registrata per questa categoria.
                  </div>
                ) : null}

                {/* Voci da Spese Manuali */}
                {manualItems.map(item => {
                  const isPaid = item.status === 'saldato';
                  return (
                    <div
                      key={`manual_${item.id}`}
                      className="p-3 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {item.title}
                          </h4>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600">
                            Spesa
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                          <span>{item.date}</span>
                          {item.notes && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[140px] italic">{item.notes}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-900 font-mono block">
                            € {item.amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          
                          {/* Toggle interattivo Saldato / Da saldare con persistenza immediata */}
                          <button
                            type="button"
                            onClick={async () => {
                              const newStatus = isPaid ? 'da_saldare' : 'saldato';
                              const updated: Spesa = {
                                ...item,
                                status: newStatus,
                                updatedAt: Date.now()
                              };
                              await storageService.saveSpesa(updated);
                              await loadAllData();
                            }}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-all cursor-pointer active:scale-95 border ${
                              isPaid
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 shadow-2xs'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200 shadow-2xs'
                            }`}
                            title="Tocca per cambiare stato pagamento"
                          >
                            <span>{isPaid ? '🟢 Saldato' : '🟡 Da saldare'}</span>
                          </button>
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setDrillDownCategory(null);
                                handleOpenEdit(item);
                              }}
                              className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                              title="Modifica spesa"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDrillDownCategory(null);
                                setDeletingSpesa(item);
                              }}
                              className="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs transition-colors cursor-pointer"
                              title="Elimina spesa"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Voci da Alloggi (se categoria alloggi) */}
                {alloggiItems.map(acc => {
                  const costNum = parseEuro(acc.cost);
                  const isPaid = acc.paymentStatus === 'saldato';
                  return (
                    <div
                      key={`acc_${acc.id}`}
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
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-block ${
                          isPaid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isPaid ? '✓ Saldato' : '⏳ Da saldare'}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Voci da Trasporti (se categoria trasporti) */}
                {trasportiItems.map(tr => {
                  const costNum = parseEuro(tr.cost);
                  const acconto = parseEuro(tr.depositPaid || tr.acconto);
                  const isFullyPaid = acconto >= costNum && costNum > 0;
                  return (
                    <div
                      key={`tr_${tr.id}`}
                      className="p-3 bg-sky-50/40 rounded-2xl border border-sky-100 shadow-2xs flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            ✈️ {tr.departureLocation} → {tr.arrivalLocation}
                          </h4>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-sky-100 text-sky-800">
                            {tr.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          <span>{tr.date}</span>
                          {tr.carrier && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[130px]">{tr.carrier}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-sky-950 font-mono block">
                          € {costNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-block ${
                          isFullyPaid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : acconto > 0
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isFullyPaid ? '✓ Saldato' : acconto > 0 ? `Acconto €${acconto}` : '⏳ Da saldare'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Azioni del modale */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                <button
                  type="button"
                  onClick={() => setDrillDownCategory(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Chiudi
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      const cat = drillDownCategory;
                      setDrillDownCategory(null);
                      setEditingSpesa(null);
                      setTitle('');
                      setAmount('');
                      setCategory(cat);
                      setStatus('saldato');
                      setDate(new Date().toISOString().split('T')[0]);
                      setNotes('');
                      setIsModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>+ Aggiungi Spesa in {config.label}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
