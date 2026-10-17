import { useState, useEffect, useRef } from 'react';
import type { Alloggio, TimelineItem } from '../types';
import { storageService } from '../storage/storageService';
import AlloggioForm from '../components/forms/AlloggioForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import DayPickerStrip from '../components/common/DayPickerStrip';
import SwipeToDelete from '../components/common/SwipeToDelete';
import AlloggioCard from '../components/cards/AlloggioCard';
import TimeCollisionModal, { type TimeCollision } from '../components/modals/TimeCollisionModal';
import { useDeviceRole } from '../utils/useDeviceRole';
import { getTripDateRange, formatDate, type TripDayItem } from '../utils/tripDates';

import DesktopEconomySummary from '../components/common/DesktopEconomySummary';

export default function AlloggiView() {
  const { canEdit } = useDeviceRole();
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccommodation, setEditingAccommodation] = useState<Alloggio | null>(null);
  const [deletingAccommodation, setDeletingAccommodation] = useState<Alloggio | null>(null);
  const [activeCollision, setActiveCollision] = useState<TimeCollision | null>(null);

  // Mantiene il riferimento per non resettare o far saltare lo scroll container
  const isInitialLoad = useRef(true);

  const loadData = async (silent = false) => {
    try {
      if (!silent && isInitialLoad.current) {
        setLoading(true);
      }

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout caricamento dati (1.5s)')), 1500)
      );

      const dataPromise = Promise.all([
        storageService.getAccommodations(),
        getTripDateRange()
      ]);

      const [items, range] = await Promise.race([dataPromise, timeoutPromise]) as [Alloggio[], any];

      setAccommodations(items || []);
      if (range) setTripDays(range.tripDays);
      isInitialLoad.current = false;
    } catch (err) {
      console.error('Errore caricamento alloggi:', err);
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
      // Se l'evento proviene già da un aggiornamento locale alloggi, non ricaricare tutto da zero
      if (customEvent.detail?.entityType === 'alloggi' && customEvent.detail?.action === 'update' && customEvent.detail?.data) {
        const updated = customEvent.detail.data as Alloggio;
        setAccommodations(prev => prev.map(item => item.id === updated.id ? updated : item));
        return;
      }
      loadData(true);
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, []);

  // Rilevamento automatico sovrapposizioni / più hotel per la stessa notte
  useEffect(() => {
    if (accommodations.length < 2) {
      setActiveCollision(null);
      return;
    }

    // Costruisce la mappa delle date per verificare se 2 hotel coprono la stessa notte
    // Per un hotel con checkIn: 2026-10-20 e checkOut: 2026-10-22, le notti sono 2026-10-20 e 2026-10-21
    const getHotelNights = (acc: Alloggio): string[] => {
      if (!acc.checkIn) return [];
      if (!acc.checkOut || acc.checkIn === acc.checkOut) return [acc.checkIn];
      const nights: string[] = [];
      try {
        const cur = new Date(acc.checkIn);
        const end = new Date(acc.checkOut);
        while (cur < end) {
          nights.push(cur.toISOString().split('T')[0]);
          cur.setDate(cur.getDate() + 1);
        }
      } catch {
        nights.push(acc.checkIn);
      }
      return nights.length > 0 ? nights : [acc.checkIn];
    };

    const nightMap: Record<string, Alloggio[]> = {};
    for (const acc of accommodations) {
      const nights = getHotelNights(acc);
      for (const night of nights) {
        if (!nightMap[night]) nightMap[night] = [];
        nightMap[night].push(acc);
      }
    }

    let foundCollision: TimeCollision | null = null;
    for (const [nightStr, list] of Object.entries(nightMap)) {
      if (list.length > 1) {
        const first = list[0];
        const second = list[1];
        if (first.id === second.id) continue;

        const collisionKey = `hotel_collision_${first.id}_${second.id}_${nightStr}`;
        const isDismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(collisionKey);
        if (!isDismissed) {
          const toTimelineItem = (acc: Alloggio): TimelineItem => ({
            id: acc.id,
            type: 'alloggio',
            time: acc.checkInTime || '15:00',
            title: acc.name,
            location: acc.location || acc.address || 'Alloggio',
            categoryOrType: 'Alloggio',
            completed: acc.completed,
            originalData: acc
          });

          foundCollision = {
            id: collisionKey,
            time: `Notte del ${nightStr}`,
            itemA: toTimelineItem(first),
            itemB: toTimelineItem(second)
          };
          break;
        }
      }
    }

    setActiveCollision(foundCollision);
  }, [accommodations]);

  const handleOpenAdd = () => {
    setEditingAccommodation(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (acc: Alloggio) => {
    setEditingAccommodation(acc);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Omit<Alloggio, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const accToSave: Alloggio = {
      ...data,
      id: data.id || editingAccommodation?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'acc_' + Date.now()),
      createdAt: editingAccommodation?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveAccommodation(accToSave);
    setIsModalOpen(false);
    setEditingAccommodation(null);
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deletingAccommodation) return;
    await storageService.deleteAccommodation(deletingAccommodation.id);
    setDeletingAccommodation(null);
    await loadData();
  };

  const handleDeleteFromForm = async () => {
    if (!editingAccommodation) return;
    await storageService.deleteAccommodation(editingAccommodation.id);
    setIsModalOpen(false);
    setEditingAccommodation(null);
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <section className="flex flex-col flex-1 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Alloggi
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {accommodations.length === 0
              ? 'Nessuna struttura inserita'
              : accommodations.length + ' ' + (accommodations.length === 1 ? 'struttura registrata' : 'strutture registrate')}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Aggiungi Alloggio</span>
          </button>
        )}
      </header>

      {/* Riepilogo Economico Solo Desktop */}
      <DesktopEconomySummary items={accommodations} categoryName="Alloggi" accentColor="indigo" />

      {/* Selettore DayPickerStrip a scorrimento orizzontale */}
      <DayPickerStrip
        days={tripDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        totalCount={accommodations.length}
        itemCounts={accommodations.reduce<Record<string, number>>((acc, a) => {
          if (a.checkIn) {
            acc[a.checkIn] = (acc[a.checkIn] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* Banner di avviso se ci sono più hotel per la stessa notte */}
      {(() => {
        // Verifica se ci sono hotel sovrapposti
        const getHotelNights = (acc: Alloggio): string[] => {
          if (!acc.checkIn) return [];
          if (!acc.checkOut || acc.checkIn === acc.checkOut) return [acc.checkIn];
          const nights: string[] = [];
          try {
            const cur = new Date(acc.checkIn);
            const end = new Date(acc.checkOut);
            while (cur < end) {
              nights.push(cur.toISOString().split('T')[0]);
              cur.setDate(cur.getDate() + 1);
            }
          } catch {
            nights.push(acc.checkIn);
          }
          return nights.length > 0 ? nights : [acc.checkIn];
        };

        const nightMap: Record<string, Alloggio[]> = {};
        for (const acc of accommodations) {
          const nights = getHotelNights(acc);
          for (const night of nights) {
            if (!nightMap[night]) nightMap[night] = [];
            nightMap[night].push(acc);
          }
        }

        const collidingNights = Object.entries(nightMap).filter(([_, list]) => list.length > 1);
        if (collidingNights.length === 0) return null;

        const [sampleNight, sampleList] = collidingNights[0];

        return (
          <div className="mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800/60 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl shrink-0">⚠️</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200 truncate">
                  Più hotel registrati per la notte del {sampleNight}
                </div>
                <div className="text-[11px] text-amber-700/90 dark:text-amber-400/90 truncate">
                  {sampleList.map(h => h.name).join(' vs ')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const toTimelineItem = (acc: Alloggio): TimelineItem => ({
                  id: acc.id,
                  type: 'alloggio',
                  time: acc.checkInTime || '15:00',
                  title: acc.name,
                  location: acc.location || acc.address || 'Alloggio',
                  categoryOrType: 'Alloggio',
                  completed: acc.completed,
                  originalData: acc
                });
                setActiveCollision({
                  id: `hotel_collision_${sampleList[0].id}_${sampleList[1].id}_${sampleNight}`,
                  time: `Notte del ${sampleNight}`,
                  itemA: toTimelineItem(sampleList[0]),
                  itemB: toTimelineItem(sampleList[1])
                });
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-sm transition-all"
            >
              Confronta
            </button>
          </div>
        );
      })()}

      {/* Empty State Globale */}
      {accommodations.length === 0 ? (
        <EmptyState
          title="Nessun alloggio inserito"
          description="Aggiungi hotel, ryokan, appartamenti o strutture del tuo viaggio."
          actionLabel={canEdit ? "Aggiungi Primo Alloggio" : undefined}
          accentVariant="purple"
          onAction={canEdit ? handleOpenAdd : undefined}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6" />
            </svg>
          }
        />
      ) : (() => {
        const filteredAccommodations = accommodations.filter((acc) => {
          if (selectedDate === 'tutte') return true;
          // Mostra se la data selezionata cade tra checkIn (incluso) e checkOut (escluso/incluso per soggiorno)
          if (acc.checkIn && acc.checkOut) {
            return selectedDate >= acc.checkIn && selectedDate <= acc.checkOut;
          }
          return acc.checkIn === selectedDate;
        });

        if (filteredAccommodations.length === 0) {
          return (
            <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3">
              <span className="text-3xl">🏨</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Nessun elemento programmato per questo giorno
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Nessun alloggio o pernottamento registrato per la data {selectedDate}.
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>+ Aggiungi Alloggio per questa data</span>
                </button>
              )}
            </div>
          );
        }

        // Raggruppamento per Paese -> Data quando è selezionato 'tutte'
        const detectAccCountry = (acc: Alloggio): string => {
          const text = `${acc.name || ''} ${acc.address || ''} ${acc.location || ''} ${acc.noteCopilota || ''} ${acc.notes || ''}`.toLowerCase();
          if (/(sydney|melbourne|kangaroo island|adelaide|cairns|brisbane|apollo bay|port campbell|grampians|phillip island|australia|\bau\b|gerringong|werri|jervis|nsw|huskisson|blue mountains)/.test(text)) return '🇦🇺 Australia';
          if (/(auckland|rotorua|queenstown|christchurch|wellington|lake tekapo|franz josef|punakaiki|kaikoura|coromandel|waitomo|nuova zelanda|\bnz\b|hobbiton|te puia|milford)/.test(text)) return '🇳🇿 Nuova Zelanda';
          if (/(manila|coron|el nido|boracay|cebu|bohol|panglao|siargao|filippine|\bph\b)/.test(text)) return '🇵🇭 Filippine';
          if (/(italia|roma|milano|italy|\bit\b)/.test(text)) return '🇮🇹 Italia';
          return '🌍 Altro';
        };

        const macroOrder = ['🇮🇹 Italia', '🇳🇿 Nuova Zelanda', '🇦🇺 Australia', '🇵🇭 Filippine', '🌍 Altro'];

        // Raggruppa per Paese -> poi per Giorno
        const groupedByCountry = filteredAccommodations.reduce<Record<string, Record<string, Alloggio[]>>>((accMap, item) => {
          const country = detectAccCountry(item);
          const dateKey = item.checkIn || 'Senza Data';
          if (!accMap[country]) accMap[country] = {};
          if (!accMap[country][dateKey]) accMap[country][dateKey] = [];
          accMap[country][dateKey].push(item);
          return accMap;
        }, {});

        const sortedCountries = Object.keys(groupedByCountry).sort((a, b) => {
          const idxA = macroOrder.indexOf(a);
          const idxB = macroOrder.indexOf(b);
          return (idxA > -1 ? idxA : 99) - (idxB > -1 ? idxB : 99);
        });

        return (
          <div className="space-y-8">
            {sortedCountries.map((country) => {
              const datesObj = groupedByCountry[country];
              const sortedDates = Object.keys(datesObj).sort((a, b) => {
                if (a === 'Senza Data') return 1;
                if (b === 'Senza Data') return -1;
                return a.localeCompare(b);
              });

              const totalInCountry = sortedDates.reduce((sum, d) => sum + datesObj[d].length, 0);

              return (
                <div key={country} className="space-y-4">
                  <div className="sticky top-0 z-10 py-1.5 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      {country}
                    </h2>
                    <span className="text-[11px] font-bold text-slate-400">
                      {totalInCountry} {totalInCountry === 1 ? 'struttura' : 'strutture'}
                    </span>
                  </div>

                  <div className="space-y-6 pl-1 sm:pl-2">
                    {sortedDates.map((dateKey) => (
                      <div key={dateKey} className="space-y-3">
                        {selectedDate === 'tutte' && (
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                            {dateKey === 'Senza Data' ? 'Senza Data Check-in' : `Check-in: ${formatDate(dateKey)}`}
                          </h3>
                        )}

                        <div className="space-y-3">
                          {datesObj[dateKey].map((acc) => (
                            <SwipeToDelete key={acc.id} disabled={!canEdit} onDelete={() => setDeletingAccommodation(acc)}>
                              <AlloggioCard
                                accommodation={acc}
                                onEdit={() => handleOpenEdit(acc)}
                                onDelete={() => setDeletingAccommodation(acc)}
                                onUpdate={(updated) => {
                                  setAccommodations(prev => prev.map(item => item.id === updated.id ? updated : item));
                                }}
                              />
                            </SwipeToDelete>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Rilevamento Sovrapposizione Alloggi per la stessa notte */}
      {(() => {
        return null;
      })()}

      {/* Modal Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAccommodation ? 'Modifica Alloggio' : 'Nuovo Alloggio'}
        accentVariant="purple"
      >
        <AlloggioForm
          initialData={editingAccommodation}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
          onDelete={handleDeleteFromForm}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deletingAccommodation)}
        title="Elimina alloggio"
        message={"Sei sicuro di voler eliminare la struttura " + (deletingAccommodation?.name || '') + "? I dati inseriti verranno rimossi."}
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingAccommodation(null)}
      />

      {/* Popup Comparativo Sovrapposizione Alloggi */}
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
            await storageService.deleteAccommodation(itemId);
            setAccommodations(prev => prev.filter(a => a.id !== itemId));
            if (activeCollision && typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(activeCollision.id, 'resolved');
            }
          } catch (e) {
            console.error('Errore eliminazione alloggio sovrapposto:', e);
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
