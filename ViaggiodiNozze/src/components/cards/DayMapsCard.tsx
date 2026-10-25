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

/**
 * Rileva in modo euristico quante tappe/punti sono contenuti in un URL Google Maps di indicazioni stradali.
 * Google Maps ha un limite tecnico rigido di 10 punti (1 origine + 9 destinazioni/waypoint).
 */
export function estimateGoogleMapsStops(url: string): number | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const clean = url.trim();
    if (clean.includes('/maps/dir/')) {
      const parts = clean.split('/maps/dir/')[1]?.split('/');
      if (parts) {
        // Filtriamo parametri di zoom/coordinate (@lat,lng) o dati interni (data=...)
        const stops = parts.filter(p => p && !p.startsWith('@') && !p.startsWith('data=') && !p.includes('?'));
        if (stops.length > 0) return stops.length;
      }
    }
    // Formato con parametri URL query: origin, destination, waypoints
    if (clean.includes('origin=') && clean.includes('destination=')) {
      let count = 2;
      const waypointsMatch = clean.match(/waypoints=([^&]+)/);
      if (waypointsMatch && waypointsMatch[1]) {
        const waypoints = decodeURIComponent(waypointsMatch[1]).split('|');
        count += waypoints.length;
      }
      return count;
    }
  } catch {
    // Silenzioso
  }
  return null;
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
  const [inputStopsCount, setInputStopsCount] = useState<number | undefined>(undefined);
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
      setInputStopsCount(existing.stopsCount);
    } else {
      setInputUrl('');
      setInputNotes('');
      setInputIsComplete(false);
      setInputStopsCount(undefined);
    }
    setIsModalOpen(true);
  };

  const handleUrlChange = (val: string) => {
    setInputUrl(val);
    const estimated = estimateGoogleMapsStops(val);
    if (estimated !== null) {
      setInputStopsCount(estimated);
      if (estimated >= 10) {
        setInputIsComplete(true);
      }
    }
  };

  const handleSaveModal = async () => {
    if (!inputUrl.trim()) return;
    setIsSaving(true);
    try {
      const entry: DayMapRouteEntry = {
        url: inputUrl.trim(),
        mode: modalMode,
        isComplete: inputIsComplete,
        stopsCount: inputStopsCount,
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

  const handleRemoveRoute = async (mode: DayRouteTransportMode) => {
    if (!canEdit) return;
    if (!window.confirm(`Vuoi rimuovere l'itinerario a ${mode === 'driving' ? 'in auto' : 'a piedi'} per questa giornata?`)) {
      return;
    }
    try {
      const updated: DayMapsRoutes = {
        ...routes,
        [mode]: null
      };
      await onSaveRoutes(updated);
    } catch (err) {
      console.error('Errore eliminazione itinerario Maps:', err);
    }
  };

  // Renderizzatore singola modalità (Auto o Piedi)
  const renderModeSection = (
    mode: DayRouteTransportMode,
    route: DayMapRouteEntry | null | undefined
  ) => {
    const isDriving = mode === 'driving';
    const icon = isDriving ? '🚗' : '🚶';
    const title = isDriving ? 'Itinerario in Auto' : 'Itinerario a Piedi';
    const desc = isDriving
      ? 'Percorso stradale per spostamenti in vettura'
      : 'Percorso pedonale tra quartieri e punti di interesse';

    const hasRoute = Boolean(route && route.url);
    const isLimitReached = Boolean(route?.isComplete || (route?.stopsCount && route.stopsCount >= 10));

    if (!hasRoute) {
      return (
        <div className="flex-1 p-3.5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex flex-col justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-sm shrink-0">
              {icon}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{title}</span>
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 italic">Non inserito</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                {desc}
              </p>
            </div>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => handleOpenModal(mode)}
              className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
            >
              <span>+</span>
              <span>Aggiungi {isDriving ? 'auto' : 'a piedi'}</span>
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="flex-1 p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 border ${
                isDriving
                  ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-800/60'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/60'
              }`}>
                {icon}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-900 dark:text-white">{title}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 text-[10px] font-extrabold">
                    ✓ Presente
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[240px]">
                  {route?.notes || desc}
                </p>
              </div>
            </div>

            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenModal(mode)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-xs"
                  title="Modifica o sostituisci percorso"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveRoute(mode)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-xs"
                  title="Rimuovi itinerario"
                >
                  🗑️
                </button>
              </div>
            )}
          </div>

          {/* AVVISO LIMITE TECNICO GOOGLE MAPS (Spiegazione chiara, non solo "Piena") */}
          {isLimitReached && (
            <div className="mt-2.5 px-2.5 py-1.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
              <div className="flex items-center gap-1.5 font-bold mb-0.5 text-[10px] uppercase tracking-wider text-amber-800 dark:text-amber-300">
                <span>⚠️</span>
                <span>Capienza massima Google Maps (10 tappe)</span>
              </div>
              <span>
                Questo itinerario ha raggiunto il limite tecnico imposto da Google Maps (1 partenza + 9 tappe). Non è possibile aggiungere altre soste a questo link.
              </span>
            </div>
          )}
        </div>

        {/* AZIONI DI CONSULTAZIONE */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => route?.url && openMapLink(route.url)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer ${
              isDriving
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            <span>Apri su Google Maps</span>
            <span aria-hidden="true">↗</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => handleOpenModal(mode)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              Sostituisci
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`mx-1 ${className}`}>
      {/* Testata Card Travel Editorial */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs">🗺️</span>
          <h3 className="text-xs font-black uppercase tracking-[0.15em] text-slate-800 dark:text-slate-200">
            Percorsi Google Maps del Giorno
          </h3>
        </div>
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          Max 10 tappe per rotta Maps
        </span>
      </div>

      {/* Griglia a 2 colonne responsive (Auto + Piedi) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {renderModeSection('driving', drivingRoute)}
        {renderModeSection('walking', walkingRoute)}
      </div>

      {/* Modale Inserimento / Modifica Itinerario */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">
                  {modalMode === 'driving' ? '🚗' : '🚶'}
                </span>
                <div>
                  <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {modalMode === 'driving' ? 'Itinerario in Auto' : 'Itinerario a Piedi'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    Giorno: {date}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Switch Modalità (Auto / Piedi) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Modalità di trasporto
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setModalMode('driving');
                    const ex = drivingRoute;
                    if (ex) {
                      setInputUrl(ex.url || '');
                      setInputNotes(ex.notes || '');
                      setInputIsComplete(Boolean(ex.isComplete));
                    }
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    modalMode === 'driving'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span>🚗</span>
                  <span>In Auto</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalMode('walking');
                    const ex = walkingRoute;
                    if (ex) {
                      setInputUrl(ex.url || '');
                      setInputNotes(ex.notes || '');
                      setInputIsComplete(Boolean(ex.isComplete));
                    }
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    modalMode === 'walking'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span>🚶</span>
                  <span>A Piedi</span>
                </button>
              </div>
            </div>

            {/* Campo URL Maps */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Collegamento Google Maps *
              </label>
              <input
                type="url"
                required
                placeholder="https://maps.app.goo.gl/... oppure https://www.google.com/maps/dir/..."
                value={inputUrl}
                onChange={e => handleUrlChange(e.target.value)}
                className="w-full h-11 px-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-mono focus:outline-none focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 transition-colors"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Incolla il link creato da Google Maps web o app.
              </p>
            </div>

            {/* Note opzionali */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Note sul percorso (opzionale)
              </label>
              <input
                type="text"
                placeholder="es. Tratta mattutina con soste panoramiche"
                value={inputNotes}
                onChange={e => setInputNotes(e.target.value)}
                className="w-full h-10 px-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 transition-colors"
              />
            </div>

            {/* Spiegazione e Toggle Limite 10 Tappe Tecnico */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inputIsComplete}
                  onChange={e => setInputIsComplete(e.target.checked)}
                  className="mt-0.5 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Percorso completo / Limite 10 tappe Maps raggiunto
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-snug mt-0.5">
                    Google Maps limita tecnicamente le rotte a un massimo di 10 punti (1 origine + 9 soste). Spunta questa opzione se il percorso non può contenere altre tappe.
                  </span>
                </div>
              </label>

              {inputStopsCount !== undefined && inputStopsCount > 0 && (
                <div className="text-[11px] font-bold text-sky-700 dark:text-sky-300 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                  📍 Tappe stimate nel link: {inputStopsCount} / 10
                </div>
              )}
            </div>

            {/* Pulsanti Modale */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={!inputUrl.trim() || isSaving}
                onClick={handleSaveModal}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#172033] dark:bg-sky-600 hover:bg-slate-800 text-white shadow-md disabled:opacity-50 transition-all cursor-pointer active:scale-95"
              >
                {isSaving ? 'Salvataggio…' : 'Salva Itinerario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
