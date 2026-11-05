import { createPortal } from 'react-dom';
import React, { useState } from 'react';
import type { Trasporto, TipoTrasporto, TransportSegmentContext } from '../../types';
import TrasportoTicketsModal from '../modals/TrasportoTicketsModal';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import TrasportoBagagliModal from '../modals/TrasportoBagagliModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { getTransportMapTargets } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';
import { formatDateIT } from '../../utils/tripDates';
import { useDeviceRole } from '../../utils/useDeviceRole';

export interface TrasportoCardProps {
  transport: Trasporto;
  variant?: 'full' | 'compact' | 'standard';
  contextDate?: string;
  segmentContext?: TransportSegmentContext;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onDuplicate?: () => void;
  onUpdate?: (updated: Trasporto) => void;
}

export type CheckinStatus = 'open' | 'closing_soon' | 'closed' | 'scheduled' | 'unknown';

export interface CheckinDisplayInfo {
  cutoffTime?: string;
  airportArrivalTime?: string;
  notice?: string;
  status?: CheckinStatus;
  statusBadge?: {
    label: string;
    tone: string;
    icon: string;
  };
}

export function getCheckinDisplayInfo(transport: Trasporto): CheckinDisplayInfo {
  const isFlight = transport.type === 'volo';
  const isFerry = transport.type === 'traghetto';

  if (transport.checkinCutoff && transport.checkinCutoff.trim()) {
    const raw = transport.checkinCutoff.trim();
    let recommendedAirport: string | undefined;
    if (isFlight && transport.departureTime && /^\d{1,2}:\d{2}$/.test(transport.departureTime.trim())) {
      const [h, m] = transport.departureTime.trim().split(':').map(Number);
      const depTotalMin = h * 60 + m;
      const airportMin = (depTotalMin - 180 + 24 * 60) % (24 * 60);
      const airportH = String(Math.floor(airportMin / 60)).padStart(2, '0');
      const airportM = String(airportMin % 60).padStart(2, '0');
      recommendedAirport = `${airportH}:${airportM}`;
    }
    return {
      cutoffTime: raw,
      airportArrivalTime: recommendedAirport,
      status: 'scheduled',
      notice: isFerry ? `Imbarco entro: ${raw}` : `Chiusura check-in: ${raw}`,
      statusBadge: {
        label: isFerry ? 'Imbarco' : 'Chiusura check-in',
        tone: 'text-amber-800 dark:text-amber-200 bg-amber-500/10 border-amber-500/25',
        icon: '⏱️'
      }
    };
  }

  if (!isFlight && !isFerry) {
    return {};
  }

  if (isFlight && transport.departureTime && /^\d{1,2}:\d{2}$/.test(transport.departureTime.trim())) {
    const [h, m] = transport.departureTime.trim().split(':').map(Number);
    const depTotalMin = h * 60 + m;

    const cutoffMin = (depTotalMin - 60 + 24 * 60) % (24 * 60);
    const cutoffH = String(Math.floor(cutoffMin / 60)).padStart(2, '0');
    const cutoffM = String(cutoffMin % 60).padStart(2, '0');
    const calculatedCutoff = `${cutoffH}:${cutoffM}`;

    const airportMin = (depTotalMin - 180 + 24 * 60) % (24 * 60);
    const airportH = String(Math.floor(airportMin / 60)).padStart(2, '0');
    const airportM = String(airportMin % 60).padStart(2, '0');
    const recommendedAirport = `${airportH}:${airportM}`;

    let status: CheckinStatus = 'scheduled';
    let statusBadge = {
      label: 'Programmato',
      tone: 'text-amber-900 dark:text-amber-200 bg-amber-500/10 border-amber-500/20',
      icon: '⏱️'
    };

    if (typeof window !== 'undefined' && transport.date) {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        if (transport.date === todayStr) {
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          if (nowMin >= cutoffMin && nowMin < depTotalMin) {
            status = 'closed';
            statusBadge = {
              label: 'Check-in chiuso',
              tone: 'text-rose-800 dark:text-rose-300 bg-rose-500/10 border-rose-500/20',
              icon: '🔒'
            };
          } else if (nowMin < cutoffMin && cutoffMin - nowMin <= 120) {
            status = 'closing_soon';
            statusBadge = {
              label: 'Chiude a breve',
              tone: 'text-amber-900 dark:text-amber-200 bg-amber-500/15 border-amber-500/30',
              icon: '⚠️'
            };
          } else if (nowMin < cutoffMin) {
            status = 'open';
            statusBadge = {
              label: 'Check-in aperto',
              tone: 'text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border-emerald-500/20',
              icon: '✓'
            };
          }
        }
      } catch {}
    }

    return {
      cutoffTime: calculatedCutoff,
      airportArrivalTime: recommendedAirport,
      notice: `Chiusura check-in entro ${calculatedCutoff} (consigliato in aeroporto: ${recommendedAirport})`,
      status,
      statusBadge
    };
  }

  if (isFerry && transport.departureTime && /^\d{1,2}:\d{2}$/.test(transport.departureTime.trim())) {
    const [h, m] = transport.departureTime.trim().split(':').map(Number);
    const depTotalMin = h * 60 + m;

    const cutoffMin = (depTotalMin - 30 + 24 * 60) % (24 * 60);
    const cutoffH = String(Math.floor(cutoffMin / 60)).padStart(2, '0');
    const cutoffM = String(cutoffMin % 60).padStart(2, '0');
    const calculatedCutoff = `${cutoffH}:${cutoffM}`;

    const portMin = (depTotalMin - 60 + 24 * 60) % (24 * 60);
    const portH = String(Math.floor(portMin / 60)).padStart(2, '0');
    const portM = String(portMin % 60).padStart(2, '0');
    const recommendedPort = `${portH}:${portM}`;

    return {
      cutoffTime: calculatedCutoff,
      airportArrivalTime: recommendedPort,
      notice: `Imbarco entro ${calculatedCutoff} (al porto entro le ${recommendedPort})`,
      status: 'scheduled',
      statusBadge: {
        label: 'Imbarco',
        tone: 'text-sky-800 dark:text-sky-200 bg-sky-500/10 border-sky-500/20',
        icon: '🚢'
      }
    };
  }

  return {};
}

export default function TrasportoCard({
  transport,
  contextDate,
  segmentContext,
  onEdit,
  onDetail,
  onUpdate
}: TrasportoCardProps) {
  const { role } = useDeviceRole();
  const isExternalLiveView = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('live') === '1' ||
    new URLSearchParams(window.location.search).get('live') === 'true' ||
    new URLSearchParams(window.location.search).get('view') === 'live' ||
    (window.location.hash || '').toLowerCase().includes('live')
  );
  const canSeePrivateInfo = !isExternalLiveView && (role === 'guida' || role === 'copilota');

  const [isTicketsOpen, setIsTicketsOpen] = useState(false);
  const [isPNROpen, setIsPNROpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const initialCopilot = transport.noteCopilota || (typeof transport.copilota === 'string' ? transport.copilota : '') || '';
  const [copilotNotes, setCopilotNotes] = useState<string>(initialCopilot);

  React.useEffect(() => {
    setCopilotNotes(transport.noteCopilota || (typeof transport.copilota === 'string' ? transport.copilota : '') || '');
  }, [transport.noteCopilota, transport.copilota]);

  const hasCopilotNotes = Boolean(copilotNotes.trim());
  const [isBagagliOpen, setIsBagagliOpen] = useState(false);
  const [pnrCopied, setPnrCopied] = useState(false);

  const isRental = transport.type === 'auto' || transport.type === 'camper';
  const isDropoffDay = Boolean(
    isRental && (
      segmentContext === 'dropoff' ||
      (contextDate && transport.dropoffDate === contextDate && transport.dropoffDate !== transport.date)
    )
  );
  const isPickupDay = Boolean(
    isRental && !isDropoffDay && contextDate && transport.date === contextDate
  );

  const mapTargets = getTransportMapTargets(transport);
  const activeMapUrl = isDropoffDay
    ? (mapTargets.dropoffUrl || mapTargets.arrivalUrl || mapTargets.primaryUrl || mapTargets.departureUrl)
    : isPickupDay
    ? (mapTargets.pickupUrl || mapTargets.departureUrl || mapTargets.primaryUrl)
    : (mapTargets.departureUrl || mapTargets.pickupUrl || mapTargets.primaryUrl || mapTargets.arrivalUrl || mapTargets.dropoffUrl);

  const paymentInfo = resolvePaymentInfo({
    cost: transport.cost,
    depositPaid: transport.depositPaid || transport.acconto,
    paymentStatus: transport.paymentStatus,
    status: transport.status,
    completed: transport.completed,
    packageIncluded: transport.packageIncluded
  });

  const { isFree, isPackageIncluded, isPaid, costNum, displayText } = paymentInfo;

  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFree || isPackageIncluded) return;
    try {
      const newStatus = isPaid ? 'da_saldare' : 'saldato';
      const costStr = transport.cost || `${costNum.toFixed(2)} €`;
      const paidVal = newStatus === 'saldato' ? costStr : '0.00 €';
      const updated: Trasporto = {
        ...transport,
        paymentStatus: newStatus,
        depositPaid: paidVal,
        acconto: paidVal,
        amountPaid: paidVal,
        updatedAt: Date.now()
      };
      await storageService.saveTransport(updated);
      notifyDataChanged('trasporti', 'save', updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'trasporti', data: updated } }));
    } catch (err) {
      console.error('Errore toggle pagamento trasporto:', err);
    }
  };

  const handleCopyPnr = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!transport.bookingCode) return;
    const text = transport.bookingCode.trim();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setPnrCopied(true);
    setTimeout(() => setPnrCopied(false), 2000);
  };

  const isFlight = transport.type === 'volo';

  // Regola FASE 5.A: codici aeroportuali usati SOLO per i voli, mai per stazioni ferroviarie o altri mezzi
  const extractFlightEndpoint = (locationStr: string, explicitIata?: string): string => {
    if (!locationStr) return 'Aeroporto';
    const cleanName = locationStr.replace(/\([A-Z]{3,4}\)/gi, '').trim() || locationStr.trim();
    if (explicitIata && explicitIata.trim()) {
      const code = explicitIata.trim().toUpperCase();
      return cleanName.toUpperCase() === code ? code : `${code} · ${cleanName}`;
    }
    const match = locationStr.match(/\(([A-Z]{3,4})\)/i);
    if (match && match[1]) {
      const code = match[1].toUpperCase();
      return `${code} · ${cleanName}`;
    }
    return cleanName;
  };

  const typeConfig: Record<TipoTrasporto, { label: string; icon: string; ticketLabel: string }> = {
    volo: { label: 'Volo', icon: '✈️', ticketLabel: 'Carta imbarco' },
    traghetto: { label: 'Traghetto', icon: '⛴️', ticketLabel: 'Biglietto / QR' },
    camper: { label: 'Campervan', icon: '🚐', ticketLabel: 'Voucher' },
    auto: { label: 'Auto a Noleggio', icon: '🚗', ticketLabel: 'Voucher' },
    transfer: { label: 'Transfer / Bus', icon: '🚐', ticketLabel: 'Voucher' },
    taxi: { label: 'Taxi', icon: '🚕', ticketLabel: 'Ricevuta' },
    treno: { label: 'Treno', icon: '🚆', ticketLabel: 'Biglietto / QR' }
  };
  const currentType = typeConfig[transport.type] || typeConfig.transfer;

  const isNextDayArrival = Boolean(
    (transport.arrivalDate && transport.date && transport.arrivalDate > transport.date) ||
    (transport.arrivalTime && transport.departureTime && transport.arrivalTime < transport.departureTime && !transport.dropoffDate)
  );

  const checkinInfo = getCheckinDisplayInfo(transport);

  const hasTicket = Boolean(
    transport.ticketUrl?.trim() ||
    transport.attachments?.some((attachment) => Boolean(attachment.dataUrl?.trim()))
  );

  const hasPnr = Boolean(transport.bookingCode && transport.bookingCode.trim() && canSeePrivateInfo);
  const displayDateStr = isDropoffDay && transport.dropoffDate ? transport.dropoffDate : transport.date;

  const headerSubType = isRental && (isPickupDay || isDropoffDay)
    ? isDropoffDay
      ? `Riconsegna ${transport.type === 'camper' ? 'camper' : 'auto'}`
      : `Ritiro ${transport.type === 'camper' ? 'camper' : 'auto'}`
    : currentType.label;

  const headerTimeSummary = isRental && isPickupDay
    ? (transport.departureTime ? `Ritiro ore ${transport.departureTime}` : formatDateIT(displayDateStr))
    : isRental && isDropoffDay
    ? ((transport.dropoffTime || transport.arrivalTime) ? `Entro ore ${transport.dropoffTime || transport.arrivalTime}` : formatDateIT(displayDateStr))
    : transport.departureTime && (transport.arrivalTime || transport.dropoffTime)
    ? `${transport.departureTime} → ${transport.arrivalTime || transport.dropoffTime}${isNextDayArrival ? ' (+1)' : ''}`
    : transport.departureTime
    ? `Ore ${transport.departureTime}`
    : formatDateIT(displayDateStr);

  const hasHeaderNotice = Boolean(checkinInfo.cutoffTime || transport.layover);
  const hasSpecCells = Boolean(
    transport.terminalGate ||
    transport.posti ||
    (!isRental && transport.bagagli) ||
    hasPnr ||
    (isRental && !isPickupDay && !isDropoffDay && transport.dropoffDate)
  );

  const terminalGateLabel = transport.type === 'treno'
    ? 'Binario'
    : transport.type === 'volo'
    ? 'Terminal / Gate'
    : transport.type === 'traghetto'
    ? 'Molo / Imbarco'
    : isRental
    ? 'Desk / Ufficio'
    : 'Riferimento';

  const seatOrVehicleLabel = transport.type === 'treno'
    ? 'Carrozza / Posti'
    : isRental
    ? 'Veicolo'
    : 'Posto assegnato';

  return (
    <>
      <div
        onClick={onDetail || onEdit}
        data-transport-type={transport.type}
        className="hounigo-ds-card hounigo-ds-cat-trasporto cursor-pointer"
      >
        {/* 1. HEADER: TARGA CATEGORIA E CARTELLINO ORARIO DA TABELLONE */}
        <div className="hounigo-ds-card-header hounigo-ds-header-trasporto">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider min-w-0 truncate">
              <span aria-hidden="true" className="text-xs">{currentType.icon}</span>
              <span>Trasporto</span>
              <span className="opacity-45">·</span>
              <span className="font-bold tracking-wide truncate">
                {headerSubType}
              </span>
            </div>

            {headerTimeSummary && (
              <span className="hounigo-ds-time-stamp">
                {headerTimeSummary}
              </span>
            )}
          </div>

          {hasHeaderNotice && (
            <div className="hounigo-ds-header-subrow">
              {checkinInfo.cutoffTime && (
                <span>
                  {transport.type === 'traghetto' ? 'IMBARCO ENTRO' : 'CHIUSURA CHECK-IN'}{' '}
                  <strong className="font-mono font-extrabold">{checkinInfo.cutoffTime}</strong>
                  {checkinInfo.airportArrivalTime ? ` · In ${transport.type === 'traghetto' ? 'porto' : 'aeroporto'} ore ${checkinInfo.airportArrivalTime}` : ''}
                </span>
              )}
              {transport.layover && (
                <span>
                  SCALO: <strong>{transport.layover.airport}</strong>
                  {transport.layover.duration ? ` (${transport.layover.duration})` : ''}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 2. BODY: OPERATORE, TRACCIATO PARTENZA/ARRIVO E CASELLARIO OPERATIVO */}
        <div className="hounigo-ds-card-body">
          <h3 className="font-extrabold text-base sm:text-[17px] leading-snug tracking-tight text-slate-900 dark:text-white break-words">
            {transport.carrier || currentType.label}
          </h3>

          {/* Tracciato di tratta (Segnaletica Partenza → Arrivo) */}
          {isRental && (isPickupDay || isDropoffDay) ? (
            <div className="hounigo-ds-route-track">
              {isPickupDay ? (
                <>
                  <div className="hounigo-ds-route-stop">
                    <span className="hounigo-ds-route-kicker">Ritiro</span>
                    <span className="font-bold text-slate-900 dark:text-white break-words">
                      {transport.departureLocation || 'Deposito di ritiro'}
                    </span>
                  </div>
                  {(transport.dropoffDate || transport.dropoffLocation || transport.arrivalLocation) && (
                    <div className="hounigo-ds-route-stop hounigo-ds-route-stop-end">
                      <span className="hounigo-ds-route-kicker">Riconsegna</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 break-words">
                        {transport.dropoffDate ? formatDateIT(transport.dropoffDate) : ''}
                        {(transport.dropoffTime || transport.arrivalTime) ? ` ore ${transport.dropoffTime || transport.arrivalTime}` : ''}
                        {(transport.dropoffLocation || transport.arrivalLocation) ? ` · ${transport.dropoffLocation || transport.arrivalLocation}` : ''}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="hounigo-ds-route-stop hounigo-ds-route-stop-end">
                    <span className="hounigo-ds-route-kicker">Riconsegna</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 break-words">
                      {transport.dropoffLocation || transport.arrivalLocation || transport.departureLocation || 'Deposito di riconsegna'}
                    </span>
                  </div>
                  {transport.date && (
                    <div className="hounigo-ds-route-stop">
                      <span className="hounigo-ds-route-kicker">Ritirato</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300 break-words">
                        {formatDateIT(transport.date)}{transport.departureLocation ? ` · ${transport.departureLocation}` : ''}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="hounigo-ds-route-track">
              <div className="hounigo-ds-route-stop">
                <span className="hounigo-ds-route-kicker">Da</span>
                <span className="font-bold text-slate-900 dark:text-white break-words">
                  {isFlight
                    ? extractFlightEndpoint(transport.departureLocation, transport.departureIata)
                    : (transport.departureLocation || 'Origine')}
                </span>
              </div>
              <div className="hounigo-ds-route-stop hounigo-ds-route-stop-end">
                <span className="hounigo-ds-route-kicker">A</span>
                <span className="font-bold text-slate-900 dark:text-white break-words">
                  {isFlight
                    ? extractFlightEndpoint(transport.arrivalLocation, transport.arrivalIata)
                    : (transport.dropoffLocation || transport.arrivalLocation || 'Destinazione')}
                </span>
              </div>
            </div>
          )}

          {/* Casellario Tecnico Operativo (Zero emoji decorative) */}
          {hasSpecCells && (
            <div className="hounigo-ds-spec-grid">
              {transport.terminalGate && (
                <div className="hounigo-ds-spec-cell">
                  <span className="hounigo-ds-spec-label">{terminalGateLabel}</span>
                  <span className="hounigo-ds-spec-value font-mono">{transport.terminalGate}</span>
                </div>
              )}

              {transport.posti && (
                <div className="hounigo-ds-spec-cell">
                  <span className="hounigo-ds-spec-label">{seatOrVehicleLabel}</span>
                  <span className="hounigo-ds-spec-value">{transport.posti}</span>
                </div>
              )}

              {isRental && !isPickupDay && !isDropoffDay && transport.dropoffDate && (
                <div className="hounigo-ds-spec-cell">
                  <span className="hounigo-ds-spec-label">Riconsegna prevista</span>
                  <span className="hounigo-ds-spec-value font-mono">
                    {formatDateIT(transport.dropoffDate)} {transport.dropoffTime || ''}
                  </span>
                </div>
              )}

              {hasPnr && (
                <button
                  type="button"
                  onClick={handleCopyPnr}
                  className="hounigo-ds-spec-cell text-left hover:border-slate-400 transition-colors cursor-pointer"
                  title="Copia codice prenotazione"
                >
                  <span className="hounigo-ds-spec-label">
                    PNR · {pnrCopied ? '✓ Copiato' : 'Copia'}
                  </span>
                  <span className="hounigo-ds-spec-value font-mono tracking-wide text-indigo-900 dark:text-indigo-300">
                    {transport.bookingCode}
                  </span>
                </button>
              )}
            </div>
          )}

          {hasCopilotNotes && transport.mostraNoteInCard && (
            <p className="hounigo-ds-note line-clamp-2">
              {copilotNotes.trim()}
            </p>
          )}
        </div>

        {/* 3. FOOTER: TAGLIANDO STATO ECONOMICO & AZIONI OPERATIVE */}
        <div className="hounigo-ds-card-footer">
          <div className="flex items-center gap-2 flex-wrap">
            {isPackageIncluded ? (
              <span className="text-xs font-extrabold uppercase tracking-wide text-sky-800 dark:text-sky-300">
                Incluso nel pacchetto
              </span>
            ) : isFree ? (
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Gratuito
              </span>
            ) : transport.cost && costNum > 0 ? (
              <>
                <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {displayText}
                </span>
                <button
                  type="button"
                  onClick={handleTogglePayment}
                  className={`hounigo-ds-pay-badge ${
                    isPaid ? 'hounigo-ds-pay-saldato' : 'hounigo-ds-pay-dasaldare'
                  }`}
                  title="Inverti stato pagamento"
                >
                  {isPaid ? '✓ Saldato' : 'Da saldare'}
                </button>
              </>
            ) : null}
          </div>

          <div className="hounigo-ds-actions-group">
            {/* Pulsante dedicato Bagagli nel footer (Verde se sono presenti informazioni) */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsBagagliOpen(true); }}
              className={`hounigo-ds-action-btn ${transport.bagagli?.trim() ? 'hounigo-ds-action-btn-active-green' : ''}`}
              title={transport.bagagli?.trim() ? `Bagagli registrati: ${transport.bagagli}` : 'Gestisci informazioni bagagli'}
              aria-label="Informazioni bagagli"
            >
              <span aria-hidden="true">🧳</span>
              <span className="hounigo-ds-btn-text">Bagagli</span>
            </button>

            {hasCopilotNotes && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
                className={`hounigo-ds-action-btn ${hasCopilotNotes ? 'hounigo-ds-action-btn-active-green' : ''}`}
                title="Note per il Copilota"
                aria-label="Note per il Copilota"
              >
                <span aria-hidden="true">🧭</span>
                <span className="hounigo-ds-btn-text">Note</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsTicketsOpen(true); }}
              className={`hounigo-ds-action-btn ${hasTicket ? 'hounigo-ds-action-btn-highlight' : ''}`}
              title={`Biglietti e QR · ${currentType.ticketLabel}`}
              aria-label={currentType.ticketLabel}
            >
              <span aria-hidden="true">🎟️</span>
              <span className="hounigo-ds-btn-text">{currentType.ticketLabel}</span>
            </button>

            {activeMapUrl && (
              <a
                href={activeMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hounigo-ds-action-btn"
                title="Apri navigazione su Google Maps"
                aria-label="Apri navigazione su Google Maps"
              >
                <span aria-hidden="true">🗺️</span>
                <span className="hounigo-ds-btn-text">Maps</span>
                <span className="hounigo-ds-btn-arrow text-[10px] opacity-70">↗</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* MODALI OPERATIVI */}
      <TrasportoTicketsModal
        isOpen={isTicketsOpen}
        onClose={() => setIsTicketsOpen(false)}
        transport={transport}
        onUpdateTransport={(updated) => { if (onUpdate) onUpdate(updated); }}
      />

      <TrasportoBagagliModal
        isOpen={isBagagliOpen}
        onClose={() => setIsBagagliOpen(false)}
        transport={transport}
        onUpdateTransport={(updated) => { if (onUpdate) onUpdate(updated); }}
      />

      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={transport.carrier || currentType.label}
        noteCopilota={copilotNotes}
        mostraNoteInCard={transport.mostraNoteInCard}
        canEdit={true}
        onSave={async (notes, showOnCard) => {
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated: Trasporto = {
              ...transport,
              noteCopilota: clean,
              mostraNoteInCard: Boolean(showOnCard),
              copilota: Boolean(clean) || transport.copilota,
              updatedAt: Date.now()
            };
            await storageService.saveTransport(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'trasporti', data: updated } }));
            setIsCopilotOpen(false);
          } catch (e) {
            console.error(e);
          }
        }}
      />

      {isPNROpen && transport.bookingCode && canSeePrivateInfo && typeof document !== 'undefined' && document.body && createPortal(
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { e.stopPropagation(); setIsPNROpen(false); }}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-[#172033] rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl mx-auto mb-3 shadow-2xs">
              🎟️
            </div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Codice PNR</h3>
            <div className="my-4 p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <span className="font-mono text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-wider select-all break-all">
                {transport.bookingCode}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsPNROpen(false); }}
              className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors w-full cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>, document.body)}

      <TrasportoBagagliModal
        isOpen={isBagagliOpen}
        onClose={() => setIsBagagliOpen(false)}
        transport={transport}
      />
    </>
  );
}
