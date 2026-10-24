import { useState } from 'react';
import type { LiveUpdate } from '../../services/liveService';
import type { LiveGpsLease, LiveGpsLocation, LiveGpsDevice } from '../../services/liveGpsService';
import type { LiveIntelligenceState } from '../../utils/liveIntelligenceHelper';

export interface LiveEditorialExperienceProps {
  isExternal: boolean;
  onBack?: () => void;
  location: any;
  realLocation: any;
  mapSearchUrl: string;
  tileGrid: any;
  tileLoadFailed: boolean;
  onTileError: () => void;
  gpsError: string | null;
  gpsFeedback?: string | null;
  isDetectingGps: boolean;
  canControlGps: boolean;
  deviceLabel: string;
  onDetectGps?: () => void;
  // Remote GPS lease and locations
  remoteGpsLease?: LiveGpsLease | null;
  remoteGpsLocation?: LiveGpsLocation | null;
  isGpsHolder?: boolean;
  isOwner?: boolean;
  isCopilota?: boolean;
  gpsDevices?: LiveGpsDevice[];
  onStartGps?: () => void;
  onPauseGps?: () => void;
  onResumeGps?: () => void;
  onStopGps?: () => void;
  onTransferGps?: (uid: string, deviceId: string) => void;
  onRevokeGps?: () => void;
  // Live Intelligence & Dual Map Markers
  liveIntelligence?: LiveIntelligenceState | null;
  mapCenterMode?: 'both' | 'real' | 'planned';
  onChangeMapCenterMode?: (mode: 'both' | 'real' | 'planned') => void;
  realMarkerOffset?: { dx: number; dy: number } | null;
  plannedMarkerOffset?: { dx: number; dy: number } | null;
  // Status & Diary
  statusMessage: string;
  statusUpdatedAt: string;
  canPublish: boolean;
  isEditingStatus: boolean;
  tempStatus: string;
  onTempStatusChange: (value: string) => void;
  onToggleStatusEdit: () => void;
  onSaveStatus: () => void;
  liveTextMessage: string;
  onLiveTextChange: (value: string) => void;
  onSendMessage: (event: React.FormEvent) => void;
  isSendingMessage: boolean;
  messageError: string | null;
  messageSuccess: string | null;
  updates: LiveUpdate[];
  reactions: Record<string, string>;
  onReaction: (updateId: string, emoji: string) => void;
  onShare: () => void;
  copiedLink: boolean;
  online: boolean;
}

const REACTIONS = ['❤️', '😍', '😂', '👋'];

const formatUpdateDate = (timestamp: number) => new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
}).format(new Date(timestamp));

const formatRelativeTime = (date: Date) => {
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 20) return 'pochi istanti fa';
  if (diffSec < 60) return `${diffSec}s fa`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min fa`;
  return `${Math.floor(diffMin / 60)}h fa`;
};

export default function LiveEditorialExperience(props: LiveEditorialExperienceProps) {
  const [openPhoto, setOpenPhoto] = useState<{ url: string; title: string } | null>(null);
  const [selectedCopilotDevice, setSelectedCopilotDevice] = useState<string>('');

  const isLeaseActive = props.remoteGpsLease?.status === 'active';
  const isLeasePaused = props.remoteGpsLease?.status === 'paused';
  const isLeaseStopped = !props.remoteGpsLease || props.remoteGpsLease?.status === 'stopped';
  const hasFreshRemoteLocation = Boolean(props.remoteGpsLocation && isLeaseActive);

  // Status visual badge
  const gpsStatus = hasFreshRemoteLocation
    ? { label: 'LIVE in trasmissione', tone: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500 animate-pulse' }
    : isLeasePaused
      ? { label: 'In pausa temporanea', tone: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' }
      : props.realLocation
        ? { label: 'Rilevata localmente', tone: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' }
        : props.gpsError
          ? { label: 'Non disponibile', tone: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' }
          : { label: 'Non attivata', tone: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' };

  // Copilot devices available for transfer
  const eligibleCopilots = (props.gpsDevices || []).filter(d => d.role === 'copilota');

  return (
    <div className="mx-auto w-full max-w-5xl pb-12 animate-fade-in">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-5 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          {!props.isExternal && props.onBack && (
            <button type="button" onClick={props.onBack} className="hounigo-button-ghost shrink-0 px-3 py-2" aria-label="Torna indietro">
              ←
            </button>
          )}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#FF6B5F]">Hounigo · Live</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">Il viaggio, mentre accade</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Posizione in tempo reale, diario pubblico e partecipazione degli ospiti.</p>
          </div>
        </div>
        <button type="button" onClick={props.onShare} className="hounigo-button-secondary shrink-0 px-3 py-2 text-xs">
          {props.copiedLink ? 'Link copiato' : 'Condividi LIVE'}
        </button>
      </header>

      {!props.online && (
        <div className="mb-6 border-y border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
          Sei offline. Il diario resta leggibile, ma GPS, pubblicazione e reazioni richiedono connessione.
        </div>
      )}

      {/* ─── 01 · POSIZIONE ───────────────────────────────────────────── */}
      <section aria-labelledby="live-position-title" className="mb-10">
        <div className="flex items-end justify-between gap-4 mb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">01 · Posizione</p>
            <h2 id="live-position-title" className="text-xl font-extrabold text-slate-950 dark:text-white">Dove siamo</h2>
          </div>
          <span className={`inline-flex items-center gap-2 text-xs font-bold ${gpsStatus.tone}`}>
            <span className={`w-2 h-2 rounded-full ${gpsStatus.dot}`} />
            {gpsStatus.label}
          </span>
        </div>

        {/* MAPPA CARTOGRAFICA EDITORIALE */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 min-h-[330px] sm:min-h-[440px]">
          {/* CAMERA FOCUS CONTROLS */}
          {!props.isExternal && props.liveIntelligence?.plannedLocation?.coords && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-slate-900/85 backdrop-blur-md p-1 rounded-xl border border-white/20 text-[11px] font-bold text-white shadow-lg">
              <button
                type="button"
                onClick={() => props.onChangeMapCenterMode?.('both')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  props.mapCenterMode === 'both' ? 'bg-[#FF6B5F] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Entrambi
              </button>
              <button
                type="button"
                onClick={() => props.onChangeMapCenterMode?.('real')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  props.mapCenterMode === 'real' ? 'bg-[#FF6B5F] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                GPS
              </button>
              <button
                type="button"
                onClick={() => props.onChangeMapCenterMode?.('planned')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  props.mapCenterMode === 'planned' ? 'bg-[#FF6B5F] text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Itinerario
              </button>
            </div>
          )}

          {props.tileGrid && !props.tileLoadFailed ? (
            <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="absolute left-1/2 top-1/2 w-[768px] h-[768px] -translate-x-1/2 -translate-y-1/2 grid grid-cols-3 grid-rows-3 opacity-90 dark:opacity-60">
                {props.tileGrid.tiles.map((tile: any) => (
                  <img key={tile.key} src={tile.url} alt="" onError={props.onTileError} className="w-64 h-64 object-cover" />
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,.16)_25%,transparent_25%,transparent_50%,rgba(148,163,184,.16)_50%,rgba(148,163,184,.16)_75%,transparent_75%)] bg-[length:28px_28px]" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
          
          {/* MARKER 1: POSIZIONE GPS REALE (CORAL CIRCLE + PING) */}
          {(hasFreshRemoteLocation || props.realLocation) && (
            <div
              className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center transition-all duration-300 pointer-events-none z-10"
              style={{
                transform: props.realMarkerOffset
                  ? `translate(calc(-50% + ${props.realMarkerOffset.dx}px), calc(-50% + ${props.realMarkerOffset.dy}px))`
                  : 'translate(-50%, -50%)'
              }}
            >
              {hasFreshRemoteLocation && (
                <span className="absolute w-12 h-12 rounded-full bg-[#FF6B5F]/35 animate-ping" />
              )}
              <div className="w-5 h-5 rounded-full bg-[#FF6B5F] border-3 border-white shadow-xl relative z-10 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
              <span className="mt-1 px-2 py-0.5 rounded-md bg-[#FF6B5F] text-white text-[10px] font-extrabold uppercase tracking-wider shadow-md whitespace-nowrap">
                {props.isGpsHolder ? 'Sei qui' : 'Posizione condivisa'}
              </span>
            </div>
          )}

          {/* MARKER 2: POSIZIONE PREVISTA SECONDO ITINERARIO (NAVY DIAMOND + COMPASS) */}
          {!props.isExternal && props.liveIntelligence?.plannedLocation?.coords && (
            <div
              className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center transition-all duration-300 pointer-events-none z-10"
              style={{
                transform: props.plannedMarkerOffset
                  ? `translate(calc(-50% + ${props.plannedMarkerOffset.dx}px), calc(-50% + ${props.plannedMarkerOffset.dy}px))`
                  : (hasFreshRemoteLocation || props.realLocation) ? 'translate(calc(-50% + 40px), calc(-50% - 40px))' : 'translate(-50%, -50%)'
              }}
            >
              <div className="w-6 h-6 rounded-lg rotate-45 bg-[#172033] border-2 border-white shadow-xl relative z-10 flex items-center justify-center">
                <span className="-rotate-45 text-[10px]">🗓️</span>
              </div>
              <span className="mt-1 px-2 py-0.5 rounded-md bg-[#172033] text-white text-[10px] font-extrabold tracking-wider shadow-md whitespace-nowrap border border-white/20">
                Secondo itinerario
              </span>
            </div>
          )}

          {/* OVERLAY INFORMAZIONI POSIZIONE */}
          <div className="absolute inset-x-0 bottom-0 p-5 text-white z-10">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FF6B5F]">
              {hasFreshRemoteLocation
                ? '📍 Posizione GPS in tempo reale'
                : isLeasePaused
                  ? '⏸️ Trasmissione in pausa'
                  : '🗺️ Posizione itinerario'}
            </p>
            <h3 className="text-xl sm:text-2xl font-extrabold leading-tight mt-0.5">
              {props.remoteGpsLocation?.city
                ? `${props.remoteGpsLocation.city}${props.remoteGpsLocation.country ? `, ${props.remoteGpsLocation.country}` : ''}`
                : props.location?.city || props.location?.title || 'Posizione programmata'}
            </h3>
            <p className="mt-1 text-xs text-white/80">
              {hasFreshRemoteLocation && props.remoteGpsLocation
                ? `Dispositivo guida • Aggiornato ${formatRelativeTime(props.remoteGpsLocation.updatedAt)} (±${Math.round(props.remoteGpsLocation.accuracy)}m)`
                : isLeasePaused
                  ? 'La trasmissione è stata temporaneamente sospesa dal viaggiatore.'
                  : props.location?.updateNotice || 'Nessuna trasmissione GPS attiva in questo momento.'}
            </p>
            <a
              href={props.mapSearchUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 border-b border-white/60 pb-0.5 text-xs font-bold text-white hover:text-[#FF6B5F] hover:border-[#FF6B5F] transition-colors"
            >
              <span>Vedi coordinate su Maps</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        {/* ─── LIVE INTELLIGENCE: ADESSO, PROGRAMMA E PROSSIMA TAPPA ─── */}
        {!props.isExternal && props.liveIntelligence && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
            {/* ADESSO */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#172033] border border-slate-200/90 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#FF6B5F]">
                  ADESSO
                </span>
                {props.liveIntelligence.currentEvent?.timeRange && (
                  <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                    {props.liveIntelligence.currentEvent.timeRange}
                  </span>
                )}
              </div>
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                {props.liveIntelligence.currentEvent?.title || 'Nessuna attività programmata in questo orario'}
              </h4>
              {props.liveIntelligence.currentEvent?.subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {props.liveIntelligence.currentEvent.subtitle}
                </p>
              )}
              {props.liveIntelligence.currentEvent?.transportDetails && (
                <div className="mt-2.5 text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-800/50">
                  ✈️ {props.liveIntelligence.currentEvent.transportDetails.message}
                </div>
              )}
            </div>

            {/* PROSSIMA ATTIVITÀ */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#172033] border border-slate-200/90 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  PROSSIMA ATTIVITÀ
                </span>
                {props.liveIntelligence.nextEvent?.time && (
                  <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                    {props.liveIntelligence.nextEvent.time}
                  </span>
                )}
              </div>
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                {props.liveIntelligence.nextEvent?.title || 'Nessuna attività futura registrata'}
              </h4>
              {props.liveIntelligence.nextEvent?.locationName && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  📍 {props.liveIntelligence.nextEvent.locationName}
                </p>
              )}
            </div>

            {/* CONFRONTO OPERATIVO TRA POSIZIONE REALE E PREVISTA */}
            <div className="md:col-span-2 p-3.5 rounded-2xl bg-[#F8F7F3] dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#172033] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  ⚖️
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-slate-900 dark:text-white font-bold text-xs">
                      {props.liveIntelligence.comparison ? props.liveIntelligence.comparison.label : 'Posizione prevista'}
                    </strong>
                    {props.liveIntelligence.comparison?.status === 'coincident' && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[10px]">
                        In linea
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {props.remoteGpsLocation
                      ? `GPS reale: ±${Math.round(props.remoteGpsLocation.accuracy)}m`
                      : 'Posizione reale non condivisa'}
                    {' · '}
                    Previsto: {props.liveIntelligence.plannedLocation?.title || props.liveIntelligence.plannedLocation?.locationName || 'Nessuna'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FEEDBACK E NOTIFICHE OPERATIVE */}
        {props.gpsFeedback && (
          <div className="mt-3 px-3.5 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-bold text-emerald-800 dark:text-emerald-200 animate-fade-in flex items-center gap-2">
            <span>✓</span>
            <span>{props.gpsFeedback}</span>
          </div>
        )}
        {props.gpsError && (
          <div className="mt-3 px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs font-bold text-rose-800 dark:text-rose-200 animate-fade-in flex items-center gap-2">
            <span>⚠️</span>
            <span>{props.gpsError}</span>
          </div>
        )}

        {/* ─── PANNELLO DI CONTROLLO TRASMISSIONE GPS ─────────────────── */}
        <div className="mt-4 border-b border-slate-200 dark:border-slate-700 pb-5">
          {props.isExternal ? (
            /* Vista Ospiti Esterni: trasparenza e privacy */
            <div className="rounded-xl bg-[#F8F7F3] dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700 p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-900 dark:text-white font-bold block mb-1">Privacy della trasmissione LIVE:</strong>
              Gli ospiti possono seguire la posizione quando il viaggiatore avvia esplicitamente la trasmissione. Non viene mantenuto alcuno storico permanente: le coordinate scadono e scompaiono automaticamente dopo due minuti dall'ultimo aggiornamento o all'interruzione della guida.
            </div>
          ) : (
            /* Vista Membri Autorizzati (Owner / Copilota) */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8F7F3] dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3.5 text-xs">
                <div>
                  <strong className="text-slate-900 dark:text-white font-bold">Dispositivo autorizzato: </strong>
                  <span className="text-slate-700 dark:text-slate-300">{props.deviceLabel}</span>
                  {props.remoteGpsLease && (
                    <span className="block mt-0.5 text-[11px] text-slate-500">
                      Titolare guida: <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">{props.remoteGpsLease.holderDeviceId.slice(0, 10)}…</code>
                      {' '}(Scadenza lease: {formatUpdateDate(props.remoteGpsLease.expiresAt.getTime())})
                    </span>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Il GPS rilevato resta locale e non viene trasmesso agli ospiti fino all'avvio esplicito della condivisione LIVE.
                  </p>
                </div>

                {/* BOTTONI DI CONTROLLO TRASMISSIONE */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* CASO A: Condivisione NON attiva o fermata */}
                  {isLeaseStopped && (
                    <>
                      {props.isOwner ? (
                        <button
                          type="button"
                          disabled={props.isDetectingGps || !props.online}
                          onClick={props.onStartGps}
                          className="hounigo-button-primary px-4 py-2 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <span>📡</span>
                          <span>{props.isDetectingGps ? 'Avvio in corso…' : 'Avvia condivisione LIVE'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-500 italic">
                          In attesa dell'Organizzatore per avviare la condivisione.
                        </span>
                      )}
                    </>
                  )}

                  {/* CASO B: Condivisione ATTIVA */}
                  {isLeaseActive && (
                    <>
                      {props.isGpsHolder ? (
                        <>
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onPauseGps}
                            className="hounigo-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>⏸️</span>
                            <span>Metti in pausa</span>
                          </button>
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onStopGps}
                            className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 hover:bg-rose-100 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>⏹️</span>
                            <span>Interrompi</span>
                          </button>
                        </>
                      ) : (
                        <>
                          {props.isOwner && (
                            <button
                              type="button"
                              disabled={props.isDetectingGps || !props.online}
                              onClick={props.onRevokeGps}
                              className="hounigo-button-primary px-3 py-1.5 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                            >
                              <span>🔄</span>
                              <span>Riprendi guida su questo dispositivo</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onStopGps}
                            className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 hover:bg-rose-100 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>⏹️</span>
                            <span>Interrompi</span>
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {/* CASO C: Condivisione IN PAUSA */}
                  {isLeasePaused && (
                    <>
                      {props.isOwner ? (
                        <>
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onResumeGps}
                            className="hounigo-button-primary px-3 py-1.5 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>▶️</span>
                            <span>Riprendi trasmissione</span>
                          </button>
                          <button
                            type="button"
                            disabled={props.isDetectingGps || !props.online}
                            onClick={props.onStopGps}
                            className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 hover:bg-rose-100 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>⏹️</span>
                            <span>Interrompi</span>
                          </button>
                        </>
                      ) : (
                        <>
                          {props.isGpsHolder && (
                            <button
                              type="button"
                              disabled={props.isDetectingGps || !props.online}
                              onClick={props.onStopGps}
                              className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 hover:bg-rose-100 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                            >
                              <span>⏹️</span>
                              <span>Interrompi</span>
                            </button>
                          )}
                          <span className="text-[11px] font-semibold text-slate-500 italic">
                            In pausa (la ripresa richiede l'Organizzatore).
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* SELEZIONE TRASFERIMENTO GUIDA AL COPILOTA (Solo per l'Organizzatore) */}
              {props.isOwner && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900/40 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>🤝</span>
                        <span>Trasferimento temporaneo guida GPS</span>
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Consente a un Copilota autorizzato di trasmettere la posizione dal proprio telefono senza cedere la proprietà del viaggio.
                      </p>
                    </div>

                    {eligibleCopilots.length > 0 ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={selectedCopilotDevice}
                          onChange={(e) => setSelectedCopilotDevice(e.target.value)}
                          className="hounigo-card-subtle text-xs py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="">Seleziona dispositivo copilota…</option>
                          {eligibleCopilots.map(dev => (
                            <option key={dev.deviceId} value={`${dev.uid}:::${dev.deviceId}`}>
                              {dev.label} ({dev.deviceId.slice(0, 6)}…)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!selectedCopilotDevice || props.isDetectingGps || !props.online}
                          onClick={() => {
                            const [copilotUid, copilotDeviceId] = selectedCopilotDevice.split(':::');
                            if (copilotUid && copilotDeviceId && props.onTransferGps) {
                              props.onTransferGps(copilotUid, copilotDeviceId);
                            }
                          }}
                          className="hounigo-button-primary px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                        >
                          Trasferisci guida
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Nessun dispositivo copilota online collegato in questo momento.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── 02 · DIARIO ──────────────────────────────────────────────── */}
      <section aria-labelledby="live-diary-title" className="mb-10">
        <div className="flex items-end justify-between gap-4 border-b border-slate-300 dark:border-slate-600 pb-3 mb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">02 · Diario</p>
            <h2 id="live-diary-title" className="text-xl font-extrabold text-slate-950 dark:text-white">Cartoline dal viaggio</h2>
          </div>
          <span className="text-xs text-slate-400">{props.updates.length} aggiornamenti</span>
        </div>

        <article className="border-l-2 border-[#FF6B5F] pl-4 mb-7">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold text-slate-950 dark:text-white">Messaggio dagli organizzatori</h3>
            {props.canPublish && !props.isExternal && (
              <button type="button" onClick={props.onToggleStatusEdit} className="text-xs font-bold text-[#D94F45]">
                {props.isEditingStatus ? 'Annulla' : 'Modifica'}
              </button>
            )}
          </div>
          {props.isEditingStatus ? (
            <div className="mt-3 space-y-2">
              <textarea
                rows={3}
                value={props.tempStatus}
                onChange={(event) => props.onTempStatusChange(event.target.value)}
                className="w-full hounigo-card-subtle rounded-xl p-3 text-sm resize-none"
              />
              <button type="button" onClick={props.onSaveStatus} className="hounigo-button-primary px-4 py-2 text-xs">
                Pubblica messaggio
              </button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-base leading-relaxed text-slate-700 dark:text-slate-200">“{props.statusMessage}”</p>
              <time className="mt-2 block text-[11px] text-slate-400">{props.statusUpdatedAt}</time>
            </>
          )}
        </article>

        {props.canPublish && !props.isExternal && (
          <form onSubmit={props.onSendMessage} className="mb-8 border-y border-slate-200 dark:border-slate-700 py-4">
            <div className="flex justify-between gap-2 mb-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-100">Nuovo aggiornamento pubblico</label>
              <span className="text-[10px] text-slate-400">{props.liveTextMessage.length}/500</span>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={props.liveTextMessage}
              onChange={(event) => props.onLiveTextChange(event.target.value)}
              placeholder="Un luogo, un incontro, un momento da condividere…"
              className="w-full hounigo-card-subtle rounded-xl p-3 text-sm resize-none"
            />
            {props.messageError && <p className="mt-2 text-xs font-semibold text-rose-600">{props.messageError}</p>}
            {props.messageSuccess && <p className="mt-2 text-xs font-semibold text-emerald-600">{props.messageSuccess}</p>}
            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={props.isSendingMessage || !props.liveTextMessage.trim() || !props.online}
                className="hounigo-button-primary px-4 py-2 text-xs disabled:opacity-50"
              >
                {props.isSendingMessage ? 'Pubblicazione…' : 'Pubblica nel diario'}
              </button>
            </div>
          </form>
        )}

        {props.updates.length === 0 ? (
          <div className="hounigo-empty-state py-10 text-center">
            <p className="font-bold text-slate-800 dark:text-slate-100">Il diario è ancora vuoto</p>
            <p className="mt-1 text-sm text-slate-500">Gli aggiornamenti pubblici compariranno qui, in ordine cronologico.</p>
          </div>
        ) : (
          <div className="space-y-0">
            {props.updates.map((update, index) => (
              <article key={update.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] sm:grid-cols-[7rem_minmax(0,1fr)] gap-3 sm:gap-6 pb-7">
                <time className="text-[11px] text-slate-400 pt-1">{formatUpdateDate(update.timestamp)}</time>
                <div className={`pb-7 ${index < props.updates.length - 1 ? 'border-b border-slate-200 dark:border-slate-700' : ''}`}>
                  <h3 className="text-base font-extrabold text-slate-950 dark:text-white">{update.title}</h3>
                  {update.locationName && <p className="mt-1 text-xs font-semibold text-[#D94F45]">{update.locationName}</p>}
                  {update.text && <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{update.text}</p>}
                  {update.photoUrl && (
                    <button type="button" onClick={() => setOpenPhoto({ url: update.photoUrl!, title: update.title })} className="mt-4 block w-full overflow-hidden rounded-xl">
                      <img src={update.photoUrl} alt={update.title} className="w-full max-h-[420px] object-cover" loading="lazy" />
                    </button>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {REACTIONS.map((emoji) => {
                      const selected = props.reactions[update.id] === emoji;
                      const count = (update.reactionCounts?.[emoji] || 0) + (selected ? 1 : 0);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          disabled={!props.online}
                          onClick={() => props.onReaction(update.id, emoji)}
                          className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                            selected
                              ? 'border-[#FF6B5F] bg-[#FFF0ED] text-slate-900 font-bold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {emoji}{count > 0 ? ` ${count}` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ─── 03 · INTERAZIONI ─────────────────────────────────────────── */}
      <section aria-labelledby="live-interactions-title" className="border-t border-slate-300 dark:border-slate-600 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">03 · Interazioni</p>
        <h2 id="live-interactions-title" className="text-xl font-extrabold text-slate-950 dark:text-white">Segui e partecipa</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Il link LIVE funziona senza registrazione. Gli ospiti possono leggere il diario e usare le reazioni consentite; non possono vedere documenti, prenotazioni, spese o inviare messaggi testuali.
        </p>
        <button type="button" onClick={props.onShare} className="hounigo-button-secondary mt-4 px-4 py-2.5 text-xs">
          {props.copiedLink ? 'Link copiato' : 'Copia o condividi il link ospiti'}
        </button>
      </section>

      {openPhoto && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] bg-black/90 p-4 flex items-center justify-center" onClick={() => setOpenPhoto(null)}>
          <button type="button" className="absolute top-4 right-4 text-white text-sm font-bold p-2">Chiudi ✕</button>
          <img src={openPhoto.url} alt={openPhoto.title} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
