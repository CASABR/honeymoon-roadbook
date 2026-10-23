import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Tappa } from '../../types';
import { storageService } from '../../storage/storageService';
import TappaForm from '../../components/forms/TappaForm';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import TimeCollisionModal, { type TimeCollision } from '../../components/modals/TimeCollisionModal';
import type { TimelineItem } from '../../types';

import DayPickerStrip from '../../components/common/DayPickerStrip';
import RouteBadge from '../../components/common/RouteBadge';
import SwipeToDelete from '../../components/common/SwipeToDelete';
import TappaCard from '../../components/cards/TappaCard';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { getTripDateRange, formatDate, type TripDayItem } from '../../utils/tripDates';

interface TappeViewProps {
  onBack?: () => void;
}

export default function TappeView({ onBack }: TappeViewProps) {
  const { canEdit } = useDeviceRole();
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [tappe, setTappe] = useState<Tappa[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [totalKm, setTotalKm] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Modali Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTappa, setEditingTappa] = useState<Tappa | null>(null);

  // Dialog eliminazione
  const [deleteTarget, setDeleteTarget] = useState<Tappa | null>(null);

  // Modale collisione / duplicati
  const [activeCollision, setActiveCollision] = useState<TimeCollision | null>(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout caricamento dati (1.5s)')), 1500)
      );

      const dataPromise = Promise.all([
        storageService.getTappe(),
        getTripDateRange()
      ]);

      const [loadedTappe, range] = await Promise.race([dataPromise, timeoutPromise]) as [Tappa[], any];

      setTappe(loadedTappe || []);
      if (range) setTripDays(range.tripDays);
      setSelectedDate('tutte');

      // Calcola i km complessivi salvati in cache in background senza bloccare il rendering della vista
      storageService.getAllRouteCaches().then(routes => {
        const kmSum = (routes || []).reduce((sum, r) => sum + (r.route?.distanceKm || 0), 0);
        setTotalKm(Math.round(kmSum * 10) / 10);
      }).catch(() => {});
    } catch (err) {
      console.error('Errore nel caricamento delle tappe:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const handleDataMutated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.entityType === 'tappa' && customEvent.detail?.entityId && customEvent.detail?.patch) {
        setTappe(prev => prev.map(t => t.id === customEvent.detail.entityId ? { ...t, ...customEvent.detail.patch } : t));
        return;
      }
      loadData(true);
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, [loadData]);

  // Rilevamento automatico di tappe duplicate/sovrapposte in ordine cronologico
  useEffect(() => {
    if (tappe.length < 2) {
      setActiveCollision(null);
      return;
    }

    const normalizeStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    const isSimilarTappa = (t1: Tappa, t2: Tappa) => {
      const n1 = normalizeStr(t1.titolo);
      const n2 = normalizeStr(t2.titolo);
      if (!n1 || !n2) return false;
      if (n1 === n2) return true;
      if (n1.length > 3 && n2.length > 3 && (n1.includes(n2) || n2.includes(n1))) return true;
      return false;
    };

    // Ordina cronologicamente
    const sorted = [...tappe].sort((a, b) => {
      const dateA = a.data || '';
      const dateB = b.data || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.orario || '00:00';
      const timeB = b.orario || '00:00';
      return timeA.localeCompare(timeB);
    });

    let nextCollision: TimeCollision | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const tA = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const tB = sorted[j];
        if (tA.data && tB.data && tA.data === tB.data) {
          const sameTime = (tA.orario && tB.orario && tA.orario === tB.orario);
          const similar = isSimilarTappa(tA, tB);

          if (sameTime || similar) {
            const collisionKey = `tappa_collision_${tA.id}_${tB.id}`;
            const isDismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(collisionKey);
            if (!isDismissed) {
              const toTimelineItem = (t: Tappa): TimelineItem => ({
                id: t.id,
                type: 'tappa',
                time: t.orario || 'Orario non specificato',
                title: t.titolo,
                location: t.indirizzo || 'Luogo non specificato',
                categoryOrType: t.sottocategoria || 'Tappa Itinerario',
                completed: t.completed,
                originalData: t
              });

              nextCollision = {
                id: collisionKey,
                time: `${tA.data}${tA.orario ? ' alle ' + tA.orario : ''}`,
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
  }, [tappe]);

  const handleOpenAdd = () => {
    setEditingTappa(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tappa: Tappa) => {
    setEditingTappa(tappa);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Omit<Tappa, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    if (data.id) {
      await storageService.updateTappa(data.id, data);
    } else {
      await storageService.addTappa(data);
    }
    setIsModalOpen(false);
    setEditingTappa(null);
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await storageService.deleteTappa(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  const filteredTappe = useMemo(() => {
    if (selectedDate === 'tutte') return tappe;
    return tappe.filter(t => t.data === selectedDate);
  }, [tappe, selectedDate]);

  const detectTappaCountry = (t: Tappa): string => {
    const text = `${t.titolo || ''} ${t.indirizzo || ''} ${t.nota || ''} ${t.noteCopilota || ''}`.toLowerCase();
    if (/(sydney|melbourne|kangaroo island|adelaide|cairns|brisbane|apollo bay|port campbell|grampians|phillip island|australia|\bau\b|tullamarine|lorne|torquay|jervis|gerringong|werri|nsw|huskisson)/.test(text)) return '🇦🇺 Australia';
    if (/(auckland|rotorua|queenstown|christchurch|wellington|lake tekapo|franz josef|punakaiki|kaikoura|coromandel|waitomo|nuova zelanda|\bnz\b|hobbiton|te puia|milford|haast)/.test(text)) return '🇳🇿 Nuova Zelanda';
    if (/(manila|coron|el nido|boracay|cebu|bohol|panglao|siargao|filippine|\bph\b)/.test(text)) return '🇵🇭 Filippine';
    if (/(italia|roma|milano|italy|\bit\b)/.test(text)) return '🇮🇹 Italia';
    return '🌍 Altro';
  };

  const macroOrder = ['🇮🇹 Italia', '🇳🇿 Nuova Zelanda', '🇦🇺 Australia', '🇵🇭 Filippine', '🌍 Altro'];

  const groupedTappeByCountry = useMemo(() => {
    const countryMap: Record<string, Record<string, Tappa[]>> = {};

    filteredTappe.forEach(t => {
      const c = detectTappaCountry(t);
      const d = t.data || 'Senza Data';
      if (!countryMap[c]) countryMap[c] = {};
      if (!countryMap[c][d]) countryMap[c][d] = [];
      countryMap[c][d].push(t);
    });

    const sortedCountries = Object.keys(countryMap).sort((a, b) => {
      const idxA = macroOrder.indexOf(a);
      const idxB = macroOrder.indexOf(b);
      return (idxA > -1 ? idxA : 99) - (idxB > -1 ? idxB : 99);
    });

    return sortedCountries.map(country => {
      const datesObj = countryMap[country];
      const sortedDates = Object.keys(datesObj).sort((a, b) => {
        if (a === 'Senza Data') return 1;
        if (b === 'Senza Data') return -1;
        return a.localeCompare(b);
      });
      return {
        country,
        dates: sortedDates.map(date => ({ date, items: datesObj[date] }))
      };
    });
  }, [filteredTappe]);

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-10">
      {/* Header */}
      <header className="flex items-center justify-between mb-5 px-1">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>📍</span> Tappe
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Punti di passaggio, soste foto e riferimenti
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>+ Nuova Tappa</span>
          </button>
        )}
      </header>

      {/* Selettore DayPickerStrip standardizzato a scorrimento orizzontale */}
      <DayPickerStrip
        days={tripDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        totalCount={tappe.length}
        itemCounts={tappe.reduce<Record<string, number>>((acc, t) => {
          if (t.data) {
            acc[t.data] = (acc[t.data] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* Totale km di guida previsti */}
      {totalKm > 0 && (
        <div className="mt-3 mb-2 px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-between text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-rose-600 text-white font-bold text-xs shadow-xs">🚗</span>
            <span className="font-medium text-slate-800">
              Totale stimato tappe: <strong className="font-bold text-rose-700">~{totalKm.toFixed(1)} km</strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">OpenRoute / HeiGIT</span>
        </div>
      )}

      {/* Contenuto principale */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[250px]">
          <div className="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTappe.length === 0 ? (
        selectedDate !== 'tutte' ? (
          <div className="p-8 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-center shadow-sm flex flex-col items-center justify-center gap-3">
            <span className="text-3xl">📍</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Nessun elemento programmato per questo giorno
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                Nessuna tappa di passaggio registrata per la data {selectedDate}.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Nuova Tappa per questa data</span>
              </button>
            )}
          </div>
        ) : (
          <EmptyState
            title="Nessuna tappa registrata"
            description="Aggiungi punti di passaggio, soste foto o stazioni di rifornimento lungo il tuo percorso."
            actionLabel={canEdit ? "+ Nuova Tappa" : undefined}
            accentVariant="rose"
            onAction={canEdit ? handleOpenAdd : undefined}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
        )
      ) : (
        <div className="space-y-8">
          {groupedTappeByCountry.map(({ country, dates }) => (
            <div key={country} className="space-y-4">
              <div className="sticky top-14 z-10 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs py-1.5 px-2 rounded-lg border-b border-slate-200/60 dark:border-slate-800/60 flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                  {country}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  ({dates.reduce((acc, d) => acc + d.items.length, 0)} {dates.reduce((acc, d) => acc + d.items.length, 0) === 1 ? 'tappa' : 'tappe'})
                </span>
              </div>

              <div className="space-y-6 pl-1 sm:pl-2">
                {dates.map(({ date, items: tappeGroup }) => (
                  <div key={date} className="space-y-3">
                    {selectedDate === 'tutte' && (
                      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                        {date === 'Senza Data' ? 'Senza Data' : `Data: ${formatDate(date)}`}
                      </h2>
                    )}

                    <div className="space-y-2.5">
                      {tappeGroup.map((tappa, idx) => {
                        const nextTappa = tappeGroup[idx + 1];

                        return (
                          <React.Fragment key={tappa.id}>
                            <SwipeToDelete disabled={!canEdit} onDelete={() => setDeleteTarget(tappa)}>
                              <TappaCard
                                tappa={tappa}
                                onEdit={() => handleOpenEdit(tappa)}
                                onDelete={() => setDeleteTarget(tappa)}
                              />
                            </SwipeToDelete>

                            {/* RouteBadge tra questa tappa e la successiva con percorso tratteggiato */}
                            {nextTappa && (
                              <div className="flex flex-col items-center justify-center my-0.5 relative">
                                <div className="w-0.5 h-3 border-l-2 border-dashed border-slate-300 dark:border-slate-700" />
                                <div className="flex items-center justify-center w-full px-4">
                                  <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800 hidden sm:block" />
                                  <RouteBadge
                                    routeId={`tappa_${tappa.id}_${nextTappa.id}`}
                                    from={tappa.titolo}
                                    to={nextTappa.titolo}
                                    fromCoord={tappa.coordinate}
                                    toCoord={nextTappa.coordinate}
                                    className="scale-95 shadow-xs mx-2"
                                  />
                                  <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800 hidden sm:block" />
                                </div>
                                <div className="w-0.5 h-3 border-l-2 border-dashed border-slate-300 dark:border-slate-700" />
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale Form Tappa */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTappa ? 'Modifica Tappa' : 'Nuova Tappa'}
        accentVariant="rose"
      >
        <TappaForm
          initialData={editingTappa}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Conferma eliminazione"
        message={`Sei sicuro di voler eliminare la tappa "${deleteTarget?.titolo || ''}"?`}
        confirmLabel="Elimina definitivamente"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Popup Comparativo Tappe Duplicate / Sovrapposte */}
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
            await storageService.deleteTappa(itemId);
            setTappe(prev => prev.filter(t => t.id !== itemId));
            if (activeCollision && typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(activeCollision.id, 'resolved');
            }
          } catch (e) {
            console.error('Errore durante eliminazione tappa duplicata:', e);
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
    </div>
  );
}
