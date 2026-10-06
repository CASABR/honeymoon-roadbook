import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Attivita, CategoriaAttivita } from '../types';
import { storageService } from '../storage/storageService';
import AttivitaForm from '../components/forms/AttivitaForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { getTripConfig } from '../utils/tripConfig';
import RouteBadge from '../components/common/RouteBadge';
import DayPickerStrip from '../components/common/DayPickerStrip';
import SwipeToDelete from '../components/common/SwipeToDelete';
import { getTripDateRange, type TripDayItem } from '../utils/tripDates';
import { useDeviceRole } from '../utils/useDeviceRole';
import AttivitaCard from '../components/cards/AttivitaCard';

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

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
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      
      const timeA = a.time || '23:59';
      const timeB = b.time || '23:59';
      return timeA.localeCompare(timeB);
    });
  }, [activities, categoryFilter, selectedDate]);

  const groupedActivities = useMemo(() => {
    const groups: Record<string, Attivita[]> = {};
    filteredActivities.forEach(a => {
      const d = a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : 'Data non specificata');
      if (!groups[d]) groups[d] = [];
      groups[d].push(a);
    });
    // Sort keys
    const sortedKeys = Object.keys(groups).sort();
    return sortedKeys.map(k => ({ date: k, items: groups[k] }));
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
          {canEdit && getTripConfig()?.id === '0000' && (
            <button
              onClick={async () => {
                await storageService.seedRealActivities();
                alert('Attività caricate con successo!');
                await loadData();
              }}
              className="mx-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-2xl border border-indigo-200 transition-colors shadow-sm cursor-pointer active:scale-95"
            >
              <span>📥</span>
              <span>Ripristina Attività Viaggio di Nozze</span>
            </button>
          )}
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
        <div className="space-y-6 mt-2">
          {groupedActivities.map(group => (
            <div key={group.date} className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1 border-b border-slate-200/60 pb-1">
                {group.date}
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
    </section>
  );
}
