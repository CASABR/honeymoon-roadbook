import { useState, useEffect, useRef, type ReactNode } from 'react';
import type { Trasporto } from '../types';
import { storageService } from '../storage/storageService';
import TrasportoCard from '../components/cards/TrasportoCard';
import TrasportoForm from '../components/forms/TrasportoForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import SwipeToDelete from '../components/common/SwipeToDelete';
import { useDeviceRole } from '../utils/useDeviceRole';
import { useHorizontalScrollCue } from '../hooks/useHorizontalScrollCue';

import TimeCollisionModal, { type TimeCollision } from '../components/modals/TimeCollisionModal';
import {
  extractTimeInterval,
  areIntervalsOverlapping,
  getCollisionPairKey,
  getPairSignature,
  isCollisionDismissedOrResolved,
  persistCollisionDecision
} from '../utils/overlapDetection';
import type { TimelineItem } from '../types';
import DayPickerStrip from '../components/common/DayPickerStrip';
import { getTripDateRange, type TripDayItem } from '../utils/tripDates';
import DesktopEconomySummary from '../components/common/DesktopEconomySummary';

const detectCountry = (t: Trasporto): string => {
  const text = `${t.departureLocation || ''} ${t.arrivalLocation || ''} ${t.layover?.airport || ''} ${t.carrier || ''} ${t.noteCopilota || ''}`.toLowerCase();
  if (/(syd|mel|adl|adelaide|kangaroo island|sydney|melbourne|virgin australia|jetstar|australia|\bau\b)/.test(text)) return '🇦🇺 Australia';
  if (/(auckland|akl|chc|wellington|christchurch|picton|queenstown|rotorua|snap rentals|cook strait|sealink|nuova zelanda|\bnz\b)/.test(text)) return '🇳🇿 Nuova Zelanda';
  if (/(mnl|mph|eni|usu|ceb|manila|boracay|el nido|tao coron|cebu|filippine|airswift|asia|\bph\b)/.test(text)) return '🇵🇭 Filippine';
  if (/(pek|pvg|roma|fco|mxp|malpensa|air china|china airlines|doha)/.test(text) || (t.type === 'volo' && (text.includes('milano') || text.includes('roma') || text.includes('intercontinentale')))) return '✈️ Intercontinentali';
  return '🌍 Altro';
};

type FilterType = 'tutti' | 'volo' | 'treno' | 'metro' | 'traghetto' | 'auto_camper' | 'transfer' | 'taxi';
type CountryFilterType = 'tutti' | '🇳🇿 Nuova Zelanda' | '🇦🇺 Australia' | '🇵🇭 Filippine' | '✈️ Intercontinentali' | '🌍 Altro';

interface ScrollableFilterRowProps {
  children: ReactNode;
  ariaLabel: string;
  depsKey: string | number;
  className?: string;
}

/**
 * Wraps a horizontal filter pill bar with edge fades and flanking scroll buttons
 * whenever the pills overflow horizontally on phone, iPad, or desktop.
 */
function ScrollableFilterRow({ children, ariaLabel, depsKey, className = '' }: ScrollableFilterRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight, scrollByDirection } = useHorizontalScrollCue(scrollRef, depsKey);

  return (
    <div className={`-mx-1 flex items-center gap-1.5 ${className}`}>
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByDirection('left', 180)}
          aria-label={`Scorri ${ariaLabel} indietro`}
          title={`Scorri ${ariaLabel} indietro`}
          className="shrink-0 w-7 h-7 rounded-full bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center text-slate-600 dark:text-slate-200 hover:text-slate-900 hover:border-slate-300 active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      <div className="relative flex-1 min-w-0">
        {canScrollLeft && (
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-[#F8F7F3] dark:from-slate-950 to-transparent z-10"
            aria-hidden="true"
          />
        )}
        <div
          ref={scrollRef}
          className="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none snap-x scroll-smooth"
        >
          {children}
        </div>
        {canScrollRight && (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-7 bg-gradient-to-l from-[#F8F7F3] via-[#F8F7F3]/90 dark:from-slate-950 dark:via-slate-950/90 to-transparent z-10"
            aria-hidden="true"
          />
        )}
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByDirection('right', 180)}
          aria-label={`Scorri ${ariaLabel} avanti`}
          title={`Scorri ${ariaLabel} avanti`}
          className="shrink-0 w-7 h-7 rounded-full bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center text-slate-600 dark:text-slate-200 hover:text-slate-900 hover:border-slate-300 active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function TrasportiView() {
  const { canEdit } = useDeviceRole();
  const [transports, setTransports] = useState<Trasporto[]>([]);
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('tutti');
  const [activeCountryFilter, setActiveCountryFilter] = useState<CountryFilterType>('tutti');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransport, setEditingTransport] = useState<Trasporto | null>(null);
  const [deletingTransport, setDeletingTransport] = useState<Trasporto | null>(null);
  const [activeCollision, setActiveCollision] = useState<TimeCollision | null>(null);

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout caricamento dati (1.5s)')), 1500)
      );

      const [items, range] = await Promise.race([
        Promise.all([storageService.getTransports(), getTripDateRange()]),
        timeoutPromise
      ]) as [Trasporto[], any];

      setTransports(items || []);
      if (range) setTripDays(range.tripDays);
    } catch (err) {
      console.error('Errore caricamento trasporti:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  useEffect(() => {
    const handleDataMutated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.entityType === 'trasporti' && customEvent.detail?.action === 'update' && customEvent.detail?.data) {
        const updated = customEvent.detail.data as Trasporto;
        setTransports(prev => prev.map(item => item.id === updated.id ? updated : item));
        return;
      }
      loadData(true);
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, []);

  // Rilevamento automatico di trasporti duplicati/sovrapposti in ordine cronologico
  useEffect(() => {
    if (transports.length < 2) {
      setActiveCollision(null);
      return;
    }

    // Ordina cronologicamente
    const sorted = [...transports].sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.departureTime || '00:00';
      const timeB = b.departureTime || '00:00';
      return timeA.localeCompare(timeB);
    });

    let nextCollision: TimeCollision | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const tA = sorted[i];
      const intA = extractTimeInterval(tA, 'trasporto');

      for (let j = i + 1; j < sorted.length; j++) {
        const tB = sorted[j];
        if (tA.id === tB.id) continue;

        // Se entrambi hanno lo stesso bookingCode / PNR, sono segmenti dello stesso viaggio
        if (tA.bookingCode && tB.bookingCode && tA.bookingCode === tB.bookingCode) {
          continue;
        }

        const intB = extractTimeInterval(tB, 'trasporto');

        if (areIntervalsOverlapping(intA, intB)) {
          const pairKey = getCollisionPairKey(tA.id, tB.id, 'transport');
          const sig = getPairSignature(intA.signature, intB.signature);
          const isDismissed = isCollisionDismissedOrResolved(tA.id, tB.id, sig, 'transport');

          if (!isDismissed) {
            const toTimelineItem = (t: Trasporto): TimelineItem => ({
              id: t.id,
              type: 'trasporto',
              time: t.departureTime || '00:00',
              title: `${t.type.toUpperCase()}: ${t.departureLocation} ➔ ${t.arrivalLocation}`,
              location: `${t.departureLocation} → ${t.arrivalLocation}`,
              categoryOrType: t.type,
              completed: t.completed,
              originalData: t
            });

            const displayTime = tA.departureTime === tB.departureTime
              ? `${intA.date} alle ${tA.departureTime || 'Partenza'}`
              : `${intA.date} (${tA.departureTime || 'N/D'} vs ${tB.departureTime || 'N/D'})`;

            nextCollision = {
              id: pairKey,
              time: displayTime,
              itemA: toTimelineItem(tA),
              itemB: toTimelineItem(tB)
            };
            break;
          }
        }
      }
      if (nextCollision) break;
    }

    setActiveCollision(nextCollision);
  }, [transports]);

  const handleOpenAdd = () => {
    setEditingTransport(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (transport: Trasporto) => {
    setEditingTransport(transport);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Omit<Trasporto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const transportToSave: Trasporto = {
      ...data,
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'trn_' + Date.now()),
      attachments: data.attachments || [],
      createdAt: editingTransport?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveTransport(transportToSave);
    setIsModalOpen(false);
    setEditingTransport(null);
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deletingTransport) return;
    await storageService.deleteTransport(deletingTransport.id);
    setDeletingTransport(null);
    await loadData();
  };

  // Filtraggio tratte
  const filteredTransports = transports.filter((t) => {
    const typeMatch = (activeFilter === 'tutti') || 
                      (activeFilter === 'volo' && t.type === 'volo') ||
                      (activeFilter === 'treno' && t.type === 'treno') ||
                      (activeFilter === 'metro' && t.type === 'metro') ||
                      (activeFilter === 'traghetto' && t.type === 'traghetto') ||
                      (activeFilter === 'auto_camper' && (t.type === 'auto' || t.type === 'camper')) ||
                      (activeFilter === 'transfer' && t.type === 'transfer') ||
                      (activeFilter === 'taxi' && t.type === 'taxi');
    
    const c = detectCountry(t);
    const countryMatch = (activeCountryFilter === 'tutti') || (activeCountryFilter === c);
    const dateMatch = (selectedDate === 'tutte') || (t.date === selectedDate);
    
    return typeMatch && countryMatch && dateMatch;
  });

  // Contatori
  const counts = {
    tutti: transports.length,
    volo: transports.filter((t) => t.type === 'volo').length,
    treno: transports.filter((t) => t.type === 'treno').length,
    metro: transports.filter((t) => t.type === 'metro').length,
    traghetto: transports.filter((t) => t.type === 'traghetto').length,
    auto_camper: transports.filter((t) => t.type === 'auto' || t.type === 'camper').length,
    transfer: transports.filter((t) => t.type === 'transfer').length,
    taxi: transports.filter((t) => t.type === 'taxi').length
  };

  const filterChips: { id: FilterType; label: string; icon: string; count: number }[] = [
    { id: 'tutti', label: 'Tutti', icon: '🌐', count: counts.tutti },
    { id: 'volo', label: 'Voli', icon: '✈️', count: counts.volo },
    { id: 'treno', label: 'Treni', icon: '🚆', count: counts.treno },
    { id: 'metro', label: 'Metro', icon: '🚇', count: counts.metro },
    { id: 'traghetto', label: 'Traghetti', icon: '🚢', count: counts.traghetto },
    { id: 'auto_camper', label: 'Noleggi & Auto', icon: '🚗', count: counts.auto_camper },
    { id: 'transfer', label: 'Transfer / Bus', icon: '🚐', count: counts.transfer },
    { id: 'taxi', label: 'Taxi', icon: '🚕', count: counts.taxi }
  ];

  const countryChips: { id: CountryFilterType; label: string }[] = [
    { id: 'tutti', label: 'Tutti i Paesi' },
    { id: '✈️ Intercontinentali', label: '✈️ Intercont.' },
    { id: '🇳🇿 Nuova Zelanda', label: '🇳🇿 NZ' },
    { id: '🇦🇺 Australia', label: '🇦🇺 AU' },
    { id: '🇵🇭 Filippine', label: '🇵🇭 PH' },
    { id: '🌍 Altro', label: '🌍 Altro' }
  ];

  // Raggruppamento macro-aree -> giorni
  const groupedByCountry = filteredTransports.reduce<Record<string, Record<string, Trasporto[]>>>((acc, transport) => {
    const country = detectCountry(transport);
    const dateKey = transport.date;
    if (!acc[country]) acc[country] = {};
    if (!acc[country][dateKey]) acc[country][dateKey] = [];
    acc[country][dateKey].push(transport);
    return acc;
  }, {});

  // Define macro order
  const macroOrder = ['✈️ Intercontinentali', '🇳🇿 Nuova Zelanda', '🇦🇺 Australia', '🇵🇭 Filippine', '🌍 Altro'];
  const sortedCountries = Object.keys(groupedByCountry).sort((a, b) => {
    const idxA = macroOrder.indexOf(a);
    const idxB = macroOrder.indexOf(b);
    return (idxA > -1 ? idxA : 99) - (idxB > -1 ? idxB : 99);
  });

  const formatGroupDateHeader = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      if (y && m && d) {
        return `${d}-${m}-${y}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <section className="flex flex-col flex-1 pb-10">
      {/* Header Mobile-First */}
      <header className="flex items-center justify-between mb-3.5 flex-wrap gap-2.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Trasporti
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {transports.length === 0
              ? 'Nessuna tratta inserita'
              : `${transports.length} ${transports.length === 1 ? 'tratta registrata' : 'tratte registrate'} (confermate)`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1 min-h-[36px] px-3 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Nuovo</span>
            </button>
          )}
        </div>
      </header>

      {/* Riepilogo Economico Solo Desktop */}
      <DesktopEconomySummary items={transports} categoryName="Trasporti" accentColor="blue" />

      {/* Selettore DayPickerStrip a scorrimento orizzontale con frecce desktop */}
      <DayPickerStrip
        days={tripDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        totalCount={transports.length}
        itemCounts={transports.reduce<Record<string, number>>((acc, t) => {
          if (t.date) {
            acc[t.date] = (acc[t.date] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* Chips Filter Horizontal Bar - Types */}
      {transports.length > 0 && (
        <ScrollableFilterRow
          ariaLabel="filtri categoria"
          depsKey={`${transports.length}-${filterChips.map((c) => c.count).join(',')}`}
          className="mb-1.5"
        >
          {filterChips.map((chip) => {
            const isActive = activeFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveFilter(chip.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all snap-start cursor-pointer border ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
                <span
                  className={`ml-0.5 px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white font-bold' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </ScrollableFilterRow>
      )}

      {/* Chips Filter Horizontal Bar - Countries */}
      {transports.length > 0 && (
        <ScrollableFilterRow
          ariaLabel="filtri paese"
          depsKey={`${transports.length}-${countryChips.length}`}
          className="mb-4"
        >
          {countryChips.map((chip) => {
            const isActive = activeCountryFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveCountryFilter(chip.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all snap-start cursor-pointer border ${
                  isActive
                    ? 'bg-slate-800 text-white border-slate-800 shadow-md shadow-slate-800/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span>{chip.label}</span>
              </button>
            );
          })}
        </ScrollableFilterRow>
      )}

      {/* Empty State */}
      {transports.length === 0 ? (
        <EmptyState
          title="Nessun trasporto inserito"
          description="Aggiungi voli, traghetti, camper e transfer per il tuo viaggio."
          actionLabel="Aggiungi Trasporto"
          accentVariant="sky"
          onAction={handleOpenAdd}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          }
        />
      ) : filteredTransports.length === 0 ? (
        <div className="text-center py-10 px-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Nessuna tratta per la categoria/paese selezionata.</p>
          <button
            type="button"
            onClick={() => { setActiveFilter('tutti'); setActiveCountryFilter('tutti'); }}
            className="mt-3 text-xs font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
          >
            Mostra tutti i trasporti
          </button>
        </div>
      ) : (
        /* Elenco Raggruppato Paese -> Giorno */
        <div className="space-y-8">
          {sortedCountries.map((country) => {
            const countryGroup = groupedByCountry[country];
            const sortedDates = Object.keys(countryGroup).sort((a, b) => {
              const isoA = ((a || '').split('-').length === 3 && (a || '').split('-')[0].length === 2 ? (a || '').split('-').reverse().join('-') : (a || ''));
              const isoB = ((b || '').split('-').length === 3 && (b || '').split('-')[0].length === 2 ? (b || '').split('-').reverse().join('-') : (b || ''));
              return isoA.localeCompare(isoB);
            });
            
            return (
              <div key={country} className="space-y-4">
                <div className="sticky app-sticky-subheader z-10 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
                  <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    {country}
                  </h2>
                </div>
                
                <div className="space-y-6">
                  {sortedDates.map((dateKey) => {
                    const dayItems = countryGroup[dateKey];
                    return (
                      <div key={dateKey} className="space-y-3">
                        <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider pl-1 flex items-center gap-2">
                          <span className="w-4 h-px bg-slate-300 rounded-full" />
                          {formatGroupDateHeader(dateKey)}
                          <span className="flex-1 h-px bg-slate-200/60 rounded-full" />
                        </h3>
                        <div className="grid gap-3 min-w-0 max-w-full">
                          {dayItems.map((t) => (
                            <SwipeToDelete key={t.id} disabled={!canEdit} onDelete={() => setDeletingTransport(t)}>
                              <TrasportoCard
                                transport={t}
                                onEdit={() => handleOpenEdit(t)}
                                onDelete={() => setDeletingTransport(t)}
                              />
                            </SwipeToDelete>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODALS */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTransport ? 'Modifica Trasporto' : 'Nuovo Trasporto'}
      >
        <TrasportoForm
          initialData={editingTransport || undefined}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingTransport}
        title="Elimina Trasporto"
        message={`Sei sicuro di voler eliminare la tratta ${deletingTransport?.departureLocation} ➔ ${deletingTransport?.arrivalLocation}? L'azione è irreversibile.`}
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingTransport(null)}
        isDestructive
      />

      {/* Popup Comparativo Trasporti Duplicati / Sovrapposti */}
      <TimeCollisionModal
        collision={activeCollision}
        onKeepBoth={() => {
          if (activeCollision) {
            const rawA = activeCollision.itemA.originalData || activeCollision.itemA;
            const rawB = activeCollision.itemB.originalData || activeCollision.itemB;
            const intA = extractTimeInterval(rawA, 'trasporto');
            const intB = extractTimeInterval(rawB, 'trasporto');
            const sig = getPairSignature(intA.signature, intB.signature);
            persistCollisionDecision(activeCollision.itemA.id, activeCollision.itemB.id, 'keep', sig, 'transport');
          }
          setActiveCollision(null);
        }}
        onDeleteItem={async (itemId) => {
          try {
            await storageService.deleteTransport(itemId);
            setTransports(prev => prev.filter(t => t.id !== itemId));
            if (activeCollision) {
              const rawA = activeCollision.itemA.originalData || activeCollision.itemA;
              const rawB = activeCollision.itemB.originalData || activeCollision.itemB;
              const intA = extractTimeInterval(rawA, 'trasporto');
              const intB = extractTimeInterval(rawB, 'trasporto');
              const sig = getPairSignature(intA.signature, intB.signature);
              persistCollisionDecision(activeCollision.itemA.id, activeCollision.itemB.id, 'resolved', sig, 'transport');
            }
          } catch (e) {
            console.error('Errore durante eliminazione trasporto duplicato:', e);
          } finally {
            setActiveCollision(null);
          }
        }}
        onUpdateTime={async (itemId, _type, newTime, dateDeltaDays) => {
          try {
            const shiftDateStr = (dateStr?: string, delta?: number) => {
              if (!dateStr || !delta) return dateStr;
              const d = new Date(dateStr + 'T12:00:00Z');
              if (isNaN(d.getTime())) return dateStr;
              d.setUTCDate(d.getUTCDate() + delta);
              return d.toISOString().split('T')[0];
            };

            const found = transports.find(t => t.id === itemId);
            if (found) {
              let newArrivalTime = found.arrivalTime;
              if (found.departureTime && found.arrivalTime) {
                const [oldDH, oldDM] = found.departureTime.split(':').map(Number);
                const [oldAH, oldAM] = found.arrivalTime.split(':').map(Number);
                if (!isNaN(oldDH) && !isNaN(oldDM) && !isNaN(oldAH) && !isNaN(oldAM)) {
                  let durationMin = (oldAH * 60 + oldAM) - (oldDH * 60 + oldDM);
                  if (durationMin < 0) durationMin += 24 * 60;
                  const [newDH, newDM] = newTime.split(':').map(Number);
                  if (!isNaN(newDH) && !isNaN(newDM)) {
                    const totalArrivalMin = (newDH * 60 + newDM + durationMin) % (24 * 60);
                    const arrH = String(Math.floor(totalArrivalMin / 60)).padStart(2, '0');
                    const arrM = String(totalArrivalMin % 60).padStart(2, '0');
                    newArrivalTime = `${arrH}:${arrM}`;
                  }
                }
              }
              const newDate = shiftDateStr(found.date, dateDeltaDays);
              const newArrivalDate = shiftDateStr(found.arrivalDate, dateDeltaDays);
              const updated = {
                ...found,
                departureTime: newTime,
                arrivalTime: newArrivalTime,
                ...(newDate ? { date: newDate } : {}),
                ...(newArrivalDate ? { arrivalDate: newArrivalDate } : {}),
                updatedAt: Date.now()
              };
              await storageService.saveTransport(updated);
              setTransports(prev => prev.map(t => t.id === itemId ? updated : t));
            }
            if (activeCollision) {
              const rawA = activeCollision.itemA.originalData || activeCollision.itemA;
              const rawB = activeCollision.itemB.originalData || activeCollision.itemB;
              const intA = extractTimeInterval(rawA, 'trasporto');
              const intB = extractTimeInterval(rawB, 'trasporto');
              const sig = getPairSignature(intA.signature, intB.signature);
              persistCollisionDecision(activeCollision.itemA.id, activeCollision.itemB.id, 'resolved', sig, 'transport');
            }
          } finally {
            setActiveCollision(null);
          }
        }}
        onOpenEditForm={(item) => {
          const found = transports.find(t => t.id === item.id);
          if (found) setEditingTransport(found);
          setActiveCollision(null);
        }}
        onDismiss={() => {
          if (activeCollision) {
            const rawA = activeCollision.itemA.originalData || activeCollision.itemA;
            const rawB = activeCollision.itemB.originalData || activeCollision.itemB;
            const intA = extractTimeInterval(rawA, 'trasporto');
            const intB = extractTimeInterval(rawB, 'trasporto');
            const sig = getPairSignature(intA.signature, intB.signature);
            persistCollisionDecision(activeCollision.itemA.id, activeCollision.itemB.id, 'dismissed', sig, 'transport');
          }
          setActiveCollision(null);
        }}
      />
    </section>
  );
}
