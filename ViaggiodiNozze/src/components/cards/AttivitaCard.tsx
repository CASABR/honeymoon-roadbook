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

export default function AttivitaCard({ activity, onEdit, onDetail, onUpdate }: AttivitaCardProps) {
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

  const mapLink = activity.googleMapsUrl
    ? resolveMapUrl(activity.googleMapsUrl)
    : (activity.address || activity.location)
    ? resolveMapUrl(activity.address || activity.location)
    : '';
  const startTime = activity.orarioInizio || activity.time;
  const meetingTime = activity.orarioRitrovo;
  const hasDistinctMeetingTime = Boolean(meetingTime && startTime && meetingTime.trim() !== startTime.trim());
  const displayTime = startTime || meetingTime;

  const isTrekking = isTrekkingActivity(activity);
  const isPhotoSpot = isPhotoSpotActivity(activity);
  const heroImage = activity.attachments?.find((attachment) => attachment.type === 'image' && attachment.purpose === 'photo');
  const hikingDuration = formatHikingDuration(activity.hikingDurationMinutes) || activity.duration || null;
  const trekkingDistanceKm = getTrekkingDistanceKm(activity);
  const verifiedRoutePath = buildVerifiedRoutePath(activity);
  const displayLocation = activity.address || activity.location;

  const isMeetingDiscrepancy = Boolean(
    activity.orarioRitrovo && activity.orarioInizio && activity.orarioRitrovo > activity.orarioInizio
  );

  const hasQrOrAttachment = Boolean(
    activity.qrCode?.trim() ||
    (activity as any).ticketUrl?.trim() ||
    activity.attachments?.some((attachment) => Boolean(attachment.dataUrl?.trim())) ||
    ((activity as any).tickets && (activity as any).tickets.length > 0)
  );

  const subcategoryLabel = isTrekking
    ? 'Trekking'
    : isPhotoSpot
    ? 'Spot fotografico'
    : (getDisplaySubcategory(activity.sottocategoria) || activity.category || '');

  const headerIcon = isTrekking ? '△' : isPhotoSpot ? '📸' : '📌';

  const headerTimeSummary = hasDistinctMeetingTime
    ? `Ritrovo ${meetingTime} · Inizio ${startTime}`
    : displayTime
    ? `Ore ${displayTime}${activity.timeStatus === 'indicativo' ? ' · indicativo' : ''}`
    : '';

  return (
    <>
      <div
        onClick={onDetail || onEdit}
        data-trekking-card={isTrekking ? 'true' : undefined}
        className="hounigo-ds-card hounigo-panel cursor-pointer"
      >
        {/* 1. HEADER: CATEGORIA AZZURRO/TURCHESE, SOTTOCATEGORIA REALE, ORARIO INIZIO E RITROVO DISTINTO */}
        <div className="hounigo-ds-card-header hounigo-ds-header-attivita">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider min-w-0">
              <span aria-hidden="true">{headerIcon}</span>
              <span>Attività</span>
              {subcategoryLabel && (
                <span className="font-bold normal-case tracking-normal opacity-90">
                  · {subcategoryLabel}
                </span>
              )}
            </div>

            {headerTimeSummary && (
              <span className="font-mono text-xs sm:text-[13px] font-extrabold tabular-nums shrink-0">
                {headerTimeSummary}
              </span>
            )}
          </div>

          {isMeetingDiscrepancy && (
            <div className="pt-0.5 text-xs font-bold text-amber-900 dark:text-amber-300">
              ⚠️ Ritrovo ({activity.orarioRitrovo}) successivo all&apos;inizio ({activity.orarioInizio}) — da verificare
            </div>
          )}
        </div>

        {/* 2. BODY: TITOLO, LUOGO/INDIRIZZO ED EVENTUALI DETTAGLI OPERATIVI REALI */}
        <div className="hounigo-ds-card-body">
          <h3 className="font-extrabold text-base sm:text-[17px] leading-snug tracking-tight text-slate-900 dark:text-white break-words">
            {activity.title}
          </h3>

          {displayLocation && (
            <p className="text-xs sm:text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5" aria-hidden="true">📍</span>
              <span className="break-words">{displayLocation}</span>
            </p>
          )}

          {isTrekking && (
            <>
              {verifiedRoutePath && (
                <div data-trekking-route-preview className="relative h-20 overflow-hidden rounded-xl border border-emerald-200/80 bg-[#F4F1E8] dark:border-emerald-900/60 dark:bg-slate-900 mt-1">
                  <svg viewBox="0 0 240 80" className="h-full w-full" role="img" aria-label="Anteprima della traccia GPS verificata">
                    <path d={verifiedRoutePath} fill="none" stroke="#FF6B5F" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="absolute bottom-1.5 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800 dark:bg-slate-950/90 dark:text-emerald-300">
                    Traccia GPS verificata
                  </span>
                </div>
              )}

              {(trekkingDistanceKm || (activity.elevationGainM != null && activity.elevationGainM > 0) || hikingDuration || activity.difficulty || activity.routeType) && (
                <div className="pt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  {trekkingDistanceKm && (
                    <span>📏 Distanza: <strong className="font-extrabold">{trekkingDistanceKm.toLocaleString('it-IT')} km</strong></span>
                  )}
                  {activity.elevationGainM != null && activity.elevationGainM > 0 && (
                    <span>⛰️ Dislivello: <strong className="font-extrabold">+{activity.elevationGainM.toLocaleString('it-IT')} m</strong></span>
                  )}
                  {hikingDuration && (
                    <span>⏱️ Durata: <strong className="font-extrabold">{hikingDuration}</strong></span>
                  )}
                  {activity.difficulty && (
                    <span>🎯 Difficoltà: <strong className="font-extrabold">{activity.difficulty}</strong></span>
                  )}
                  {activity.routeType && (
                    <span>🔄 {TREKKING_ROUTE_LABELS[activity.routeType]}</span>
                  )}
                </div>
              )}
            </>
          )}

          {isPhotoSpot && (
            <>
              {heroImage && (
                <div className="relative h-36 overflow-hidden rounded-xl bg-slate-900 mt-1">
                  <img src={heroImage.dataUrl} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              {(activity.lightWindow || activity.photoSubject) && (
                <div className="pt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {activity.lightWindow && (
                    <span>☀️ Luce: <strong>{PHOTO_LIGHT_LABELS[activity.lightWindow]}</strong></span>
                  )}
                  {activity.photoSubject && (
                    <span>🎯 Soggetto: <strong>{activity.photoSubject}</strong></span>
                  )}
                </div>
              )}
            </>
          )}

          {!isTrekking && !isPhotoSpot && (activity.duration || activity.endDate || (activity.originLocation && activity.destinationLocation)) && (
            <div className="pt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-[13px] font-semibold text-slate-800 dark:text-slate-200">
              {activity.duration && (
                <span>⏱️ Durata: <strong className="font-extrabold text-slate-950 dark:text-white">{activity.duration}</strong></span>
              )}
              {activity.endDate && (
                <span>📅 Fino al {formatDateIT(activity.endDate)}</span>
              )}
              {activity.originLocation && activity.destinationLocation && (
                <span>🚶 Percorso: {activity.originLocation} → {activity.destinationLocation}</span>
              )}
            </div>
          )}

          {activity.openingHours && activity.openingHours.verifiedAt && activity.openingHours.status !== 'unverified' && (
            <OpeningHoursBadge info={activity.openingHours} date={activity.date} time={displayTime} />
          )}

          {hasCopilotNotes && (
            <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
              {copilotNotes.trim()}
            </p>
          )}

          {childTappe.length > 0 && (
            <div
              className="pt-1.5 border-t border-slate-100 dark:border-slate-700/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  🚶 {childTappe.length} {childTappe.length === 1 ? 'tappa nella passeggiata' : 'tappe nella passeggiata'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <span>{isExpanded ? 'Riduci' : 'Mostra tappe'}</span>
                  <span>{isExpanded ? '▲' : '▼'}</span>
                </button>
              </div>

              {isExpanded && (
                <div className="mt-1.5 space-y-1 pl-2.5 border-l-2 border-emerald-400 dark:border-emerald-600">
                  {childTappe.map(tappa => (
                    <div
                      key={tappa.id}
                      className="py-1 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300 mr-1.5">
                          {tappa.orario || (tappa as any).time || '--:--'}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">{tappa.titolo}</span>
                      </div>
                      {(tappa.mapsUrl || tappa.indirizzo || tappa.titolo) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = resolveMapUrl(tappa.mapsUrl || tappa.indirizzo || tappa.titolo);
                            if (url) window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                          className="text-xs font-bold text-slate-700 dark:text-slate-200 hover:underline shrink-0 cursor-pointer"
                        >
                          📍 Maps
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. FOOTER: PREZZO E PAGAMENTO A SINISTRA, BIGLIETTI/QR E MAPS A DESTRA */}
        <div className="hounigo-ds-card-footer">
          <div className="flex items-center gap-2 flex-wrap">
            {isPhotoSpot ? null : isFree ? (
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Gratuito
              </span>
            ) : costNum > 0 ? (
              <>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {displayText}
                </span>
                {!isTrekking && (
                  <button
                    type="button"
                    onClick={handleTogglePayment}
                    className={`inline-flex items-center text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                      isPaid
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-700'
                    }`}
                    title="Clicca per invertire stato: Saldato / Da saldare"
                  >
                    {isPaid ? '✓ Saldato' : '⏳ Da saldare'}
                  </button>
                )}
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            {!isPhotoSpot && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTicketsOpen(true);
                }}
                className={`hounigo-ds-action-btn ${hasQrOrAttachment ? 'hounigo-ds-action-btn-highlight' : ''}`}
                title="Biglietti e QR / Voucher"
              >
                <span>🎫</span>
                <span>Biglietti / QR</span>
              </button>
            )}

            {activity.link && (
              <a
                href={activity.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hounigo-ds-action-btn"
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
                className="hounigo-ds-action-btn"
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
