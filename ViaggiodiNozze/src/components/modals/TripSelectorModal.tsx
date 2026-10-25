import { useState, useEffect } from 'react';
import { auth } from '../../firebase';
import {
  fetchUserTrips,
  verifyTripOwnership,
  switchActiveTrip,
  type UserTripSummary
} from '../../services/accountService';
import { getTripConfig } from '../../utils/tripConfig';
import { formatDateIT } from '../../utils/tripDates';

interface TripSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTripSelected?: (trip: UserTripSummary) => void;
}

export default function TripSelectorModal({
  isOpen,
  onClose,
  onTripSelected
}: TripSelectorModalProps) {
  const [trips, setTrips] = useState<UserTripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const currentTripId = getTripConfig()?.id || '0000';

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    const loadTrips = async () => {
      const user = auth?.currentUser;
      if (!user) {
        if (isMounted) {
          setTrips([]);
          setLoading(false);
        }
        return;
      }

      try {
        const loadedTrips = await fetchUserTrips(user.uid);

        // Controllo speciale per viaggio 0000 (legacy) se l'utente è l'owner effettivo
        const legacyCheck = await verifyTripOwnership('0000', user.uid);
        if (legacyCheck.exists && legacyCheck.isOwner) {
          const alreadyHas0000 = loadedTrips.some(t => t.id === '0000');
          if (!alreadyHas0000) {
            loadedTrips.unshift({
              id: '0000',
              title: 'Viaggio Originale (0000)',
              destination: 'Nuova Zelanda & Cook',
              startDate: '2026-11-28',
              endDate: '2027-01-10',
              ownerUid: user.uid,
              ownerName: legacyCheck.ownerName || 'nunzio',
              isOwner: true,
              role: 'owner',
              isLastUsed: currentTripId === '0000'
            });
          }
        }

        if (isMounted) {
          setTrips(loadedTrips);
        }
      } catch (err) {
        console.warn('[TripSelectorModal] Errore caricamento viaggi:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadTrips();
    return () => {
      isMounted = false;
    };
  }, [isOpen, currentTripId]);

  if (!isOpen) return null;

  const handleSelectTrip = async (trip: UserTripSummary) => {
    setSwitchingId(trip.id);
    try {
      await switchActiveTrip(trip);
      if (onTripSelected) {
        onTripSelected(trip);
      }
      onClose();
    } catch (err) {
      console.error('[TripSelectorModal] Errore cambio viaggio:', err);
      alert('Impossibile cambiare viaggio. Riprova.');
    } finally {
      setSwitchingId(null);
    }
  };

  const ownedTrips = trips.filter(t => t.isOwner || t.role === 'owner');
  const copilotTrips = trips.filter(t => !t.isOwner && t.role === 'copilota');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🗺️</span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                I Tuoi Viaggi
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Seleziona il viaggio da visualizzare
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto py-3 space-y-4 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Caricamento viaggi autorizzati…</p>
            </div>
          ) : trips.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl mx-auto text-slate-400">
                📭
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">Nessun viaggio trovato</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Questo account non ha ancora viaggi sincronizzati nel cloud.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  window.location.search = '?onboarding=reset';
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 transition cursor-pointer"
              >
                <span>✨</span>
                <span>Crea o unisciti a un viaggio</span>
              </button>
            </div>
          ) : (
            <>
              {/* Sezione: Viaggi come Organizzatore */}
              {ownedTrips.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-xs">👑</span>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Organizzatore ({ownedTrips.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {ownedTrips.map(trip => renderTripCard(trip))}
                  </div>
                </div>
              )}

              {/* Sezione: Viaggi come Co-pilota */}
              {copilotTrips.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-xs">🤝</span>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Co-pilota ({copilotTrips.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {copilotTrips.map(trip => renderTripCard(trip))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Viaggio attivo: <strong className="text-slate-800 dark:text-slate-200">{currentTripId}</strong></span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );

  function renderTripCard(trip: UserTripSummary) {
    const isCurrent = trip.id === currentTripId;
    const isSwitching = switchingId === trip.id;

    return (
      <div
        key={trip.id}
        className={`p-3.5 rounded-2xl border transition-all text-left flex items-center justify-between gap-3 ${
          isCurrent
            ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/80 shadow-xs ring-1 ring-indigo-500/30'
            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
              {trip.title}
            </h4>
            {isCurrent && (
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-indigo-600 text-white shrink-0">
                In Uso
              </span>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {trip.destination && (
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                📍 {trip.destination}
              </span>
            )}
            {trip.startDate && (
              <span>
                📅 {formatDateIT(trip.startDate)} {trip.endDate ? `– ${formatDateIT(trip.endDate)}` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span className="font-mono">ID: {trip.id}</span>
            {trip.ownerName && <span>• Org: {trip.ownerName}</span>}
          </div>
        </div>

        <button
          type="button"
          disabled={isCurrent || isSwitching}
          onClick={() => handleSelectTrip(trip)}
          className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:cursor-default ${
            isCurrent
              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-sm'
          }`}
        >
          {isSwitching ? 'Apertura…' : isCurrent ? '✓ Attivo' : 'Apri'}
        </button>
      </div>
    );
  }
}
