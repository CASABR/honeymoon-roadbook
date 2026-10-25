import { useState } from 'react';
import type { DayMapsRoutes, DayMapRouteEntry, DayRouteTransportMode } from '../../types';
import { openMapLink } from '../../utils/mapsHelper';

interface DayMapsCardProps {
  date: string;
  routes: DayMapsRoutes;
  canEdit: boolean;
  onSaveRoutes: (newRoutes: DayMapsRoutes) => Promise<void>;
  className?: string;
}

export default function DayMapsCard({
  date,
  routes,
  canEdit,
  onSaveRoutes,
  className = ''
}: DayMapsCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<DayRouteTransportMode>('driving');
  const [inputUrl, setInputUrl] = useState('');
  const [inputNotes, setInputNotes] = useState('');
  const [inputIsComplete, setInputIsComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const drivingRoute = routes?.driving;
  const walkingRoute = routes?.walking;

  const handleOpenModal = (mode: DayRouteTransportMode) => {
    setModalMode(mode);
    const existing = mode === 'driving' ? drivingRoute : walkingRoute;
    if (existing) {
      setInputUrl(existing.url || '');
      setInputNotes(existing.notes || '');
      setInputIsComplete(Boolean(existing.isComplete));
    } else {
      setInputUrl('');
      setInputNotes('');
      setInputIsComplete(false);
    }
    setIsModalOpen(true);
  };

  const handleSaveModal = async () => {
    if (!inputUrl.trim()) return;
    setIsSaving(true);
    try {
      const entry: DayMapRouteEntry = {
        url: inputUrl.trim(),
        mode: modalMode,
        isComplete: inputIsComplete,
        notes: inputNotes.trim() || undefined,
        updatedAt: Date.now()
      };

      const updated: DayMapsRoutes = {
        ...routes,
        [modalMode]: entry
      };

      await onSaveRoutes(updated);
      setIsModalOpen(false);
    } catch (err) {
      console.error('Errore salvataggio itinerario Maps:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveRoute = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      const updated: DayMapsRoutes = {
        ...routes,
        [modalMode]: null
      };
      await onSaveRoutes(updated);
      setIsModalOpen(false);
    } catch (err) {
      console.error('Errore eliminazione itinerario Maps:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`mx-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden ${className}`}>
      {/* Intestazione Compatta */}
      <div className="px-3.5 py-2 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs">📍</span>
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
            Percorsi Google Maps
          </h3>
        </div>
      </div>

      {/* Righe compatte: Auto e A piedi */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
        {/* Prima riga: Auto */}
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm shrink-0">🚗</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              Auto
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {drivingRoute?.url ? (
              <>
                <button
                  type="button"
                  onClick={() => openMapLink(drivingRoute.url)}
                  className="text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-100 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/50 cursor-pointer flex items-center gap-1 transition-all"
                >
                  Apri ↗
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleOpenModal('driving')}
                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-xs"
                    title="Modifica percorso auto"
                  >
                    ✏️
                  </button>
                )}
              </>
            ) : canEdit ? (
              <button
                type="button"
                onClick={() => handleOpenModal('driving')}
                className="flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-800 px-2.5 py-1 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer"
              >
                + Aggiungi
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 italic">Non presente</span>
            )}
          </div>
        </div>

        {/* Avviso contestuale limite tappe auto */}
        {drivingRoute?.isComplete && (
          <div className="px-3.5 py-1 bg-amber-50/80 dark:bg-amber-950/30 text-[10px] text-amber-800 dark:text-amber-300 border-t border-amber-100/60 dark:border-amber-900/30 flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Limite tappe Google Maps raggiunto</span>
          </div>
        )}

        {/* Seconda riga: A piedi */}
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm shrink-0">🚶</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              A piedi
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {walkingRoute?.url ? (
              <>
                <button
                  type="button"
                  onClick={() => openMapLink(walkingRoute.url)}
                  className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer flex items-center gap-1 transition-all"
                >
                  Apri ↗
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleOpenModal('walking')}
                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-xs"
                    title="Modifica percorso a piedi"
                  >
                    ✏️
                  </button>
                )}
              </>
            ) : canEdit ? (
              <button
                type="button"
                onClick={() => handleOpenModal('walking')}
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 px-2.5 py-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                + Aggiungi
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 italic">Non presente</span>
            )}
          </div>
        </div>

        {/* Avviso contestuale limite tappe a piedi */}
        {walkingRoute?.isComplete && (
          <div className="px-3.5 py-1 bg-amber-50/80 dark:bg-amber-950/30 text-[10px] text-amber-800 dark:text-amber-300 border-t border-amber-100/60 dark:border-amber-900/30 flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Limite tappe Google Maps raggiunto</span>
          </div>
        )}
      </div>

      {/* Modale Compatto Inserimento / Modifica Itinerario */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-5 space-y-3.5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-base">{modalMode === 'driving' ? '🚗' : '🚶'}</span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {modalMode === 'driving' ? 'Percorso in Auto' : 'Percorso a Piedi'}
                  </h4>
                  <p className="text-[10px] text-slate-400">{date}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Link Google Maps *
                </label>
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-mono"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Nota breve (opzionale)
                </label>
                <input
                  type="text"
                  value={inputNotes}
                  onChange={(e) => setInputNotes(e.target.value)}
                  placeholder="Es. Percorso panoramico..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={inputIsComplete}
                  onChange={(e) => setInputIsComplete(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  Google Maps ha raggiunto il limite tappe
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
              {(modalMode === 'driving' ? drivingRoute : walkingRoute) ? (
                <button
                  type="button"
                  onClick={handleRemoveRoute}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  Rimuovi
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleSaveModal}
                  disabled={!inputUrl.trim() || isSaving}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#FF6B5F] hover:bg-[#ff5547] text-white transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSaving ? 'Salvataggio…' : 'Salva'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
