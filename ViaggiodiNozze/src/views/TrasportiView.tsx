import { useState, useEffect } from 'react';
import type { Trasporto } from '../types';
import { storageService } from '../storage/storageService';
import TrasportoCard from '../components/cards/TrasportoCard';
import TrasportoForm from '../components/forms/TrasportoForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import SwipeToDelete from '../components/common/SwipeToDelete';
import { useDeviceRole } from '../utils/useDeviceRole';

import TimeCollisionModal, { type TimeCollision } from '../components/modals/TimeCollisionModal';
import type { TimelineItem } from '../types';
import DayPickerStrip from '../components/common/DayPickerStrip';
import { getTripDateRange, type TripDayItem } from '../utils/tripDates';

const detectCountry = (t: Trasporto): string => {
  const text = `${t.departureLocation || ''} ${t.arrivalLocation || ''} ${t.layover?.airport || ''} ${t.carrier || ''} ${t.noteCopilota || ''}`.toLowerCase();
  if (/(auckland|akl|chc|wellington|christchurch|picton|queenstown|rotorua|snap rentals|cook strait|sealink|nuova zelanda)/.test(text)) return '🇳🇿 Nuova Zelanda';
  if (/(syd|mel|adl|adelaide|kangaroo island|sydney|melbourne|virgin australia|jetstar|australia)/.test(text)) return '🇦🇺 Australia';
  if (/(mnl|mph|eni|usu|ceb|manila|boracay|el nido|tao coron|cebu|filippine|airswift|asia)/.test(text)) return '🇵🇭 Filippine';
  if (/(pek|pvg|roma|fco|mxp|malpensa|air china|china airlines|doha)/.test(text) || (t.type === 'volo' && (text.includes('milano') || text.includes('roma') || text.includes('intercontinentale')))) return '✈️ Intercontinentali';
  return '🌍 Altro';
};

type FilterType = 'tutti' | 'volo' | 'treno' | 'traghetto' | 'auto_camper' | 'transfer';
type CountryFilterType = 'tutti' | '🇳🇿 Nuova Zelanda' | '🇦🇺 Australia' | '🇵🇭 Filippine' | '✈️ Intercontinentali' | '🌍 Altro';

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

    const normalizeStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    const isSimilarTransport = (t1: Trasporto, t2: Trasporto) => {
      if (t1.bookingCode && t2.bookingCode && t1.bookingCode === t2.bookingCode && t1.type === 'volo' && t2.type === 'volo') {
        // Stesso PNR di volo con segmenti diversi non è una collisione
        if (t1.departureLocation !== t2.departureLocation || t1.arrivalLocation !== t2.arrivalLocation) {
          return false;
        }
      }
      const dep1 = normalizeStr(t1.departureLocation);
      const dep2 = normalizeStr(t2.departureLocation);
      const arr1 = normalizeStr(t1.arrivalLocation);
      const arr2 = normalizeStr(t2.arrivalLocation);

      if (dep1 && dep2 && arr1 && arr2) {
        if (dep1 === dep2 && arr1 === arr2) return true;
        if ((dep1.includes(dep2) || dep2.includes(dep1)) && (arr1.includes(arr2) || arr2.includes(arr1))) return true;
      }
      return false;
    };

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
      for (let j = i + 1; j < sorted.length; j++) {
        const tB = sorted[j];
        if (tA.date && tB.date && tA.date === tB.date) {
          const sameDepTime = (tA.departureTime && tB.departureTime && tA.departureTime === tB.departureTime);
          const similar = isSimilarTransport(tA, tB);

          if (sameDepTime || similar) {
            const collisionKey = `transport_collision_${tA.id}_${tB.id}`;
            const isDismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(collisionKey);
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

              nextCollision = {
                id: collisionKey,
                time: `${tA.date} alle ${tA.departureTime || 'Partenza'}`,
                itemA: toTimelineItem(tA),
                itemB: toTimelineItem(tB)
              };
              break;
            }
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
                      (activeFilter === 'traghetto' && t.type === 'traghetto') ||
                      (activeFilter === 'auto_camper' && (t.type === 'auto' || t.type === 'camper')) ||
                      (activeFilter === 'transfer' && t.type === 'transfer');
    
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
    traghetto: transports.filter((t) => t.type === 'traghetto').length,
    auto_camper: transports.filter((t) => t.type === 'auto' || t.type === 'camper').length,
    transfer: transports.filter((t) => t.type === 'transfer').length
  };

  const filterChips: { id: FilterType; label: string; icon: string; count: number }[] = [
    { id: 'tutti', label: 'Tutti', icon: '🌐', count: counts.tutti },
    { id: 'volo', label: 'Voli', icon: '✈️', count: counts.volo },
    { id: 'treno', label: 'Treni', icon: '🚆', count: counts.treno },
    { id: 'traghetto', label: 'Traghetti', icon: '🚢', count: counts.traghetto },
    { id: 'auto_camper', label: 'Noleggi & Auto', icon: '🚗', count: counts.auto_camper },
    { id: 'transfer', label: 'Transfer / Bus', icon: '🚐', count: counts.transfer }
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
        <div className="-mx-1 mb-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 px-1 scrollbar-none snap-x">
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
          </div>
        </div>
      )}

      {/* Chips Filter Horizontal Bar - Countries */}
      {transports.length > 0 && (
        <div className="-mx-1 mb-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 px-1 scrollbar-none snap-x">
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
          </div>
        </div>
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
                <div className="sticky top-0 z-10 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
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
                        <div className="grid gap-3">
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
          if (activeCollision && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(activeCollision.id, 'keep');
          }
          setActiveCollision(null);
        }}
        onDeleteItem={async (itemId) => {
          try {
            await storageService.deleteTransport(itemId);
            setTransports(prev => prev.filter(t => t.id !== itemId));
            if (activeCollision && typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(activeCollision.id, 'resolved');
            }
          } catch (e) {
            console.error('Errore durante eliminazione trasporto duplicato:', e);
          } finally {
            setActiveCollision(null);
          }
        }}
        onDismiss={() => {
          if (activeCollision && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(activeCollision.id, 'dismissed');
          }
          setActiveCollision(null);
        }}
      />
    </section>
  );
}
