import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import Modal from '../../components/common/Modal';
import TrasportoForm from '../../components/forms/TrasportoForm';
import AlloggioForm from '../../components/forms/AlloggioForm';
import AttivitaForm from '../../components/forms/AttivitaForm';
import RistoranteForm from '../../components/forms/RistoranteForm';
import ShoppingForm from '../../components/forms/ShoppingForm';
import DocumentValidityModal from '../../components/modals/DocumentValidityModal';
import { storageService } from '../../storage/storageService';
import type { Trasporto, Alloggio, Attivita, Ristorante, Shopping, TravelDocument } from '../../types';
import { formatDateIT, normalizeDateToISO } from '../../utils/tripDates';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSlowLoading, setIsSlowLoading] = useState(false);

  const isFetchingRef = useRef(false);
  const debounceTimerRef = useRef<any>(null);
  const slowTimerRef = useRef<any>(null);
  const bookingsRef = useRef<UnifiedBookingItem[]>([]);
  bookingsRef.current = bookings;

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

  // Modali di Modifica Entità
  const [editingTransportItem, setEditingTransportItem] = useState<Trasporto | null>(null);
  const [editingAccommodationItem, setEditingAccommodationItem] = useState<Alloggio | null>(null);
  const [editingActivityItem, setEditingActivityItem] = useState<Attivita | null>(null);
  const [editingRestaurantItem, setEditingRestaurantItem] = useState<Ristorante | null>(null);
  const [editingShoppingItem, setEditingShoppingItem] = useState<Shopping | null>(null);
  const [editingDocumentItem, setEditingDocumentItem] = useState<TravelDocument | null>(null);

  const handleOpenEditBooking = useCallback((booking: UnifiedBookingItem) => {
    setSelectedBookingForDetail(null);
    switch (booking.rawType) {
      case 'trasporto':
        setEditingTransportItem(booking.rawItem as Trasporto);
        break;
      case 'alloggio':
        setEditingAccommodationItem(booking.rawItem as Alloggio);
        break;
      case 'attivita':
        setEditingActivityItem(booking.rawItem as Attivita);
        break;
      case 'ristorante':
        setEditingRestaurantItem(booking.rawItem as Ristorante);
        break;
      case 'shopping':
        setEditingShoppingItem(booking.rawItem as Shopping);
        break;
      case 'documento':
        setEditingDocumentItem(booking.rawItem as TravelDocument);
        break;
    }
  }, []);

  const handleSaveTransport = async (data: Omit<Trasporto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const transportToSave: Trasporto = {
      ...data,
      id: data.id || editingTransportItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'trans_' + Date.now()),
      createdAt: editingTransportItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveTransport(transportToSave);
    setEditingTransportItem(null);
    await loadBookings();
  };

  const handleDeleteTransport = async () => {
    if (!editingTransportItem) return;
    await storageService.deleteTransport(editingTransportItem.id);
    setEditingTransportItem(null);
    await loadBookings();
  };

  const handleSaveAccommodation = async (data: Omit<Alloggio, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const alloggioToSave: Alloggio = {
      ...data,
      id: data.id || editingAccommodationItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'acc_' + Date.now()),
      createdAt: editingAccommodationItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveAccommodation(alloggioToSave);
    setEditingAccommodationItem(null);
    await loadBookings();
  };

  const handleDeleteAccommodation = async () => {
    if (!editingAccommodationItem) return;
    await storageService.deleteAccommodation(editingAccommodationItem.id);
    setEditingAccommodationItem(null);
    await loadBookings();
  };

  const handleSaveActivity = async (data: Omit<Attivita, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const activityToSave: Attivita = {
      ...data,
      id: data.id || editingActivityItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act_' + Date.now()),
      createdAt: editingActivityItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveActivity(activityToSave);
    setEditingActivityItem(null);
    await loadBookings();
  };

  const handleDeleteActivity = async () => {
    if (!editingActivityItem) return;
    await storageService.deleteActivity(editingActivityItem.id);
    setEditingActivityItem(null);
    await loadBookings();
  };

  const handleSaveRestaurant = async (data: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const ristoranteToSave: Ristorante = {
      ...data,
      id: data.id || editingRestaurantItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'rist_' + Date.now()),
      createdAt: editingRestaurantItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveRistorante(ristoranteToSave);
    setEditingRestaurantItem(null);
    await loadBookings();
  };

  const handleSaveShopping = async (data: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const shoppingToSave: Shopping = {
      ...data,
      id: data.id || editingShoppingItem?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'shop_' + Date.now()),
      createdAt: editingShoppingItem?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveShopping(shoppingToSave);
    setEditingShoppingItem(null);
    await loadBookings();
  };

  const handleSaveDocument = async (updated: TravelDocument) => {
    await storageService.saveDocument(updated);
    setEditingDocumentItem(null);
    await loadBookings();
  };

  const loadBookings = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      setIsSlowLoading(true);
    }, 6000);

    try {
      if (isInitial && bookingsRef.current.length === 0) {
        setLoading(true);
      }
      const data = await getAllUnifiedBookings();
      setBookings(data);
      setLoadError(null);
    } catch (err: any) {
      console.error('Errore caricamento prenotazioni:', err);
      setLoadError(err?.message || 'Si è verificato un errore durante il caricamento delle prenotazioni.');
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowLoading(false);
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadBookings(true);
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [loadBookings]);

  // Ascolta mutazioni dati e sincronizzazione cloud con debounce per evitare chiamate ripetute
  useEffect(() => {
    const handleRefresh = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        loadBookings(false);
      }, 250);
    };
    window.addEventListener('roadbook_data_mutated', handleRefresh);
    window.addEventListener('roadbook_cloud_synced', handleRefresh);
    window.addEventListener('storage', handleRefresh);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
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
      if (timeFilter !== 'tutte') {
        const isoDate = normalizeDateToISO(b.date);
        if (timeFilter === 'future' && isoDate && isoDate < todayStr) {
          return false;
        }
        if (timeFilter === 'passate' && isoDate && isoDate >= todayStr) {
          return false;
        }
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
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Hounigo" className="h-4 w-auto object-contain" />
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
      {loadError && bookings.length === 0 ? (
        <div className="bg-rose-50/90 dark:bg-rose-950/40 rounded-3xl p-10 text-center border border-rose-200 dark:border-rose-900/50 shadow-sm space-y-3">
          <span className="text-4xl block">⚠️</span>
          <h3 className="text-base font-black text-rose-900 dark:text-rose-200">
            Impossibile caricare le prenotazioni
          </h3>
          <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md mx-auto">
            {loadError}
          </p>
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => loadBookings(true)}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md cursor-pointer transition-colors"
            >
              🔄 Riprova Caricamento
            </button>
          </div>
        </div>
      ) : loading && bookings.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-[#FF6B5F] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-400">
            Caricamento e unificazione prenotazioni in corso...
          </span>
          {isSlowLoading && (
            <div className="mt-2 flex flex-col items-center gap-2 animate-fade-in">
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Il caricamento sta impiegando più tempo del previsto.
              </span>
              <button
                type="button"
                onClick={() => loadBookings(true)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-300 cursor-pointer"
              >
                Forza Ricaricamento
              </button>
            </div>
          )}
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
                  🗓️ {formatDateIT(date)}
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

                        <div className="shrink-0 flex items-center gap-1.5">
                          {/* Badge Allegati (visibile chiaramente solo se presente un voucher o documento) */}
                          {item.hasAttachments && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 text-[10px] font-bold" title="Voucher / Documento allegato">
                              📎 {item.attachmentsCount}
                            </span>
                          )}

                          {/* Pulsante Modifica Rapida Card Desktop */}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditBooking(item);
                              }}
                              className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-800 dark:bg-slate-800 dark:hover:bg-amber-950/40 dark:text-slate-400 dark:hover:text-amber-300 flex items-center justify-center text-xs font-bold transition-all shadow-2xs border border-slate-200/60 dark:border-slate-700 cursor-pointer"
                              title="Modifica prenotazione"
                              aria-label="Modifica prenotazione"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
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
                        {item.bookingCode && item.bookingCode.trim() ? (
                          <span className="font-mono font-bold text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                            {item.bookingCode.trim()}
                          </span>
                        ) : (
                          <span />
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
        onEdit={handleOpenEditBooking}
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

      {/* ─── MODALI MODIFICA ENTITÀ (DESKTOP) ─────────────────────────────── */}
      {/* 1. Modifica Trasporto */}
      <Modal
        isOpen={Boolean(editingTransportItem)}
        onClose={() => setEditingTransportItem(null)}
        title="Modifica Trasporto"
        accentVariant="sky"
      >
        <TrasportoForm
          initialData={editingTransportItem}
          onSave={handleSaveTransport}
          onCancel={() => setEditingTransportItem(null)}
          onDelete={handleDeleteTransport}
        />
      </Modal>

      {/* 2. Modifica Alloggio */}
      <Modal
        isOpen={Boolean(editingAccommodationItem)}
        onClose={() => setEditingAccommodationItem(null)}
        title="Modifica Alloggio"
        accentVariant="purple"
      >
        <AlloggioForm
          initialData={editingAccommodationItem}
          onSave={handleSaveAccommodation}
          onCancel={() => setEditingAccommodationItem(null)}
          onDelete={handleDeleteAccommodation}
        />
      </Modal>

      {/* 3. Modifica Attività */}
      <Modal
        isOpen={Boolean(editingActivityItem)}
        onClose={() => setEditingActivityItem(null)}
        title="Modifica Attività"
        accentVariant="amber"
      >
        <AttivitaForm
          selectedDayId={editingActivityItem?.dayId}
          initialData={editingActivityItem}
          onSave={handleSaveActivity}
          onCancel={() => setEditingActivityItem(null)}
          onDelete={handleDeleteActivity}
        />
      </Modal>

      {/* 4. Modifica Ristorante */}
      <Modal
        isOpen={Boolean(editingRestaurantItem)}
        onClose={() => setEditingRestaurantItem(null)}
        title="Modifica Ristorante"
        accentVariant="emerald"
      >
        <RistoranteForm
          initialData={editingRestaurantItem}
          onSave={handleSaveRestaurant}
          onCancel={() => setEditingRestaurantItem(null)}
        />
      </Modal>

      {/* 5. Modifica Shopping */}
      <Modal
        isOpen={Boolean(editingShoppingItem)}
        onClose={() => setEditingShoppingItem(null)}
        title="Modifica Shopping"
        accentVariant="rose"
      >
        <ShoppingForm
          initialData={editingShoppingItem}
          onSave={handleSaveShopping}
          onCancel={() => setEditingShoppingItem(null)}
        />
      </Modal>

      {/* 6. Modifica Documento / Voucher */}
      <DocumentValidityModal
        isOpen={Boolean(editingDocumentItem)}
        onClose={() => setEditingDocumentItem(null)}
        document={editingDocumentItem}
        onSave={handleSaveDocument}
      />
    </div>
  );
}
