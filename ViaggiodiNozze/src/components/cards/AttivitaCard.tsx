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
  onDuplicate?: () => void;
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
    ? `${meetingTime} → ${startTime}`
    : displayTime
    ? `Ore ${displayTime}${activity.timeStatus === 'indicativo' ? ' · ind.' : ''}`
    : '';

  return (
    <>
      <div
        onClick={onDetail || onEdit}
        data-trekking-card={isTrekking ? 'true' : undefined}
        className="hounigo-ds-card hounigo-ds-cat-attivita cursor-pointer"
      >
        {/* 1. HEADER: TARGA CATEGORIA OTTANIO/TURCHESE E CARTELLINO ORARIO */}
        <div className="hounigo-ds-card-header hounigo-ds-header-attivita">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider min-w-0 truncate">
              <span aria-hidden="true" className="text-xs">{headerIcon}</span>
              <span>Attività</span>
              {subcategoryLabel && (
                <>
                  <span className="opacity-45">·</span>
                  <span className="font-bold tracking-wide truncate">
                    {subcategoryLabel}
                  </span>
                </>
              )}
            </div>

            {headerTimeSummary && (
              <span className="hounigo-ds-time-stamp">
                {headerTimeSummary}
              </span>
            )}
          </div>

          {isMeetingDiscrepancy && (
            <div className="hounigo-ds-header-subrow text-amber-900 dark:text-amber-300">
              <span>
                ATTENZIONE: Ritrovo ({activity.orarioRitrovo}) successivo all&apos;inizio ({activity.orarioInizio}) — da verificare
              </span>
            </div>
          )}
        </div>

        {/* 2. BODY: TITOLO, TRACCIATO LUOGO/RITROVO E CASELLARIO OPERATIVO */}
        <div className="hounigo-ds-card-body">
          <h3 className="font-extrabold text-base sm:text-[17px] leading-snug tracking-tight text-slate-900 dark:text-white break-words">
            {activity.title}
          </h3>

          {(displayLocation || (activity.originLocation && activity.destinationLocation)) && (
            <div className="hounigo-ds-route-track">
              {activity.originLocation && activity.destinationLocation ? (
                <>
                  <div className="hounigo-ds-route-stop">
                    <span className="hounigo-ds-route-kicker">Da</span>
                    <span className="font-bold text-slate-900 dark:text-white break-words">
                      {activity.originLocation}
                    </span>
                  </div>
                  <div className="hounigo-ds-route-stop hounigo-ds-route-stop-end">
                    <span className="hounigo-ds-route-kicker">A</span>
                    <span className="font-bold text-slate-900 dark:text-white break-words">
                      {activity.destinationLocation}
                    </span>
                  </div>
                </>
              ) : (
                <div className="hounigo-ds-route-stop hounigo-ds-route-stop-end">
                  <span className="hounigo-ds-route-kicker">
                    {hasDistinctMeetingTime ? 'Ritrovo' : 'Luogo'}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                    {displayLocation}
                  </span>
                </div>
              )}
            </div>
          )}

          {isTrekking && (
            <>
              {verifiedRoutePath && (
                <div data-trekking-route-preview className="relative h-20 overflow-hidden rounded-lg border border-emerald-200/80 bg-[#F4F1E8] dark:border-emerald-900/60 dark:bg-slate-900 mt-0.5">
                  <svg viewBox="0 0 240 80" className="h-full w-full" role="img" aria-label="Anteprima della traccia GPS verificata">
                    <path d={verifiedRoutePath} fill="none" stroke="#FF6B5F" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="absolute bottom-1.5 left-2 rounded bg-white/95 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-900 dark:bg-slate-950/90 dark:text-emerald-300">
                    Traccia GPS verificata
                  </span>
                </div>
              )}

              {(trekkingDistanceKm || (activity.elevationGainM != null && activity.elevationGainM > 0) || hikingDuration || activity.difficulty || activity.routeType) && (
                <div className="hounigo-ds-spec-grid">
                  {trekkingDistanceKm && (
                    <div className="hounigo-ds-spec-cell">
                      <span className="hounigo-ds-spec-label">Distanza</span>
                      <span className="hounigo-ds-spec-value font-mono">{trekkingDistanceKm.toLocaleString('it-IT')} km</span>
                    </div>
                  )}
                  {activity.elevationGainM != null && activity.elevationGainM > 0 && (
                    <div className="hounigo-ds-spec-cell">
                      <span className="hounigo-ds-spec-label">Dislivello</span>
                      <span className="hounigo-ds-spec-value font-mono">+{activity.elevationGainM.toLocaleString('it-IT')} m</span>
                    </div>
                  )}
                  {hikingDuration && (
                    <div className="hounigo-ds-spec-cell">
                      <span className="hounigo-ds-spec-label">Durata</span>
                      <span className="hounigo-ds-spec-value font-mono">{hikingDuration}</span>
                    </div>
                  )}
                  {activity.difficulty && (
                    <div className="hounigo-ds-spec-cell">
                      <span className="hounigo-ds-spec-label">Difficoltà</span>
                      <span className="hounigo-ds-spec-value">{activity.difficulty}</span>
                    </div>
                  )}
                  {activity.routeType && (
                    <div className="hounigo-ds-spec-cell">
                      <span className="hounigo-ds-spec-label">Tracciato</span>
                      <span className="hounigo-ds-spec-value">{TREKKING_ROUTE_LABELS[activity.routeType]}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {isPhotoSpot && (
            <>
              {heroImage && (
                <div className="relative h-36 overflow-hidden rounded-lg bg-slate-900 mt-0.5">
                  <img src={heroImage.dataUrl} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              {(activity.lightWindow || activity.photoSubject) && (
                <div className="hounigo-ds-spec-grid">
                  {activity.lightWindow && (
                    <div className="hounigo-ds-spec-cell">
                      <span className="hounigo-ds-spec-label">Finestra luce</span>
                      <span className="hounigo-ds-spec-value">{PHOTO_LIGHT_LABELS[activity.lightWindow]}</span>
                    </div>
                  )}
                  {activity.photoSubject && (
                    <div className="hounigo-ds-spec-cell">
                      <span className="hounigo-ds-spec-label">Soggetto</span>
                      <span className="hounigo-ds-spec-value">{activity.photoSubject}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!isTrekking && !isPhotoSpot && (hasDistinctMeetingTime || activity.duration || activity.endDate) && (
            <div className="hounigo-ds-spec-grid">
              {hasDistinctMeetingTime && (
                <div className="hounigo-ds-spec-cell">
                  <span className="hounigo-ds-spec-label">Orario ritrovo</span>
                  <span className="hounigo-ds-spec-value font-mono">{meetingTime}</span>
                </div>
              )}
              {hasDistinctMeetingTime && startTime && (
                <div className="hounigo-ds-spec-cell">
                  <span className="hounigo-ds-spec-label">Inizio attività</span>
                  <span className="hounigo-ds-spec-value font-mono">{startTime}</span>
                </div>
              )}
              {activity.duration && (
                <div className="hounigo-ds-spec-cell">
                  <span className="hounigo-ds-spec-label">Durata prevista</span>
                  <span className="hounigo-ds-spec-value font-mono">{activity.duration}</span>
                </div>
              )}
              {activity.endDate && (
                <div className="hounigo-ds-spec-cell">
                  <span className="hounigo-ds-spec-label">Validità</span>
                  <span className="hounigo-ds-spec-value font-mono">Fino al {formatDateIT(activity.endDate)}</span>
                </div>
              )}
            </div>
          )}

          {activity.openingHours && activity.openingHours.verifiedAt && activity.openingHours.status !== 'unverified' && (
            <OpeningHoursBadge info={activity.openingHours} date={activity.date} time={displayTime} />
          )}

          {hasCopilotNotes && (
            <p className="hounigo-ds-note line-clamp-2">
              {copilotNotes.trim()}
            </p>
          )}

          {childTappe.length > 0 && (
            <div
              className="pt-1.5 border-t border-slate-200/80 dark:border-slate-700/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  {childTappe.length} {childTappe.length === 1 ? 'tappa nella passeggiata' : 'tappe nella passeggiata'}
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
                <div className="mt-1.5 space-y-1 pl-2.5 border-l-2 border-emerald-500 dark:border-emerald-600">
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
                          Maps ↗
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. FOOTER: TAGLIANDO STATO ECONOMICO & AZIONI OPERATIVE */}
        <div className="hounigo-ds-card-footer">
          <div className="flex items-center gap-2 flex-wrap">
            {isPhotoSpot ? null : isFree ? (
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Gratuito
              </span>
            ) : costNum > 0 ? (
              <>
                <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {displayText}
                </span>
                {!isTrekking && (
                  <button
                    type="button"
                    onClick={handleTogglePayment}
                    className={`hounigo-ds-pay-badge ${
                      isPaid ? 'hounigo-ds-pay-saldato' : 'hounigo-ds-pay-dasaldare'
                    }`}
                    title="Clicca per invertire stato: Saldato / Da saldare"
                  >
                    {isPaid ? '✓ Saldato' : 'Da saldare'}
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
                <span>{isTrekking ? 'Traccia ↗' : 'Sito ↗'}</span>
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
                <span>Maps ↗</span>
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
