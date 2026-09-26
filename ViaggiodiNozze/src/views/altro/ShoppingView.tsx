import { useState, useEffect, useCallback } from 'react';
import type { Shopping } from '../../types';
import { storageService } from '../../storage/storageService';
import ShoppingForm from '../../components/forms/ShoppingForm';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { openMapLink, resolveMapUrl } from '../../utils/mapsHelper';
import DayPickerStrip from '../../components/common/DayPickerStrip';

interface ShoppingViewProps {
  onBack?: () => void;
}

export default function ShoppingView({ onBack }: ShoppingViewProps) {
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
      const loaded = await storageService.getShopping();
      setShoppingList(loaded);
    } catch (err) {
      console.error('Errore nel caricamento dello shopping:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
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
      </header>

      {/* Selettore DayPickerStrip standardizzato a scorrimento orizzontale */}
      <DayPickerStrip
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
          </div>
        ) : (
          <EmptyState
            title="Nessun negozio o mercato registrato"
            description="Aggiungi mercati locali, negozi di souvenir tipici o boutique da visitare durante il viaggio."
            actionLabel="+ Nuovo Shopping"
            accentVariant="rose"
            onAction={handleOpenAdd}
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
                  const hasCoordinates = s.coordinate && s.coordinate.lat !== undefined && s.coordinate.lng !== undefined;
                  const queryForMap = hasCoordinates 
                    ? `${s.coordinate!.lat},${s.coordinate!.lng}` 
                    : (s.indirizzo ? `${s.nome}, ${s.indirizzo}` : s.nome);
                  const mapUrl = hasCoordinates 
                    ? `https://www.google.com/maps/search/?api=1&query=${s.coordinate!.lat},${s.coordinate!.lng}`
                    : resolveMapUrl(queryForMap);

                  return (
                    <div
                      key={s.id}
                      className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xl shrink-0 mt-0.5">🛍️</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-slate-900 text-sm leading-tight">
                                {s.nome}
                              </h3>
                              {s.copilota && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                  🧭 Co-pilota
                                </span>
                              )}
                              {s.budget && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                                  {s.budget}
                                </span>
                              )}
                            </div>

                            {s.data && (
                              <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {s.data} {s.orario && `• ${s.orario}`}
                              </p>
                            )}

                            {s.indirizzo && (
                              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                                <span className="text-slate-400 text-xs">📍</span>
                                {s.indirizzo}
                              </p>
                            )}

                            {s.link && (
                              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                                <span className="text-slate-400 text-xs">🔗</span>
                                <a
                                  href={s.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-rose-600 hover:underline font-medium break-all"
                                >
                                  Sito / Dettagli web
                                </a>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Pulsanti Azione Modifica / Elimina */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(s)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Modifica Shopping"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(s)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Elimina Shopping"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {s.nota && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 whitespace-pre-wrap">
                          {s.nota}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
                        <span className="text-[10px] text-slate-400">
                          {hasCoordinates ? `Lat: ${s.coordinate?.lat}, Lng: ${s.coordinate?.lng}` : (s.indirizzo || 'Nessuna coordinata salvata')}
                        </span>

                        <button
                          type="button"
                          onClick={() => openMapLink(mapUrl)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-xl border border-sky-200/60 transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Apri in Maps</span>
                        </button>
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
