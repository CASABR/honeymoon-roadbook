import { useState, useEffect, useCallback } from 'react';
import type { Giorno, Attivita, CategoriaAttivita } from '../types';
import { storageService } from '../storage/storageService';
import GiornoCard from '../components/cards/GiornoCard';
import AttivitaCard from '../components/cards/AttivitaCard';
import GiornoForm from '../components/forms/GiornoForm';
import AttivitaForm from '../components/forms/AttivitaForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import RouteBadge from '../components/common/RouteBadge';
import DayPickerStrip from '../components/common/DayPickerStrip';
import { getTripDateRange, type TripDayItem } from '../utils/tripDates';
import { useDeviceRole } from '../utils/useDeviceRole';

export default function AttivitaView() {
  const { canEdit } = useDeviceRole();
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [days, setDays] = useState<Giorno[]>([]);
  const [activities, setActivities] = useState<Attivita[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtro data: 'tutte' come DEFAULT oppure 'YYYY-MM-DD'
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');

  // Filtro categoria attività
  const [categoryFilter, setCategoryFilter] = useState<CategoriaAttivita | 'tutte'>('tutte');

  // Giorno selezionato per visualizzare/filtrare le attività
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  // Modali Form
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<Giorno | null>(null);

  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Attivita | null>(null);
  const [targetDayForActivity, setTargetDayForActivity] = useState<string | undefined>(undefined);

  // Dialog di Conferma Eliminazione
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'day' | 'activity';
    id: string;
    title: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [loadedDays, loadedActivities, range] = await Promise.all([
        storageService.getDays(),
        storageService.getActivities(),
        getTripDateRange()
      ]);
      setDays(loadedDays);
      setActivities(loadedActivities);
      setTripDays(range.tripDays);

      // Auto-selezione intelligente della data:
      const todayStr = new Date().toISOString().split('T')[0];
      const isInTrip = range.tripDays.some((d) => d.dateStr === todayStr);

      setSelectedDate((prev) => {
        if (prev !== 'tutte') return prev;
        if (isInTrip) return todayStr;
        return 'tutte';
      });

      setSelectedDayId((prev) => (prev ? prev : (loadedDays[0]?.id || null)));
    } catch (err) {
      console.error('Errore nel caricamento dei dati:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleDataMutated = () => {
      loadData();
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, [loadData]);

  // --- Handlers Giorno ---
  const handleOpenAddDay = () => {
    setEditingDay(null);
    setIsDayModalOpen(true);
  };

  const handleOpenEditDay = (day: Giorno) => {
    setEditingDay(day);
    setIsDayModalOpen(true);
  };

  const handleSaveDay = async (data: Omit<Giorno, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const dayToSave: Giorno = {
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'day_' + Date.now()),
      date: data.date,
      title: data.title,
      location: data.location,
      notes: data.notes,
      createdAt: editingDay?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveDay(dayToSave);
    setIsDayModalOpen(false);
    setEditingDay(null);
    await loadData();
    setSelectedDayId(dayToSave.id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'day') {
      await storageService.deleteDay(deleteTarget.id);
      if (selectedDayId === deleteTarget.id) {
        setSelectedDayId(null);
      }
    } else {
      await storageService.deleteActivity(deleteTarget.id);
    }
    setDeleteTarget(null);
    await loadData();
  };

  // --- Handlers Attività ---
  const handleOpenAddActivity = (dayId?: string) => {
    setTargetDayForActivity(dayId || selectedDayId || days[0]?.id);
    setEditingActivity(null);
    setIsActivityModalOpen(true);
  };

  const handleOpenEditActivity = (activity: Attivita) => {
    setEditingActivity(activity);
    setTargetDayForActivity(activity.dayId);
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

    const matchedDay = days.find(d => d.id === activityToSave.dayId);
    const targetDate = activityToSave.date || matchedDay?.date || (activityToSave.dayId.startsWith('day_') ? activityToSave.dayId.replace('day_', '') : null);

    if (matchedDay?.date) {
      setSelectedDate(matchedDay.date);
      setSelectedDayId(matchedDay.id);
    } else if (activityToSave.dayId.startsWith('day_')) {
      const freeDate = activityToSave.dayId.replace('day_', '');
      setSelectedDate(freeDate);
      setSelectedDayId(activityToSave.dayId);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('activity_updated', {
        detail: { activity: activityToSave, date: targetDate, dayId: activityToSave.dayId }
      }));
    }

    await loadData();
  };

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
            {days.length === 0
              ? 'Nessun giorno programmato'
              : days.length + ' ' + (days.length === 1 ? 'giorno' : 'giorni') + ' • ' + activities.length + ' attività'}
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => handleOpenAddActivity(days[0]?.id)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Attività</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAddDay}
              className="inline-flex items-center gap-1 min-h-[40px] px-3 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer shadow-sm"
              title="Aggiungi tappa/giorno specifico"
            >
              <span>+ Giorno</span>
            </button>
          </div>
        )}
      </header>

      {/* 1. Day Picker Orizzontale Fluido Data-Driven */}
      <DayPickerStrip
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        tripDays={tripDays.length > 0 ? tripDays : undefined}
        totalCount={activities.length}
        itemCounts={activities.reduce<Record<string, number>>((acc, a) => {
          const matchingDay = days.find(d => d.id === a.dayId);
          const actDate = a.date || matchingDay?.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : null);
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

      {/* Stato Vuoto se 0 Giorni */}
      {days.length === 0 ? (
        <EmptyState
          title="Nessuna attività inserita"
          description="Inizia aggiungendo il primo giorno dell'itinerario e le attività collegate."
          actionLabel="Aggiungi Primo Giorno"
          accentVariant="amber"
          onAction={handleOpenAddDay}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      ) : (() => {
        // Raccogli sia i giorni espliciti che le attività orfane di giorno rigido
        const filteredDays = days.filter(d => selectedDate === 'tutte' || d.date === selectedDate);
        
        // Attività che appartengono direttamente alla data selezionata (anche senza record Giorno esplicito nel DB)
        const orphanActivitiesForDate = selectedDate === 'tutte' 
          ? [] 
          : activities.filter(a => {
              const matchedDay = days.find(d => d.id === a.dayId);
              const actDate = a.date || matchedDay?.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : null);
              return actDate === selectedDate && !days.some(d => d.id === a.dayId);
            });

        if (filteredDays.length === 0 && orphanActivitiesForDate.length === 0) {
          // Giorno selezionato non ha ancora attività o giorni
          return (
            <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3">
              <span className="text-3xl">🗓️</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Nessun elemento programmato per questo giorno
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Non ci sono attività registrate per la data {selectedDate}.
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetDayForActivity(`day_${selectedDate}`);
                      setEditingActivity(null);
                      setIsActivityModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>+ Aggiungi Attività per questa Data</span>
                  </button>
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {/* Se ci sono attività associate direttamente alla data senza record Giorno formale */}
            {orphanActivitiesForDate.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200/70 inline-flex items-center gap-1.5">
                    <span>📅</span>
                    <span>Attività del {selectedDate}</span>
                  </h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetDayForActivity(`day_${selectedDate}`);
                        setEditingActivity(null);
                        setIsActivityModalOpen(true);
                      }}
                      className="text-xs font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                    >
                      + Aggiungi
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {orphanActivitiesForDate
                    .filter((a) => categoryFilter === 'tutte' || a.category === categoryFilter)
                    .map((activity, index) => {
                      const nextActivity = orphanActivitiesForDate[index + 1];
                      return (
                        <div key={activity.id} className="flex flex-col gap-2">
                          <AttivitaCard
                            activity={activity}
                            onEdit={() => handleOpenEditActivity(activity)}
                            onDelete={() =>
                              setDeleteTarget({
                                type: 'activity',
                                id: activity.id,
                                title: activity.title
                              })
                            }
                            onUpdate={loadData}
                          />
                          {nextActivity && activity.location && nextActivity.location && (
                            <div className="pl-6 py-0.5">
                              <RouteBadge 
                                from={activity.location} 
                                to={nextActivity.location} 
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            {filteredDays.map((day) => {
              const dayActivities = activities
                .filter((a) => a.dayId === day.id)
                .filter((a) => categoryFilter === 'tutte' || a.category === categoryFilter);
              const isSelected = selectedDate !== 'tutte' || selectedDayId === day.id;

            return (
              <div key={day.id} className="space-y-2.5">
                <GiornoCard
                  day={day}
                  activityCount={dayActivities.length}
                  isSelected={isSelected}
                  onSelect={() => setSelectedDayId(isSelected ? null : day.id)}
                  onEdit={() => handleOpenEditDay(day)}
                  onDelete={() =>
                    setDeleteTarget({
                      type: 'day',
                      id: day.id,
                      title: 'il ' + day.title + ' (e tutte le sue attività)'
                    })
                  }
                  onAddActivity={() => handleOpenAddActivity(day.id)}
                />

                {/* Lista Attività Collegate al Giorno */}
                {isSelected && (
                  <div className="pl-3 sm:pl-4 border-l-2 border-amber-500/40 space-y-2 mt-2">
                    {dayActivities.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-white border border-dashed border-slate-300 text-center shadow-sm">
                        <p className="text-xs text-slate-500 mb-2">
                          Nessuna attività programmata per questo giorno.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleOpenAddActivity(day.id)}
                          className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Inserisci prima attività</span>
                        </button>
                      </div>
                    ) : (
                      dayActivities.map((activity, index) => {
                        const nextActivity = dayActivities[index + 1];
                        return (
                          <div key={activity.id} className="flex flex-col gap-2">
                            <AttivitaCard
                              activity={activity}
                              onEdit={() => handleOpenEditActivity(activity)}
                              onDelete={() =>
                                setDeleteTarget({
                                  type: 'activity',
                                  id: activity.id,
                                  title: activity.title
                                })
                              }
                              onUpdate={loadData}
                            />
                            {nextActivity && activity.location && nextActivity.location && (
                              <div className="pl-6 py-0.5">
                                <RouteBadge 
                                  from={activity.location} 
                                  to={nextActivity.location} 
                                />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    })()}

      {/* Modale Giorno */}
      <Modal
        isOpen={isDayModalOpen}
        onClose={() => setIsDayModalOpen(false)}
        title={editingDay ? 'Modifica Giorno' : 'Nuovo Giorno'}
        accentVariant="amber"
      >
        <GiornoForm
          initialData={editingDay}
          onSave={handleSaveDay}
          onCancel={() => setIsDayModalOpen(false)}
        />
      </Modal>

      {/* Modale Attività */}
      <Modal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        title={editingActivity ? 'Modifica Attività' : 'Nuova Attività'}
        accentVariant="amber"
      >
        <AttivitaForm
          days={days}
          selectedDayId={targetDayForActivity}
          initialData={editingActivity}
          onSave={handleSaveActivity}
          onCancel={() => setIsActivityModalOpen(false)}
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
    </section>
  );
}
