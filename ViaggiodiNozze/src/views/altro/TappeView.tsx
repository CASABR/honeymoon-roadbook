import React, { useState, useEffect, useCallback } from 'react';
import type { Tappa } from '../../types';
import { storageService } from '../../storage/storageService';
import TappaForm from '../../components/forms/TappaForm';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/EmptyState';

import DayPickerStrip from '../../components/common/DayPickerStrip';
import RouteBadge from '../../components/common/RouteBadge';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { getTripDateRange, type TripDayItem } from '../../utils/tripDates';

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout caricamento dati (1.5s)')), 1500)
      );

      const dataPromise = Promise.all([
        storageService.getTappe(),
        storageService.getAllRouteCaches(),
        getTripDateRange()
      ]);

      const [loadedTappe, routes, range] = await Promise.race([dataPromise, timeoutPromise]) as [Tappa[], any[], any];

      setTappe(loadedTappe || []);
      if (range) setTripDays(range.tripDays);
      setSelectedDate('tutte');

      // Calcola i km complessivi salvati in cache
      const kmSum = (routes || []).reduce((sum, r) => sum + (r.route?.distanceKm || 0), 0);
      setTotalKm(Math.round(kmSum * 10) / 10);
    } catch (err) {
      console.error('Errore nel caricamento delle tappe:', err);
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

  const filteredTappe = tappe.filter(t => selectedDate === 'tutte' || t.data === selectedDate);

  // Raggruppamento per data se selezionato 'tutte'
  const groupedTappe = filteredTappe.reduce<Record<string, Tappa[]>>((acc, t) => {
    const key = t.data || 'Senza Data';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

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
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3">
            <span className="text-3xl">📍</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Nessun elemento programmato per questo giorno
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
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
        <div className="space-y-6">
          {Object.entries(groupedTappe).map(([groupKey, tappeGroup]) => (
            <div key={groupKey} className="space-y-3">
              {selectedDate === 'tutte' && (
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                  {groupKey === 'Senza Data' ? 'Senza Data' : `Data: ${groupKey}`}
                </h2>
              )}

              <div className="space-y-2.5">
                {tappeGroup.map((tappa, idx) => {
                  const nextTappa = tappeGroup[idx + 1];



                  return (
                    <React.Fragment key={tappa.id}>
                      <div
                        onClick={() => handleOpenEdit(tappa)}
                        className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs bg-rose-50 text-rose-700 border border-rose-100">
                              📍
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Tappa
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(tappa);
                                }}
                                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                                title="Elimina"
                              >
                                🗑️
                              </button>
                            )}
                            <button
                              type="button"
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer shrink-0 active:scale-90 ${
                                Boolean(tappa.copilota)
                                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400 shadow-2xs'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              🧭
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(tappa);
                              }}
                              className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                              title="Dettagli e Modifica"
                            >
                              ℹ️
                            </button>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                            {tappa.titolo}
                          </h3>
                          {tappa.mapsUrl && (
                            <a
                              href={tappa.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-sky-600 bg-sky-50 px-2.5 py-1 rounded-lg hover:bg-sky-100 transition-colors"
                            >
                              🗺️ Apri in Maps
                            </a>
                          )}
                          {tappa.nota && (
                            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
                              {tappa.nota}
                            </p>
                          )}
                        </div>
                      </div>



                      {/* RouteBadge tra questa tappa e la successiva */}
                      {nextTappa && (
                        <div className="flex items-center justify-center py-1">
                          <RouteBadge
                            from={tappa.titolo}
                            to={nextTappa.titolo}
                            fromCoord={tappa.coordinate}
                            toCoord={nextTappa.coordinate}
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
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
    </div>
  );
}
