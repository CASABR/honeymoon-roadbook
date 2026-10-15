import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Attivita, CategoriaAttivita } from '../types';
import { storageService } from '../storage/storageService';
import AttivitaForm from '../components/forms/AttivitaForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import RouteBadge from '../components/common/RouteBadge';
import DayPickerStrip from '../components/common/DayPickerStrip';
import SwipeToDelete from '../components/common/SwipeToDelete';
import { getTripDateRange, formatDate, type TripDayItem } from '../utils/tripDates';
import { useDeviceRole } from '../utils/useDeviceRole';
import AttivitaCard from '../components/cards/AttivitaCard';
import TimeCollisionModal, { type TimeCollision } from '../components/modals/TimeCollisionModal';
import type { TimelineItem } from '../types';

export default function AttivitaView() {
  const { canEdit } = useDeviceRole();
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [activities, setActivities] = useState<Attivita[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtro data: 'tutte' come DEFAULT oppure 'YYYY-MM-DD'
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');

  // Filtro categoria attività
  const [categoryFilter, setCategoryFilter] = useState<CategoriaAttivita | 'tutte'>('tutte');

  // Modale Form
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Attivita | null>(null);
  const [targetDayForActivity, setTargetDayForActivity] = useState<string | undefined>(undefined);

  // Dialog di Conferma Eliminazione
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Modale Popup Comparativo per attività uguali/simili
  const [activeCollision, setActiveCollision] = useState<TimeCollision | null>(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout caricamento dati (1.5s)')), 1500)
      );

      const dataPromise = Promise.all([
        storageService.getActivities(),
        getTripDateRange()
      ]);

      const [loadedActivities, range] = await Promise.race([dataPromise, timeoutPromise]) as [Attivita[], any];

      setActivities(loadedActivities || []);
      if (range) setTripDays(range.tripDays);

      // Manteniamo la data selezionata se ancora valida, altrimenti 'tutte'
      setSelectedDate(prev => prev);
    } catch (err) {
      console.error('Errore nel caricamento dei dati in AttivitaView:', err);
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
      if (customEvent.detail?.entityType === 'attivita' && customEvent.detail?.action === 'update' && customEvent.detail?.data) {
        const updated = customEvent.detail.data as Attivita;
        setActivities(prev => prev.map(item => item.id === updated.id ? updated : item));
        return;
      }
      loadData(true);
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, [loadData]);

  // Rilevamento automatico di tutte le attività uguali/simili (stesso giorno, stesso orario o nome simile) in ordine cronologico
  useEffect(() => {
    if (activities.length < 2) {
      setActiveCollision(null);
      return;
    }

    // Normalizzazione stringa per confronto somiglianza nome
    const normalizeStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    const isSimilarTitle = (t1?: string, t2?: string) => {
      const n1 = normalizeStr(t1);
      const n2 = normalizeStr(t2);
      if (!n1 || !n2) return false;
      if (n1 === n2) return true;
      if (n1.includes(n2) || n2.includes(n1)) return true;
      // Confronto per parole chiave significative
      const words1 = n1.split(' ').filter(w => w.length > 2);
      const words2 = n2.split(' ').filter(w => w.length > 2);
      if (words1.length > 0 && words2.length > 0) {
        const common = words1.filter(w => words2.includes(w));
        if (common.length >= Math.min(words1.length, words2.length, 2)) return true;
      }
      return false;
    };

    // Ordina tutte le attività in ordine cronologico rigoroso (data + orario)
    const sorted = [...activities].sort((a, b) => {
      const dateA = a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : '');
      const dateB = b.date || (b.dayId.startsWith('day_') ? b.dayId.replace('day_', '') : '');
      const isoA = ((dateA || '').split('-').length === 3 && (dateA || '').split('-')[0].length === 2 ? (dateA || '').split('-').reverse().join('-') : (dateA || ''));
      const isoB = ((dateB || '').split('-').length === 3 && (dateB || '').split('-')[0].length === 2 ? (dateB || '').split('-').reverse().join('-') : (dateB || ''));
      if (isoA !== isoB) return isoA.localeCompare(isoB);
      const timeA = a.time || '23:59';
      const timeB = b.time || '23:59';
      return timeA.localeCompare(timeB);
    });

    let nextCollision: TimeCollision | null = null;

    // Scansiona a coppie in ordine cronologico
    for (let i = 0; i < sorted.length; i++) {
      const actA = sorted[i];
      const dateA = actA.date || (actA.dayId.startsWith('day_') ? actA.dayId.replace('day_', '') : '');
      const timeA = actA.time || '23:59';

      for (let j = i + 1; j < sorted.length; j++) {
        const actB = sorted[j];
        const dateB = actB.date || (actB.dayId.startsWith('day_') ? actB.dayId.replace('day_', '') : '');
        const timeB = actB.time || '23:59';

        // Solo se stesso giorno
        if (dateA && dateB && dateA === dateB) {
          const sameTime = (timeA !== '23:59' && timeA === timeB);
          const similar = isSimilarTitle(actA.title, actB.title);

          // Criterio utente: uguali/simili = stesso giorno AND (stesso orario OR nome simile)
          if (sameTime || similar) {
            const collisionKey = `activity_collision_${actA.id}_${actB.id}`;
            const isDismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(collisionKey);

            if (!isDismissed) {
              const toTimelineItem = (act: Attivita): TimelineItem => ({
                id: act.id,
                type: 'attivita',
                time: act.time || '23:59',
                title: act.title,
                location: act.location || act.address || 'Attività',
                categoryOrType: act.category || 'Attività',
                completed: act.completed,
                originalData: act
              });

              nextCollision = {
                id: collisionKey,
                time: `${dateA} alle ${actA.time || 'Orario non specificato'}`,
                itemA: toTimelineItem(actA),
                itemB: toTimelineItem(actB)
              };
              break;
            }
          }
        }
      }
      if (nextCollision) break;
    }

    setActiveCollision(nextCollision);
  }, [activities]);


  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await storageService.deleteActivity(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  // --- Handlers Attività ---
  const handleDeleteActivityFromForm = async () => {
    if (!editingActivity) return;
    await storageService.deleteActivity(editingActivity.id);
    setIsActivityModalOpen(false);
    setEditingActivity(null);
    await loadData();
  };


  const handleOpenAddActivity = (date?: string) => {
    setTargetDayForActivity(date ? `day_${date}` : (selectedDate !== 'tutte' ? `day_${selectedDate}` : undefined));
    setEditingActivity(null);
    setIsActivityModalOpen(true);
  };

  const handleOpenEditActivity = (activity: Attivita) => {
    setEditingActivity(activity);
    setTargetDayForActivity(activity.dayId || (activity.date ? `day_${activity.date}` : undefined));
    setIsActivityModalOpen(true);
  };

  const handleSaveActivity = async (data: Omit<Attivita, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const activityToSave: Attivita = {
      ...data,
      id: data.id || editingActivity?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act_' + Date.now()),
      createdAt: editingActivity?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveActivity(activityToSave);
    setIsActivityModalOpen(false);
    setEditingActivity(null);

    const targetDate = activityToSave.date || (activityToSave.dayId.startsWith('day_') ? activityToSave.dayId.replace('day_', '') : null);

    if (targetDate) {
      setSelectedDate(targetDate);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('activity_updated', {
        detail: { activity: activityToSave, date: targetDate, dayId: activityToSave.dayId }
      }));
    }

    await loadData();
  };

  const filteredActivities = useMemo(() => {
    let filtered = activities;
    
    // Filter by category
    if (categoryFilter !== 'tutte') {
      filtered = filtered.filter(a => a.category === categoryFilter);
    }
    
    // Filter by date
    if (selectedDate !== 'tutte') {
      filtered = filtered.filter(a => {
        const d = a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : null);
        return d === selectedDate;
      });
    }
    
    return filtered.sort((a, b) => {
      const dateA = a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : '');
      const dateB = b.date || (b.dayId.startsWith('day_') ? b.dayId.replace('day_', '') : '');
      const isoA = ((dateA || '').split('-').length === 3 && (dateA || '').split('-')[0].length === 2 ? (dateA || '').split('-').reverse().join('-') : (dateA || ''));
      const isoB = ((dateB || '').split('-').length === 3 && (dateB || '').split('-')[0].length === 2 ? (dateB || '').split('-').reverse().join('-') : (dateB || ''));
      if (isoA !== isoB) return isoA.localeCompare(isoB);
      
      const timeA = a.time || '23:59';
      const timeB = b.time || '23:59';
      return timeA.localeCompare(timeB);
    });
  }, [activities, categoryFilter, selectedDate]);

  const detectActCountry = (act: Attivita): string => {
    const text = `${act.title || ''} ${act.location || ''} ${act.notes || ''} ${act.noteCopilota || ''}`.toLowerCase();
    if (/(auckland|rotorua|queenstown|christchurch|wellington|lake tekapo|franz josef|punakaiki|kaikoura|coromandel|waitomo|nuova zelanda|nz|hobbiton|te puia|milford)/.test(text)) return '🇳🇿 Nuova Zelanda';
    if (/(sydney|melbourne|kangaroo island|adelaide|cairns|brisbane|apollo bay|port campbell|grampians|phillip island|australia|au|bondi|manly|great ocean)/.test(text)) return '🇦🇺 Australia';
    if (/(manila|coron|el nido|boracay|cebu|bohol|panglao|siargao|filippine|ph|underground river)/.test(text)) return '🇵🇭 Filippine';
    if (/(italia|roma|milano|italy)/.test(text)) return '🇮🇹 Italia';
    return '🌍 Altro';
  };

  const groupedActivitiesByCountry = useMemo(() => {
    const macroOrder = ['🇳🇿 Nuova Zelanda', '🇦🇺 Australia', '🇵🇭 Filippine', '🇮🇹 Italia', '🌍 Altro'];
    const countryMap: Record<string, Record<string, Attivita[]>> = {};

    filteredActivities.forEach(a => {
      const c = detectActCountry(a);
      const d = a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : 'Data non specificata');
      if (!countryMap[c]) countryMap[c] = {};
      if (!countryMap[c][d]) countryMap[c][d] = [];
      countryMap[c][d].push(a);
    });

    const sortedCountries = Object.keys(countryMap).sort((a, b) => {
      const idxA = macroOrder.indexOf(a);
      const idxB = macroOrder.indexOf(b);
      return (idxA > -1 ? idxA : 99) - (idxB > -1 ? idxB : 99);
    });

    return sortedCountries.map(country => {
      const datesObj = countryMap[country];
      const sortedDates = Object.keys(datesObj).sort((a, b) => {
        const isoA = ((a || '').split('-').length === 3 && (a || '').split('-')[0].length === 2 ? (a || '').split('-').reverse().join('-') : (a || ''));
        const isoB = ((b || '').split('-').length === 3 && (b || '').split('-')[0].length === 2 ? (b || '').split('-').reverse().join('-') : (b || ''));
        return isoA.localeCompare(isoB);
      });
      return {
        country,
        dates: sortedDates.map(date => ({ date, items: datesObj[date] }))
      };
    });
  }, [filteredActivities]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <section className="flex flex-col flex-1 pb-10">
      {/* Header Sezione */}
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Attività
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {activities.length} attività in programma
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => handleOpenAddActivity()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-sm rounded-2xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
              </svg>
              <span>Nuova Attività</span>
            </button>
          </div>
        )}
      </header>

      {/* 1. Day Picker Orizzontale Fluido Data-Driven */}
      <DayPickerStrip
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        tripDays={tripDays}
        days={tripDays as any}
        totalCount={activities.length}
        itemCounts={activities.reduce<Record<string, number>>((acc, a) => {
          const actDate = a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : null);
          if (actDate) {
            acc[actDate] = (acc[actDate] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* 2. Filtro Categoria — chips scrollabili */}
      {activities.length > 0 && (
        <div className="-mx-1 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-none snap-x">
            {([
              { id: 'tutte', label: 'Tutte', count: activities.length },
              { id: 'visita', label: 'Visite', count: activities.filter(a => a.category === 'visita').length },
              { id: 'cibo', label: 'Cibo', count: activities.filter(a => a.category === 'cibo').length },
              { id: 'relax', label: 'Relax', count: activities.filter(a => a.category === 'relax').length },
              { id: 'natura', label: 'Natura', count: activities.filter(a => a.category === 'natura').length },
              { id: 'cultura', label: 'Cultura', count: activities.filter(a => a.category === 'cultura').length },
              { id: 'shopping', label: 'Shopping', count: activities.filter(a => a.category === 'shopping').length },
              { id: 'altro', label: 'Altro', count: activities.filter(a => a.category === 'altro').length },
            ] as { id: CategoriaAttivita | 'tutte'; label: string; count: number }[]).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setCategoryFilter(chip.id)}
                className={
                  'snap-start shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ' +
                  (categoryFilter === chip.id
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:text-slate-900 hover:bg-slate-50')
                }
              >
                <span>{chip.label}</span>
                {chip.count > 0 && (
                  <span className={
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full ' +
                    (categoryFilter === chip.id ? 'bg-slate-950/20 text-slate-900' : 'bg-slate-100 text-slate-600')
                  }>{chip.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Elenco Attività (Puro Card-First) */}
      {activities.length === 0 ? (
        <div className="flex flex-col gap-4">
          <EmptyState
            title="Nessuna attività inserita"
            description="Inizia ad aggiungere le attività che farai durante il viaggio (musei, escursioni, cene)."
            actionLabel="Aggiungi Attività"
            accentVariant="amber"
            onAction={() => handleOpenAddActivity()}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            }
          />
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3 mt-4">
          <span className="text-3xl">🗓️</span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Nessuna attività
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Non ci sono attività corrispondenti ai filtri attivi.
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => handleOpenAddActivity(selectedDate !== 'tutte' ? selectedDate : undefined)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Aggiungi per questa Data</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8 mt-2">
          {groupedActivitiesByCountry.map(({ country, dates }) => (
            <div key={country} className="space-y-4">
              <div className="sticky top-0 z-10 py-1.5 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  {country}
                </h2>
                <span className="text-[11px] font-bold text-slate-400">
                  {dates.reduce((acc, d) => acc + d.items.length, 0)} attività
                </span>
              </div>

              <div className="space-y-5">
                {dates.map(group => (
                  <div key={group.date} className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1 border-b border-slate-200/60 pb-1">
                      {group.date === 'Data non specificata' ? group.date : formatDate(group.date)}
                    </h3>
                    <div className="space-y-2">
                      {group.items.map((activity, index) => {
                        const nextActivity = group.items[index + 1];
                        return (
                          <div key={activity.id} className="flex flex-col gap-2">
                            <SwipeToDelete
                              key={activity.id}
                              disabled={!canEdit}
                              onDelete={() => setDeleteTarget({ id: activity.id, title: activity.title })}
                            >
                              <AttivitaCard 
                                activity={activity} 
                                onEdit={() => handleOpenEditActivity(activity)}
                                onDelete={() => setDeleteTarget({ id: activity.id, title: activity.title })}
                                onUpdate={() => loadData()}
                              />
                            </SwipeToDelete>
                            {nextActivity && activity.location && nextActivity.location && (
                              <div className="flex flex-col items-center justify-center my-0.5 relative">
                                <div className="w-0.5 h-3 border-l-2 border-dashed border-slate-300 dark:border-slate-700" />
                                <div className="flex items-center justify-center w-full px-4">
                                  <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800 hidden sm:block" />
                                  <RouteBadge 
                                    routeId={`act_${activity.id}_${nextActivity.id}`}
                                    from={activity.location} 
                                    to={nextActivity.location} 
                                    className="scale-95 shadow-xs mx-2"
                                  />
                                  <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800 hidden sm:block" />
                                </div>
                                <div className="w-0.5 h-3 border-l-2 border-dashed border-slate-300 dark:border-slate-700" />
                              </div>
                            )}
                          </div>
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

      {/* Modale Attività */}
      <Modal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        title={editingActivity ? 'Modifica Attività' : 'Nuova Attività'}
        accentVariant="amber"
      >
        <AttivitaForm
          days={[]}
          selectedDayId={targetDayForActivity}
          initialData={editingActivity}
          onSave={handleSaveActivity}
          onCancel={() => setIsActivityModalOpen(false)}
          onDelete={handleDeleteActivityFromForm}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Conferma eliminazione"
        message={"Sei sicuro di voler eliminare definitivamente " + (deleteTarget?.title || '') + "? L'azione non può essere annullata."}
        confirmLabel="Elimina definitivamente"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Popup Comparativo per Attività Uguali / Sovrapposte (uno alla volta in ordine cronologico) */}
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
            await storageService.deleteActivity(itemId);
            setActivities(prev => prev.filter(a => a.id !== itemId));
            if (activeCollision && typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(activeCollision.id, 'resolved');
            }
          } catch (e) {
            console.error('Errore durante eliminazione attività duplicata:', e);
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
