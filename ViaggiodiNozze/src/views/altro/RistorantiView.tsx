import { useState, useEffect, useCallback } from 'react';
import type { Ristorante } from '../../types';
import { storageService } from '../../storage/storageService';
import RistoranteForm from '../../components/forms/RistoranteForm';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { openMapLink, resolveMapUrl } from '../../utils/mapsHelper';
import DayPickerStrip from '../../components/common/DayPickerStrip';

interface RistorantiViewProps {
  onBack?: () => void;
}

export default function RistorantiView({ onBack }: RistorantiViewProps) {
  const [ristoranti, setRistoranti] = useState<Ristorante[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [loading, setLoading] = useState(true);

  // Modali Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRistorante, setEditingRistorante] = useState<Ristorante | null>(null);

  // Dialog eliminazione
  const [deleteTarget, setDeleteTarget] = useState<Ristorante | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const loadedRistoranti = await storageService.getRistoranti();
      setRistoranti(loadedRistoranti);
    } catch (err) {
      console.error('Errore nel caricamento dei ristoranti:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAdd = () => {
    setEditingRistorante(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ristorante: Ristorante) => {
    setEditingRistorante(ristorante);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    if (data.id) {
      await storageService.updateRistorante(data.id, data);
    } else {
      await storageService.addRistorante(data);
    }
    setIsModalOpen(false);
    setEditingRistorante(null);
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await storageService.deleteRistorante(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  const filteredRistoranti = ristoranti.filter(r => selectedDate === 'tutte' || r.data === selectedDate);

  // Raggruppamento per data se selezionato 'tutte'
  const groupedRistoranti = filteredRistoranti.reduce<Record<string, Ristorante[]>>((acc, r) => {
    const key = r.data || 'Senza Data';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
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
              <span>🍽️</span> Ristoranti
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Luoghi dove mangiare, cucine tipiche e prenotazioni
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>+ Nuovo Ristorante</span>
        </button>
      </header>

      {/* Selettore DayPickerStrip standardizzato a scorrimento orizzontale */}
      <DayPickerStrip
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        totalCount={ristoranti.length}
        itemCounts={ristoranti.reduce<Record<string, number>>((acc, r) => {
          if (r.data) {
            acc[r.data] = (acc[r.data] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* Contenuto principale */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[250px]">
          <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredRistoranti.length === 0 ? (
        selectedDate !== 'tutte' ? (
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3">
            <span className="text-3xl">🍽️</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Nessun elemento programmato per questo giorno
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Nessun ristorante o locale salvato per la data {selectedDate}.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Nuovo Ristorante per questa data</span>
            </button>
          </div>
        ) : (
          <EmptyState
            title="Nessun ristorante registrato"
            description="Aggiungi locali consigliati, pub, ristoranti tipici o prenotazioni per il viaggio."
            actionLabel="+ Nuovo Ristorante"
            accentVariant="amber"
            onAction={handleOpenAdd}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
          />
        )
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedRistoranti).map(([groupKey, rGroup]) => (
            <div key={groupKey} className="space-y-3">
              {selectedDate === 'tutte' && (
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                  {groupKey === 'Senza Data' ? 'Senza Data' : `Data: ${groupKey}`}
                </h2>
              )}

              <div className="space-y-2.5">
                {rGroup.map((r) => {
                  const hasCoordinates = r.coordinate && r.coordinate.lat !== undefined && r.coordinate.lng !== undefined;
                  const queryForMap = hasCoordinates 
                    ? `${r.coordinate!.lat},${r.coordinate!.lng}` 
                    : (r.indirizzo ? `${r.nome}, ${r.indirizzo}` : r.nome);
                  const mapUrl = hasCoordinates 
                    ? `https://www.google.com/maps/search/?api=1&query=${r.coordinate!.lat},${r.coordinate!.lng}`
                    : resolveMapUrl(queryForMap);

                  return (
                    <div
                      key={r.id}
                      className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xl shrink-0 mt-0.5">🍽️</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-slate-900 text-sm leading-tight">
                                {r.nome}
                              </h3>
                              {r.copilota && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                  🧭 Co-pilota
                                </span>
                              )}
                            </div>

                            {r.data && (
                              <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {r.data}
                              </p>
                            )}

                            {r.indirizzo && (
                              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                                <span className="text-slate-400 text-xs">📍</span>
                                {r.indirizzo}
                              </p>
                            )}

                            {r.telefono && (
                              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                                <span className="text-slate-400 text-xs">📞</span>
                                <a
                                  href={`tel:${r.telefono}`}
                                  className="text-amber-600 hover:underline font-medium"
                                >
                                  {r.telefono}
                                </a>
                              </p>
                            )}

                            {r.linkPrenotazione && (
                              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                                <span className="text-slate-400 text-xs">🔗</span>
                                <a
                                  href={r.linkPrenotazione}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-600 hover:underline font-medium break-all"
                                >
                                  Link prenotazione / sito
                                </a>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Pulsanti Azione Modifica / Elimina */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(r)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title="Modifica Ristorante"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Elimina Ristorante"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {r.nota && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 whitespace-pre-wrap">
                          {r.nota}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
                        <span className="text-[10px] text-slate-400">
                          {hasCoordinates ? `Lat: ${r.coordinate?.lat}, Lng: ${r.coordinate?.lng}` : (r.indirizzo || 'Nessuna coordinata salvata')}
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

      {/* Modale Form Ristorante */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRistorante ? 'Modifica Ristorante' : 'Nuovo Ristorante'}
        accentVariant="amber"
      >
        <RistoranteForm
          initialData={editingRistorante}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Conferma eliminazione"
        message={`Sei sicuro di voler eliminare il ristorante "${deleteTarget?.nome || ''}"?`}
        confirmLabel="Elimina definitivamente"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
