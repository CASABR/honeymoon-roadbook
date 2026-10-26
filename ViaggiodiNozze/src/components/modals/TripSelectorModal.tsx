import { useState, useEffect, useCallback } from 'react';
import { auth } from '../../firebase';
import {
  fetchUserTrips,
  verifyTripOwnership,
  switchActiveTrip,
  loginWithGoogle,
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
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => auth?.currentUser || null);
  const currentTripId = getTripConfig()?.id || '0000';

  useEffect(() => {
    if (!auth) return;
    const unsub = auth.onAuthStateChanged((u: any) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  const loadTrips = useCallback(async () => {
    const user = auth?.currentUser;
    if (!user) {
      setTrips([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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

      setTrips(loadedTrips);
    } catch (err) {
      console.warn('[TripSelectorModal] Errore caricamento viaggi:', err);
    } finally {
      setLoading(false);
    }
  }, [currentTripId]);

  useEffect(() => {
    if (isOpen) {
      loadTrips();
    }
  }, [isOpen, loadTrips, currentUser]);

  const handleGoogleSignIn = async () => {
    setIsSigningInGoogle(true);
    try {
      const res = await loginWithGoogle();
      if (res.success) {
        await loadTrips();
      } else if (res.error) {
        alert(res.error);
      }
    } catch (err: any) {
      console.error('[TripSelectorModal] Errore Google sign-in:', err);
    } finally {
      setIsSigningInGoogle(false);
    }
  };

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
          {/* Account status / Google sign-in */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs">
            {currentUser?.isAnonymous ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Ospite anonimo
                  </span>
                  <button
                    type="button"
                    disabled={isSigningInGoogle}
                    onClick={handleGoogleSignIn}
                    className="px-2.5 py-1 rounded-xl font-bold text-[11px] bg-white dark:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-600 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-600 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    {isSigningInGoogle ? 'Accesso…' : 'Accedi con Google'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  I viaggi creati con il tuo account (es. 0000) sono protetti. Accedi con Google per visualizzarli su questo browser.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Account Connesso</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {currentUser?.displayName || currentUser?.email || 'Account Google'}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  ✓ Sincronizzato
                </span>
              </div>
            )}
          </div>
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
