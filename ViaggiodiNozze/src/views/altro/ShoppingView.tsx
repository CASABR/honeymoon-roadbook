import { useState, useEffect, useCallback } from 'react';
import type { Shopping } from '../../types';
import { storageService } from '../../storage/storageService';
import ShoppingForm from '../../components/forms/ShoppingForm';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/EmptyState';

import DayPickerStrip from '../../components/common/DayPickerStrip';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { getTripDateRange, type TripDayItem } from '../../utils/tripDates';

interface ShoppingViewProps {
  onBack?: () => void;
}

export default function ShoppingView({ onBack }: ShoppingViewProps) {
  const { canEdit } = useDeviceRole();
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [shoppingList, setShoppingList] = useState<Shopping[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [loading, setLoading] = useState(true);

  // Modali Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShopping, setEditingShopping] = useState<Shopping | null>(null);

  // Dialog eliminazione
  const [deleteTarget, setDeleteTarget] = useState<Shopping | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [loaded, range] = await Promise.all([
        storageService.getShopping(),
        getTripDateRange()
      ]);
      setShoppingList(loaded);
      setTripDays(range.tripDays);

      // Auto-selezione data intelligente
      const todayStr = new Date().toISOString().split('T')[0];
      const isInTrip = range.tripDays.some((d) => d.dateStr === todayStr);

      setSelectedDate((prev) => {
        if (prev !== 'tutte') return prev;
        if (isInTrip) return todayStr;
        return 'tutte';
      });
    } catch (err) {
      console.error('Errore nel caricamento dello shopping:', err);
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
    setEditingShopping(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Shopping) => {
    setEditingShopping(item);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    if (data.id) {
      await storageService.updateShopping(data.id, data);
    } else {
      await storageService.addShopping(data);
    }
    setIsModalOpen(false);
    setEditingShopping(null);
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await storageService.deleteShopping(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  const filteredShopping = shoppingList.filter(s => selectedDate === 'tutte' || s.data === selectedDate);

  // Raggruppamento per data se selezionato 'tutte'
  const groupedShopping = filteredShopping.reduce<Record<string, Shopping[]>>((acc, s) => {
    const key = s.data || 'Senza Data';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
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
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>🛍️</span> Shopping
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Negozi, mercatini tipici, souvenir e centri commerciali
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-rose-500 hover:bg-rose-400 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>+ Nuovo Shopping</span>
          </button>
        )}
      </header>

      {/* Selettore DayPickerStrip standardizzato a scorrimento orizzontale */}
      <DayPickerStrip
        days={tripDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        totalCount={shoppingList.length}
        itemCounts={shoppingList.reduce<Record<string, number>>((acc, s) => {
          if (s.data) {
            acc[s.data] = (acc[s.data] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* Contenuto principale */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[250px]">
          <div className="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredShopping.length === 0 ? (
        selectedDate !== 'tutte' ? (
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3">
            <span className="text-3xl">🛍️</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Nessun acquisto programmato per questo giorno
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Nessun negozio o sosta shopping salvata per la data {selectedDate}.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-400 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-500/20 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Nuovo Shopping per questa data</span>
              </button>
            )}
          </div>
        ) : (
          <EmptyState
            title="Nessun negozio o mercato registrato"
            description="Aggiungi mercati locali, negozi di souvenir tipici o boutique da visitare durante il viaggio."
            actionLabel={canEdit ? "+ Nuovo Shopping" : undefined}
            accentVariant="rose"
            onAction={canEdit ? handleOpenAdd : undefined}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            }
          />
        )
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedShopping).map(([groupKey, sGroup]) => (
            <div key={groupKey} className="space-y-3">
              {selectedDate === 'tutte' && (
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                  {groupKey === 'Senza Data' ? 'Senza Data' : `Data: ${groupKey}`}
                </h2>
              )}

              <div className="space-y-2.5">
                {sGroup.map((s) => {



                  return (
                    <div
                      key={s.id}
                      onClick={() => handleOpenEdit(s)}
                      className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 cursor-pointer active:scale-[0.99]"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs bg-pink-50 text-pink-700 border border-pink-100">
                            🛍️
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Shopping
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(s);
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
                              Boolean(s.copilota)
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
                              handleOpenEdit(s);
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
                          {s.nome}
                        </h3>
                        {s.indirizzo && (
                          <p className="text-xs text-slate-500 font-medium mt-1 truncate">
                            📍 {s.indirizzo}
                          </p>
                        )}
                        {s.budget && (
                          <p className="text-[11px] font-bold text-rose-600 mt-1">
                            💰 Budget: {s.budget}
                          </p>
                        )}
                      </div>
                    </div>


                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale Form Shopping */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingShopping ? 'Modifica Shopping' : 'Nuovo Shopping'}
        accentVariant="rose"
      >
        <ShoppingForm
          initialData={editingShopping}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Conferma eliminazione"
        message={`Sei sicuro di voler eliminare "${deleteTarget?.nome || ''}"?`}
        confirmLabel="Elimina definitivamente"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
