import { useState, useEffect } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import type { Attivita, Tappa } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';
import AttivitaTicketsModal from '../modals/AttivitaTicketsModal';
import QRCodeModal from '../modals/QRCodeModal';
import { formatDateIT } from '../../utils/tripDates';
import { processFileForAttachment } from '../../utils/fileAttachment';
import { formatHikingDuration, isPhotoSpotActivity, isTrekkingActivity, isPasseggiataActivity, getDisplaySubcategory, PHOTO_LIGHT_LABELS, TREKKING_ROUTE_LABELS } from '../../utils/activityType';
import OpeningHoursBadge from '../common/OpeningHoursBadge';
import { useDeviceRole } from '../../utils/useDeviceRole';

interface AttivitaCardProps {
  activity: Attivita;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Attivita) => void;
  variant?: 'compact' | 'full';
}

function buildVerifiedRoutePath(activity: Attivita): string | null {
  const points = activity.routePreview?.verified
    ? activity.routePreview.coordinates.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    : [];
  if (points.length < 2) return null;

  const latitudes = points.map(point => point.lat);
  const longitudes = points.map(point => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latRange = Math.max(maxLat - minLat, 0.000001);
  const lngRange = Math.max(maxLng - minLng, 0.000001);

  return points.map((point, index) => {
    const x = 12 + ((point.lng - minLng) / lngRange) * 216;
    const y = 68 - ((point.lat - minLat) / latRange) * 56;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function getTrekkingDistanceKm(activity: Attivita): number | null {
  if (activity.distanceKm != null && activity.distanceKm > 0) return activity.distanceKm;
  const legacyText = `${activity.notes || ''} ${activity.noteCopilota || ''}`;
  const match = legacyText.match(/\b(\d{1,3}(?:[.,]\d+)?)\s*km\b/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function AttivitaCard({ activity, onEdit, onDetail, onUpdate, variant = 'full' }: AttivitaCardProps) {
  const { role } = useDeviceRole();
  const isExternalLiveView = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('live') === '1' ||
    new URLSearchParams(window.location.search).get('live') === 'true' ||
    new URLSearchParams(window.location.search).get('view') === 'live' ||
    (window.location.hash || '').toLowerCase().includes('live')
  );
  const canSeePrivateInfo = !isExternalLiveView && (role === 'guida' || role === 'copilota');

  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const initialCopilot = (activity as any).noteCopilota || (activity as any).notes || '';
  const [copilotNotes, setCopilotNotes] = useState<string>(initialCopilot);
  const [isExpanded, setIsExpanded] = useState(false);
  const [childTappe, setChildTappe] = useState<Tappa[]>(activity.childTappe || []);

  useEffect(() => {
    const nextNotes = (activity as any).noteCopilota || (activity as any).notes || '';
    setCopilotNotes(nextNotes);
  }, [activity]);

  useEffect(() => {
    if (activity.childTappe) {
      setChildTappe(activity.childTappe);
    } else if (activity.id && (activity.sottocategoria === 'Passeggiata' || isPasseggiataActivity(activity))) {
      storageService.getTappe().then(tappe => {
        const linked = tappe.filter(t => t.passeggiataId === activity.id);
        setChildTappe(linked);
      }).catch(() => {});
    }
  }, [activity]);

  const hasCopilotNotes = Boolean(copilotNotes.trim());
  const isCompact = variant === 'compact';

  const paymentInfo = resolvePaymentInfo({
    cost: activity.cost,
    depositPaid: (activity as any).depositPaid || (activity as any).amountPaid,
    paymentStatus: activity.paymentStatus,
    status: activity.status,
    completed: (activity as any).completed
  });

  const { isFree, isPaid, costNum, displayText } = paymentInfo;

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFree) return;
    try {
      const newStatus = isPaid ? 'da_saldare' : 'saldato';
      const updated = {
        ...activity,
        paymentStatus: newStatus,
        status: newStatus === 'saldato' ? 'prenotato' : 'da_valutare',
        amountPaid: newStatus === 'saldato' ? (activity.cost || `${costNum.toFixed(2)} €`) : '0',
        updatedAt: Date.now()
      } as any;
      await storageService.saveActivity(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'attivita', data: updated } }));
    } catch (e) { console.error(e); }
  };

  const [isTicketsOpen, setIsTicketsOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  const icon = '📌';

  const mapLink = activity.googleMapsUrl
    ? resolveMapUrl(activity.googleMapsUrl)
    : activity.location
    ? resolveMapUrl(activity.location)
    : '';
  const startTime = activity.orarioInizio || activity.time;
  const meetingTime = activity.orarioRitrovo;
  const hasDistinctMeetingTime = Boolean(meetingTime && startTime && meetingTime.trim() !== startTime.trim());
  const displayTime = startTime || meetingTime;

  const isTrekking = isTrekkingActivity(activity);
  const isPhotoSpot = isPhotoSpotActivity(activity);
  const heroImage = activity.attachments?.find((attachment) => attachment.type === 'image' && attachment.purpose === 'photo');
  const hikingDuration = formatHikingDuration(activity.hikingDurationMinutes) || activity.duration || null;
  const trekkingPrice = activity.cost?.trim() && !isFree
    ? `${activity.cost.trim()} ${activity.currency || 'EUR'}`
    : isFree ? 'Gratuito' : null;
  const trekkingDistanceKm = getTrekkingDistanceKm(activity);
  const trekkingMetrics = [
    trekkingDistanceKm ? ['Distanza', `${trekkingDistanceKm.toLocaleString('it-IT')} km`] : null,
    activity.elevationGainM != null && activity.elevationGainM > 0 ? ['Dislivello', `+${activity.elevationGainM.toLocaleString('it-IT')} m`] : null,
    hikingDuration ? ['Durata', hikingDuration] : null
  ].filter((metric): metric is string[] => Boolean(metric));
  const verifiedRoutePath = buildVerifiedRoutePath(activity);
  const trekkingStartPoint = activity.address || activity.location;

  const isMeetingDiscrepancy = Boolean(
    activity.orarioRitrovo && activity.orarioInizio && activity.orarioRitrovo > activity.orarioInizio
  );

  const hasQrOrAttachment = Boolean(
    activity.qrCode?.trim() ||
    (activity as any).ticketUrl?.trim() ||
    activity.attachments?.some((attachment) => Boolean(attachment.dataUrl?.trim())) ||
    ((activity as any).tickets && (activity as any).tickets.length > 0)
  );

  return (
    <>
      <div
        onClick={onDetail || onEdit}
        data-trekking-card={isTrekking ? 'true' : undefined}
        className={`hounigo-panel cursor-pointer rounded-2xl hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] dark:bg-slate-800 dark:border-slate-700 ${
          isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'
        }`}
      >
        {isTrekking ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5 dark:border-slate-700 flex-wrap">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800">
                  <span aria-hidden="true">△</span> Trekking
                </span>
                {hasDistinctMeetingTime ? (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-extrabold bg-rose-50 text-rose-800 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                      🚩 Ritrovo {meetingTime}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-bold ${
                      activity.timeStatus === 'indicativo'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                    }`}>
                      ⏱️ Inizio {startTime} {activity.timeStatus === 'indicativo' ? '· indicativo' : ''}
                    </span>
                  </>
                ) : displayTime ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-bold ${
                    activity.timeStatus === 'indicativo'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                  }`}>
                    ⏰ Ore {displayTime} {activity.timeStatus === 'indicativo' ? '· indicativo' : ''}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setIsCopilotOpen(true); }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  hasCopilotNotes
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                    : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                }`}
                title={hasCopilotNotes ? 'Note Copilota presenti' : 'Aggiungi note Copilota'}
              >
                <span>🧭</span>
                <span>Note</span>
              </button>
            </div>

            {verifiedRoutePath && (
              <div data-trekking-route-preview className="relative h-24 overflow-hidden rounded-xl border border-emerald-200/80 bg-[#F4F1E8] dark:border-emerald-900/60 dark:bg-slate-900">
                <svg viewBox="0 0 240 80" className="h-full w-full" role="img" aria-label="Anteprima della traccia GPS verificata">
                  <path d="M0 18H240M0 40H240M0 62H240M48 0V80M96 0V80M144 0V80M192 0V80" stroke="currentColor" strokeWidth="0.6" className="text-slate-300 dark:text-slate-700" />
                  <path d={verifiedRoutePath} fill="none" stroke="#FF6B5F" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800 shadow-sm dark:bg-slate-950/90 dark:text-emerald-300">Traccia GPS verificata</span>
              </div>
            )}

            <div>
              <h3 className={`font-brand-title text-base sm:text-lg font-extrabold leading-snug tracking-tight text-slate-900 dark:text-white ${activity.completed ? 'opacity-90' : ''}`}>
                {activity.title}
              </h3>

              {trekkingMetrics.length > 0 && (
                <div className="mt-2.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${trekkingMetrics.length}, minmax(0, 1fr))` }}>
                  {trekkingMetrics.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-xl bg-[#F8F7F3] px-2.5 py-2 dark:bg-slate-700/70 border border-slate-200/60 dark:border-slate-600/60">
                      <span className="block truncate text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
                      <strong className="mt-0.5 block break-words text-xs sm:text-sm font-black leading-tight text-slate-900 dark:text-white">{value}</strong>
                    </div>
                  ))}
                </div>
              )}

              {(activity.difficulty || activity.routeType) && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {activity.difficulty && <span className="rounded-full bg-[#FFF0ED] px-2.5 py-1 text-xs font-extrabold text-[#C84D43] dark:bg-[#FF6B5F]/20 dark:text-[#ff9a90]">{activity.difficulty}</span>}
                  {activity.routeType && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">{TREKKING_ROUTE_LABELS[activity.routeType]}</span>}
                </div>
              )}

              {trekkingStartPoint && (
                <p className="mt-2.5 flex min-w-0 items-start gap-1.5 text-xs sm:text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  <span aria-hidden="true">📍</span>
                  <span className="min-w-0 break-words">
                    <strong className="text-slate-900 dark:text-white">Punto partenza:</strong> {trekkingStartPoint}
                  </span>
                </p>
              )}
            </div>
          </>
        ) : isPhotoSpot ? (
          <>
            <div className="relative h-40 sm:h-48 overflow-hidden rounded-xl bg-slate-900">
              {heroImage ? (
                <img src={heroImage.dataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-indigo-950 via-slate-800 to-[#FF6B5F]">
                  <svg viewBox="0 0 320 180" className="h-full w-full opacity-80" aria-hidden="true">
                    <path d="M0 150 72 74l42 40 58-75 148 111v30H0Z" fill="rgba(255,255,255,.12)" />
                    <path d="m0 166 92-56 38 25 60-44 130 75v14H0Z" fill="rgba(255,255,255,.13)" />
                  </svg>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/25" />
              <div className="absolute left-3 top-3 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-slate-950/70 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white backdrop-blur-md">
                  📸 Spot fotografico
                </span>
                {displayTime && (
                  <span className={`rounded-full border px-2.5 py-1 font-mono text-xs font-bold backdrop-blur-md ${
                    activity.timeStatus === 'indicativo'
                      ? 'bg-amber-950/80 text-amber-200 border-amber-500/40'
                      : 'border-white/20 bg-slate-950/70 text-white'
                  }`}>
                    ⏰ Ore {displayTime} {activity.timeStatus === 'indicativo' ? '· indicativo' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setIsCopilotOpen(true); }}
                className={`absolute right-3 top-3 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold backdrop-blur-md cursor-pointer ${
                  hasCopilotNotes ? 'bg-emerald-500/85 text-white border-white/30' : 'bg-slate-950/65 text-white/90 border-white/20'
                }`}
                title={hasCopilotNotes ? 'Note Copilota presenti' : 'Aggiungi note Copilota'}
              >
                <span>🧭</span>
                <span>Note</span>
              </button>
            </div>
            <div>
              <h3 className={`font-brand-title text-base sm:text-lg font-extrabold leading-snug tracking-tight text-slate-900 dark:text-white ${activity.completed ? 'opacity-90' : ''}`}>
                {activity.title}
              </h3>
              {activity.location && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs sm:text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  <span aria-hidden="true">📍</span>
                  <span className="break-words">{activity.location}</span>
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  {PHOTO_LIGHT_LABELS[activity.lightWindow || 'qualsiasi']}
                </span>
                {activity.photoSubject && (
                  <span className="rounded-full bg-[#FFF0ED] px-3 py-1 text-xs font-bold text-[#C84D43] dark:bg-[#FF6B5F]/20 dark:text-[#ff9a90]">
                    {activity.photoSubject}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ATTIVITÀ STANDARD / ESCURSIONE / VISITA GUIDATA / PASSEGGIATA */
          <>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-700 gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200/80 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30 text-xs font-bold uppercase tracking-wider">
                  <span>{icon}</span> Attività
                </span>
                {(activity.sottocategoria || activity.category) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/80 dark:text-slate-200 dark:border-slate-600 text-xs font-bold">
                    <span>{activity.sottocategoria === 'Passeggiata' ? '🚶' : '🎯'}</span>
                    <span>{getDisplaySubcategory(activity.sottocategoria) || activity.category}</span>
                  </span>
                )}
                {activity.duration && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs font-semibold">
                    ⏱️ {activity.duration}
                  </span>
                )}
                {activity.endDate && (
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    • fino al {formatDateIT(activity.endDate)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setIsCopilotOpen(true); }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  hasCopilotNotes
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                }`}
                title={hasCopilotNotes ? 'Note Copilota presenti' : 'Aggiungi note Copilota'}
              >
                <span>🧭</span>
                <span>Note</span>
              </button>
            </div>

            <div className="space-y-2">
              <h3 className={`font-extrabold text-base sm:text-lg leading-snug tracking-tight text-slate-900 dark:text-white ${activity.completed ? 'opacity-90' : ''}`}>
                {activity.title}
              </h3>

              {/* ORARI OPERATIVI: RITROVO DISTINTO DALL'INIZIO QUANDO PRESENTI */}
              <div className="flex items-center gap-2 flex-wrap">
                {hasDistinctMeetingTime ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 font-mono text-xs font-extrabold bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800">
                      <span>🚩</span>
                      <span>Ritrovo: ore {meetingTime}</span>
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 font-mono text-xs font-bold border ${
                      activity.timeStatus === 'indicativo'
                        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600'
                    }`}>
                      <span>⏱️</span>
                      <span>Inizio: ore {startTime}{activity.timeStatus === 'indicativo' ? ' · indicativo' : ''}</span>
                    </span>
                  </>
                ) : displayTime ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 font-mono text-xs font-bold border ${
                    activity.timeStatus === 'indicativo'
                      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600'
                  }`}>
                    <span>⏰</span>
                    <span>
                      {activity.status === 'prenotato' && activity.orarioRitrovo
                        ? `Ritrovo ore ${displayTime}`
                        : activity.timeStatus === 'indicativo'
                        ? `Ore ${displayTime} · indicativo`
                        : `Ore ${displayTime}`}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                    ⏰ Orario non indicato
                  </span>
                )}
              </div>

              {/* Segnalazione Discrepanza Ritrovo / Inizio */}
              {isMeetingDiscrepancy && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-xl">
                  <span>⚠️</span>
                  <span>Ritrovo ({activity.orarioRitrovo}) successivo all'inizio ({activity.orarioInizio}) — da verificare</span>
                </div>
              )}

              {/* LUOGO / PUNTO DI RITROVO */}
              {activity.location && (
                <p className="text-xs sm:text-[13px] font-medium leading-relaxed text-slate-700 dark:text-slate-200 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">📍</span>
                  <span className="break-words">{activity.location}</span>
                </p>
              )}

              {activity.originLocation && activity.destinationLocation && (
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60 px-2.5 py-1 rounded-xl w-fit">
                  🚶 Percorso: {activity.originLocation} ➔ {activity.destinationLocation}
                </p>
              )}

              {/* Sezione Contenitore Passeggiata & Tappe Subordinate */}
              {childTappe.length > 0 && (
                <div
                  className="pt-2 border-t border-slate-100 dark:border-slate-700/60"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-extrabold border border-emerald-200 dark:border-emerald-800">
                      <span>🚶</span> {childTappe.length} {childTappe.length === 1 ? 'tappa nella passeggiata' : 'tappe nella passeggiata'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Riduci tappe' : 'Mostra tappe'}</span>
                      <span>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 pl-2.5 border-l-2 border-emerald-400 dark:border-emerald-600">
                      {childTappe.map(tappa => (
                        <div
                          key={tappa.id}
                          className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl flex items-center justify-between gap-2 text-xs hover:bg-emerald-50/50 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-600">
                                ⏰ {tappa.orario || (tappa as any).time || '--:--'}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{tappa.titolo}</span>
                            </div>
                            {tappa.indirizzo && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5 pl-0.5">
                                📍 {tappa.indirizzo}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {(tappa.mapsUrl || tappa.indirizzo || tappa.titolo) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const url = resolveMapUrl(tappa.mapsUrl || tappa.indirizzo || tappa.titolo);
                                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                }}
                                className="px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-600 rounded-lg transition-colors cursor-pointer"
                                title="Apri in Google Maps"
                              >
                                📍 Maps
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {activity.openingHours && activity.openingHours.verifiedAt && activity.openingHours.status !== 'unverified' && (
          <div>
            <OpeningHoursBadge info={activity.openingHours} date={activity.date} time={displayTime} />
          </div>
        )}

        {/* FOOTER: PREZZO / STATO PAGAMENTO A SINISTRA, AZIONI CHIARE A DESTRA */}
        <div className="mt-0.5 pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {isTrekking ? (
              trekkingPrice && <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg">{trekkingPrice}</span>
            ) : isPhotoSpot ? null : isFree ? (
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg">
                Gratuito
              </span>
            ) : costNum > 0 ? (
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg tabular-nums">
                {displayText}
              </span>
            ) : null}

            {!isTrekking && !isPhotoSpot && !isFree && costNum > 0 && (
              <button
                type="button"
                onClick={handleTogglePayment}
                className={`cursor-pointer transition-all text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border shadow-2xs ${
                  isPaid
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-700'
                }`}
                title="Clicca per invertire stato: Saldato / Da saldare"
              >
                {isPaid ? '✓ Saldato' : '⏳ Da saldare'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap ml-auto">
            {!isPhotoSpot && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTicketsOpen(true);
                }}
                className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer border ${
                  hasQrOrAttachment
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 dark:border-slate-600'
                }`}
                title="Biglietti e QR / Voucher"
              >
                <span>🎫</span>
                <span>Voucher / QR</span>
              </button>
            )}

            {activity.link && (
              <a
                href={activity.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-bold transition-colors"
                title="Sito ufficiale / Prenotazione"
              >
                <span>🌐</span>
                <span>{isTrekking ? 'Traccia' : 'Sito'}</span>
              </a>
            )}

            {mapLink && (
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-bold transition-colors"
                title="Apri su Google Maps"
              >
                <span>📍</span>
                <span>Maps</span>
              </a>
            )}
          </div>
        </div>
      </div>

      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={activity.title || 'Dettaglio'}
        noteCopilota={copilotNotes}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated = { ...activity, noteCopilota: clean, updatedAt: Date.now() } as any;
            await storageService.saveActivity(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'attivita', data: updated } }));
            setIsCopilotOpen(false);
          } catch (e) { console.error(e); }
        }}
      />
      <AttivitaTicketsModal
        isOpen={isTicketsOpen}
        onClose={() => setIsTicketsOpen(false)}
        activity={activity}
        onUpdateActivity={onUpdate}
      />
      {activity.qrCode && canSeePrivateInfo && (
        <QRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          code={activity.qrCode}
          title={activity.title}
          subtitle="Pass / Biglietto"
          onFilesSelected={async (files) => {
            try {
              const currentAtts = activity.attachments || [];
              const added = [];
              for (const f of files) {
                added.push(await processFileForAttachment(f));
              }
              const updated = {
                ...activity,
                attachments: [...currentAtts, ...added],
                updatedAt: Date.now()
              };
              await storageService.saveActivity(updated);
              if (typeof onUpdate === 'function') onUpdate(updated);
              window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
                detail: { action: 'update', entityType: 'attivita', data: updated }
              }));
            } catch (e) {
              console.error('Errore drop file su QR code in AttivitaCard:', e);
            }
          }}
        />
      )}
    </>
  );
}
