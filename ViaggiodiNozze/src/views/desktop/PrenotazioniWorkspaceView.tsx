import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getAllUnifiedBookings,
  BOOKING_CATEGORY_META,
  type UnifiedBookingItem,
  type BookingCategory
} from '../../services/unifiedBookingService';
import { useDeviceRole } from '../../utils/useDeviceRole';
import UnifiedBookingModal from '../../components/modals/UnifiedBookingModal';
import UnifiedBookingDetailModal from '../../components/modals/UnifiedBookingDetailModal';
import SmartInsertModal from '../../components/modals/SmartInsertModal';

interface PrenotazioniWorkspaceViewProps {
  onOpenSmartInsert?: () => void;
  onNavigateToTab?: (tab: string, categoria?: string) => void;
}

export default function PrenotazioniWorkspaceView({
  onOpenSmartInsert,
  onNavigateToTab: _onNavigateToTab
}: PrenotazioniWorkspaceViewProps) {
  const { canEdit } = useDeviceRole();

  const [bookings, setBookings] = useState<UnifiedBookingItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtri & Ricerca
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<BookingCategory | 'tutte'>('tutte');
  const [timeFilter, setTimeFilter] = useState<'tutte' | 'future' | 'passate'>('tutte');
  const [attachmentFilterOnly, setAttachmentFilterOnly] = useState(false);

  // Modali
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalInitialCategory, setAddModalInitialCategory] = useState<BookingCategory>('volo');
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<UnifiedBookingItem | null>(null);
  const [isSmartInsertOpen, setIsSmartInsertOpen] = useState(false);

  const loadBookings = useCallback(async (isInitial = false) => {
    try {
      if (isInitial && bookings.length === 0) {
        setLoading(true);
      }
      const data = await getAllUnifiedBookings();
      setBookings(data);
    } catch (err) {
      console.error('Errore caricamento prenotazioni:', err);
    } finally {
      setLoading(false);
    }
  }, [bookings.length]);

  useEffect(() => {
    loadBookings(true);
  }, []);

  // Ascolta mutazioni dati e sincronizzazione cloud senza mostrare lo spinner di caricamento
  useEffect(() => {
    const handleRefresh = () => {
      loadBookings(false);
    };
    window.addEventListener('roadbook_data_mutated', handleRefresh);
    window.addEventListener('roadbook_cloud_synced', handleRefresh);
    window.addEventListener('storage', handleRefresh);

    return () => {
      window.removeEventListener('roadbook_data_mutated', handleRefresh);
      window.removeEventListener('roadbook_cloud_synced', handleRefresh);
      window.removeEventListener('storage', handleRefresh);
    };
  }, [loadBookings]);

  // Calcolo statistiche riepilogo
  const stats = useMemo(() => {
    const total = bookings.length;
    let withVoucher = 0;
    let totalCost = 0;
    let paidCost = 0;

    bookings.forEach(b => {
      if (b.hasAttachments) withVoucher++;
      if (b.cost && b.cost > 0) {
        totalCost += b.cost;
        if (b.isPaid) paidCost += b.cost;
        else if (b.paidAmount && b.paidAmount > 0) paidCost += b.paidAmount;
      }
    });

    return {
      total,
      withVoucher,
      withoutVoucher: total - withVoucher,
      totalCost,
      paidCost,
      toPayCost: Math.max(0, totalCost - paidCost)
    };
  }, [bookings]);

  // Filtraggio deterministico
  const filteredBookings = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const q = searchQuery.toLowerCase().trim();

    return bookings.filter(b => {
      // 1. Categoria
      if (selectedCategory !== 'tutte' && b.category !== selectedCategory) {
        return false;
      }

      // 2. Solo con allegati
      if (attachmentFilterOnly && !b.hasAttachments) {
        return false;
      }

      // 3. Filtro temporale
      if (timeFilter === 'future' && b.date && b.date < todayStr) {
        return false;
      }
      if (timeFilter === 'passate' && b.date && b.date >= todayStr) {
        return false;
      }

      // 4. Ricerca testuale
      if (q) {
        const fullSearch = `${b.title} ${b.subtitle || ''} ${b.location || ''} ${b.bookingCode || ''} ${b.carrierOrProvider || ''} ${b.notes || ''}`.toLowerCase();
        if (!fullSearch.includes(q)) return false;
      }

      return true;
    });
  }, [bookings, selectedCategory, attachmentFilterOnly, timeFilter, searchQuery]);

  // Raggruppamento cronologico per Data
  const groupedBookings = useMemo(() => {
    const groups: { [dateKey: string]: UnifiedBookingItem[] } = {};

    filteredBookings.forEach(b => {
      const key = b.date || 'Da programmare / Senza data';
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });

    return Object.entries(groups).map(([date, items]) => ({
      date,
      items
    }));
  }, [filteredBookings]);

  const handleOpenAddWithCategory = (cat: BookingCategory) => {
    setAddModalInitialCategory(cat);
    setIsAddModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-12 space-y-6">
      
      {/* ─── HEADER CENTRO PRENOTAZIONI ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B5F] animate-pulse" />
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#FF6B5F]">
              Hounigo Desktop • Hub Prenotazioni
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#172033] dark:text-white tracking-tight">
            Gestione Prenotazioni &amp; Voucher
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Visualizza, organizza e allega documenti per voli, hotel, tour, noleggi e ristoranti.
          </p>
        </div>

        {/* Azioni Principali */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (onOpenSmartInsert) onOpenSmartInsert();
              else setIsSmartInsertOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
          >
            <span>✨</span>
            <span>Inserimento Smart AI</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => handleOpenAddWithCategory('volo')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#FF6B5F] hover:bg-[#ff5547] text-white text-xs font-bold shadow-md shadow-[#FF6B5F]/20 active:scale-95 transition-all cursor-pointer"
            >
              <span>+</span>
              <span>Aggiungi Manualmente</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── PANORAMICA STATISTICHE DESKTOP ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 p-4.5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
            Totale Prenotazioni
          </span>
          <div className="text-2xl font-black text-[#172033] dark:text-white">
            {stats.total}
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Tutte le categorie unificate
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4.5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">
            Voucher &amp; File Allegati
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {stats.withVoucher} <span className="text-sm font-semibold text-slate-400">/ {stats.total}</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            {stats.withoutVoucher > 0 ? `⚠️ ${stats.withoutVoucher} senza documento` : '✓ Tutti documentati'}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4.5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
            Spesa Impegnata
          </span>
          <div className="text-2xl font-black font-mono text-[#172033] dark:text-white">
            € {stats.totalCost.toFixed(2)}
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Somma costi registrati
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4.5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">
            Da Saldare / Rimanente
          </span>
          <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
            € {stats.toPayCost.toFixed(2)}
          </div>
          <span className="text-[11px] text-emerald-600 font-bold">
            € {stats.paidCost.toFixed(2)} già saldati
          </span>
        </div>
      </div>

      {/* ─── BARRA DI RICERCA, FILTRI & QUICK ADD BAR ───────────────────── */}
      <div className="space-y-3 bg-white/90 dark:bg-slate-900/90 p-4.5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Input di Ricerca Testuale */}
          <div className="relative flex-1 w-full">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cerca per codice PNR, hotel, volo, città o fornitore..."
              className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtri Temporali e Documenti */}
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
            <select
              value={timeFilter}
              onChange={e => setTimeFilter(e.target.value as any)}
              className="px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="tutte">Tutte le date</option>
              <option value="future">Solo in arrivo / future</option>
              <option value="passate">Solo già passate</option>
            </select>

            <button
              type="button"
              onClick={() => setAttachmentFilterOnly(prev => !prev)}
              className={`px-3 py-2 rounded-2xl text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                attachmentFilterOnly
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <span>📎</span>
              <span>Solo con allegato</span>
            </button>
          </div>
        </div>

        {/* Pillole Categorie */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('tutte')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
              selectedCategory === 'tutte'
                ? 'bg-[#172033] text-white border-[#172033] dark:bg-white dark:text-[#172033] dark:border-white shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Tutte ({bookings.length})
          </button>
          {(Object.keys(BOOKING_CATEGORY_META) as BookingCategory[]).map(catKey => {
            const meta = BOOKING_CATEGORY_META[catKey];
            const count = bookings.filter(b => b.category === catKey).length;
            const isSelected = selectedCategory === catKey;

            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(catKey)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                  isSelected
                    ? `${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder} shadow-2xs ring-1 ring-current`
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
                <span className="text-[10px] opacity-75 font-normal">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── ELENCO PRINCIPALE PRENOTAZIONI RAGGRUPPATO ─────────────────── */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-[#FF6B5F] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-400">
            Caricamento e unificazione prenotazioni in corso...
          </span>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white/80 dark:bg-slate-900/80 rounded-3xl p-12 text-center border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <span className="text-4xl block">📋</span>
          <h3 className="text-base font-black text-[#172033] dark:text-white">
            Nessuna prenotazione trovata
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || selectedCategory !== 'tutte' || attachmentFilterOnly
              ? 'Nessun risultato corrisponde ai filtri selezionati. Prova a reimpostarli.'
              : 'Non ci sono ancora prenotazioni caricate nel viaggio. Usa l\'Inserimento Smart o aggiungi la tua prima prenotazione manuale.'}
          </p>
          <div className="pt-2 flex justify-center gap-2">
            {(searchQuery || selectedCategory !== 'tutte' || attachmentFilterOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('tutte');
                  setAttachmentFilterOnly(false);
                  setTimeFilter('tutte');
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Resetta Filtri
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => handleOpenAddWithCategory('volo')}
                className="px-4 py-2 rounded-xl bg-[#FF6B5F] text-white text-xs font-bold shadow-md"
              >
                + Crea Prenotazione
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedBookings.map(({ date, items }) => (
            <div key={date} className="space-y-3">
              {/* Header Giorno / Sezione */}
              <div className="flex items-center gap-3 px-1">
                <span className="text-xs font-black text-[#172033] dark:text-white tracking-wide uppercase">
                  🗓️ {date}
                </span>
                <div className="flex-1 h-px bg-slate-200/80 dark:border-slate-800" />
                <span className="text-[11px] font-bold text-slate-400">
                  {items.length} {items.length === 1 ? 'prenotazione' : 'prenotazioni'}
                </span>
              </div>

              {/* Grid Card Desktop / Tablet */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {items.map(item => {
                  const meta = BOOKING_CATEGORY_META[item.category];

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedBookingForDetail(item)}
                      className="group bg-white dark:bg-slate-900 rounded-3xl p-4.5 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-[#FF6B5F]/40 transition-all cursor-pointer flex flex-col justify-between gap-3 relative overflow-hidden"
                    >
                      {/* Bordo colorato superiore di categoria */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0 border border-slate-200/60 dark:border-slate-700">
                            {meta.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className={`inline-block px-2 py-0.2 rounded-full text-[9px] font-extrabold uppercase tracking-wider border mb-1 ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}>
                              {meta.label}
                            </span>
                            <h3 className="font-extrabold text-[#172033] dark:text-white text-xs sm:text-sm leading-tight truncate group-hover:text-[#FF6B5F] transition-colors">
                              {item.title}
                            </h3>
                          </div>
                        </div>

                        {/* Badge Allegati (visibile chiaramente solo se presente un voucher o documento) */}
                        {item.hasAttachments && (
                          <div className="shrink-0 flex items-center gap-1">
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 text-[10px] font-bold" title="Voucher / Documento allegato">
                              📎 {item.attachmentsCount}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info Località e Orari */}
                      <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                        {item.location && (
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-slate-400">📍</span>
                            <span className="truncate font-semibold">{item.location}</span>
                          </div>
                        )}
                        {item.time && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">⏰</span>
                            <span className="font-bold">{item.time}</span>
                            {item.endTime && <span className="text-slate-400">→ {item.endTime}</span>}
                          </div>
                        )}
                      </div>

                      {/* Codice Prenotazione & Costo Footer */}
                      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        {item.bookingCode ? (
                          <span className="font-mono font-bold text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                            {item.bookingCode}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium italic">
                            Nessun PNR
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 font-mono">
                          {item.cost && item.cost > 0 ? (
                            <span className="font-black text-[#172033] dark:text-white">
                              € {item.cost.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500">
                              Incluso
                            </span>
                          )}
                          <span className={`w-2 h-2 rounded-full ${item.isPaid ? 'bg-emerald-500' : 'bg-amber-500'}`} title={item.isPaid ? 'Saldato' : 'Da saldare'} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── MODALI INTEGRATI ───────────────────────────────────────────── */}
      {/* Modale Creazione Manuale */}
      <UnifiedBookingModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaved={loadBookings}
        initialCategory={addModalInitialCategory}
      />

      {/* Modale Dettaglio & Gestione File */}
      <UnifiedBookingDetailModal
        booking={selectedBookingForDetail}
        isOpen={Boolean(selectedBookingForDetail)}
        onClose={() => setSelectedBookingForDetail(null)}
        onUpdated={() => {
          loadBookings();
          setSelectedBookingForDetail(null);
        }}
        canEdit={canEdit}
      />

      {/* Inserimento Smart AI */}
      <SmartInsertModal
        isOpen={isSmartInsertOpen}
        onClose={() => setIsSmartInsertOpen(false)}
        onSaved={() => {
          loadBookings();
          setIsSmartInsertOpen(false);
        }}
        mode="manual"
      />
    </div>
  );
}
