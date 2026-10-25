import { useState } from 'react';
import type { DayMapsRoutes, DayMapRouteEntry } from '../../types';
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
  const [drivingUrl, setDrivingUrl] = useState('');
  const [drivingIsComplete, setDrivingIsComplete] = useState(false);
  const [walkingUrl, setWalkingUrl] = useState('');
  const [walkingIsComplete, setWalkingIsComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const drivingRoute = routes?.driving;
  const walkingRoute = routes?.walking;

  const handleOpenModal = () => {
    setDrivingUrl(drivingRoute?.url || '');
    setDrivingIsComplete(Boolean(drivingRoute?.isComplete));
    setWalkingUrl(walkingRoute?.url || '');
    setWalkingIsComplete(Boolean(walkingRoute?.isComplete));
    setIsModalOpen(true);
  };

  const handleSaveModal = async () => {
    setIsSaving(true);
    try {
      const updated: DayMapsRoutes = { ...routes };

      if (drivingUrl.trim()) {
        const dEntry: DayMapRouteEntry = {
          url: drivingUrl.trim(),
          mode: 'driving',
          isComplete: drivingIsComplete,
          notes: drivingRoute?.notes,
          updatedAt: Date.now()
        };
        updated.driving = dEntry;
      } else {
        updated.driving = null;
      }

      if (walkingUrl.trim()) {
        const wEntry: DayMapRouteEntry = {
          url: walkingUrl.trim(),
          mode: 'walking',
          isComplete: walkingIsComplete,
          notes: walkingRoute?.notes,
          updatedAt: Date.now()
        };
        updated.walking = wEntry;
      } else {
        updated.walking = null;
      }

      await onSaveRoutes(updated);
      setIsModalOpen(false);
    } catch (err) {
      console.error('Errore salvataggio percorsi Maps:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      await onSaveRoutes({ driving: null, walking: null });
      setIsModalOpen(false);
    } catch (err) {
      console.error('Errore reset percorsi Maps:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Se nessun percorso è impostato e l'utente non ha permessi di modifica, non mostrare una barra vuota
  if (!drivingRoute?.url && !walkingRoute?.url && !canEdit) {
    return null;
  }

  return (
    <div className={`mx-1 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between gap-1.5 overflow-hidden ${className}`}>
      {/* Icona Ufficiale Google Maps + Titolo compatto */}
      <div className="flex items-center gap-1.5 shrink-0 min-w-0">
        <svg
          className="w-5 h-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Google Maps"
        >
          <path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
            fill="#EA4335"
          />
          <circle cx="12" cy="9" r="2.8" fill="#FFFFFF" />
          <circle cx="12" cy="9" r="1.5" fill="#4285F4" />
        </svg>
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 hidden min-[360px]:inline truncate">
          Maps
        </span>
      </div>

      {/* Controlli compatti su una sola riga */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Pulsante Automobile */}
        {drivingRoute?.url ? (
          <button
            type="button"
            onClick={() => openMapLink(drivingRoute.url)}
            title={`Apri percorso Auto${drivingRoute.isComplete ? ' (Limite tappe raggiunto)' : ''}`}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800 transition active:scale-95 cursor-pointer"
          >
            <span className="text-xs">🚗</span>
            <span className="text-[10px] font-bold">Auto</span>
            {drivingRoute.isComplete && <span className="text-[10px]" title="Limite tappe">⚠️</span>}
          </button>
        ) : canEdit ? (
          <button
            type="button"
            onClick={handleOpenModal}
            title="Aggiungi percorso in auto"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer"
          >
            <span className="text-xs opacity-60">🚗</span>
            <span className="text-[10px]">+</span>
          </button>
        ) : null}

        {/* Pulsante A Piedi */}
        {walkingRoute?.url ? (
          <button
            type="button"
            onClick={() => openMapLink(walkingRoute.url)}
            title={`Apri percorso A piedi${walkingRoute.isComplete ? ' (Limite tappe raggiunto)' : ''}`}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 transition active:scale-95 cursor-pointer"
          >
            <span className="text-xs">🚶</span>
            <span className="text-[10px] font-bold">Piedi</span>
            {walkingRoute.isComplete && <span className="text-[10px]" title="Limite tappe">⚠️</span>}
          </button>
        ) : canEdit ? (
          <button
            type="button"
            onClick={handleOpenModal}
            title="Aggiungi percorso a piedi"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer"
          >
            <span className="text-xs opacity-60">🚶</span>
            <span className="text-[10px]">+</span>
          </button>
        ) : null}

        {/* Unica icona Matita per modificare entrambi i link */}
        {canEdit && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition active:scale-95 text-xs cursor-pointer"
            title="Modifica percorsi Auto e A piedi"
          >
            ✏️
          </button>
        )}
      </div>

      {/* Modale Compatto Unificato con entrambi i campi Auto e A piedi */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-base">📍</span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Percorsi Google Maps
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

            <div className="space-y-2.5">
              {/* Campo Auto */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1">
                    <span>🚗</span> Percorso in Auto
                  </label>
                  {drivingUrl && (
                    <button
                      type="button"
                      onClick={() => setDrivingUrl('')}
                      className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                    >
                      Cancella
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  value={drivingUrl}
                  onChange={(e) => setDrivingUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                />
                <label className="flex items-center gap-1.5 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={drivingIsComplete}
                    onChange={(e) => setDrivingIsComplete(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3 h-3"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Limite tappe Google Maps raggiunto
                  </span>
                </label>
              </div>

              {/* Campo A Piedi */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <span>🚶</span> Percorso a Piedi
                  </label>
                  {walkingUrl && (
                    <button
                      type="button"
                      onClick={() => setWalkingUrl('')}
                      className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                    >
                      Cancella
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  value={walkingUrl}
                  onChange={(e) => setWalkingUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <label className="flex items-center gap-1.5 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={walkingIsComplete}
                    onChange={(e) => setWalkingIsComplete(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Limite tappe Google Maps raggiunto
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
              {(drivingRoute?.url || walkingRoute?.url) ? (
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={isSaving}
                  className="px-2 py-1 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  Rimuovi tutto
                </button>
              ) : <div />}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleSaveModal}
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#FF6B5F] hover:bg-[#ff5547] text-white transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
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

