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

  // 1. Scadenza esplicita registrata (es. '11:30' o testo personalizzato)
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

  // 2. Se non è volo o traghetto, non calcolare avvisi aerei generici
  if (!isFlight && !isFerry) {
    return {};
  }

  // 3. Volo: chiusura banchi (60 min prima) e arrivo aeroporto (180 min prima)
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

  // 4. Traghetto: chiusura imbarco (30 min prima) e arrivo al molo (60 min prima)
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
  variant = 'full',
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

  const isCompact = variant === 'compact';
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
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(transport.bookingCode.trim());
        setPnrCopied(true);
        setTimeout(() => setPnrCopied(false), 2000);
      }
    } catch (err) {
      console.warn('Errore copia PNR:', err);
    }
  };

  const isFlight = transport.type === 'volo';

  const extractCodeOrCity = (locationStr: string, explicitIata?: string): { code: string; name: string } => {
    if (!locationStr) return { code: '', name: 'Destinazione' };

    if (isFlight) {
      if (explicitIata && explicitIata.trim()) {
        return {
          code: explicitIata.trim().toUpperCase(),
          name: locationStr.split('(')[0].trim() || explicitIata.trim().toUpperCase()
        };
      }
      const match = locationStr.match(/\(([A-Z]{3,4})\)/i);
      if (match && match[1]) {
        const code = match[1].toUpperCase();
        const name = locationStr.split('(')[0].trim();
        return { code, name };
      }
      const l = locationStr.toLowerCase();
      if (l.includes('malpensa')) return { code: 'MXP', name: 'Milano Malpensa' };
      if (l.includes('pechino') || l.includes('beijing')) return { code: 'PEK', name: 'Pechino' };
      if (l.includes('fiumicino')) return { code: 'FCO', name: 'Roma Fiumicino' };
      if (l.includes('auckland')) return { code: 'AKL', name: 'Auckland' };
      if (l.includes('christchurch')) return { code: 'CHC', name: 'Christchurch' };
      if (l.includes('wellington')) return { code: 'WLG', name: 'Wellington' };
      if (l.includes('picton')) return { code: 'PCN', name: 'Picton' };
      if (l.includes('adelaide')) return { code: 'ADL', name: 'Adelaide' };
      if (l.includes('melbourne')) return { code: 'MEL', name: 'Melbourne' };
      if (l.includes('sydney')) return { code: 'SYD', name: 'Sydney' };
      if (l.includes('manila')) return { code: 'MNL', name: 'Manila' };
      if (l.includes('caticlan') || l.includes('boracay')) return { code: 'MPH', name: 'Boracay' };
      if (l.includes('el nido')) return { code: 'ENI', name: 'El Nido' };
      if (l.includes('coron') || l.includes('busuanga')) return { code: 'USU', name: 'Coron' };
      if (l.includes('cebu')) return { code: 'CEB', name: 'Cebu' };
      const parts = locationStr.split(/[,\-–\s]+/);
      const firstWord = parts[0] || 'AER';
      return {
        code: firstWord.length > 4 ? firstWord.slice(0, 3).toUpperCase() : firstWord.toUpperCase(),
        name: locationStr
      };
    }

    return {
      code: '',
      name: locationStr.trim()
    };
  };

  const originInfo = extractCodeOrCity(transport.departureLocation, transport.departureIata);
  const destInfo = extractCodeOrCity(transport.dropoffLocation || transport.arrivalLocation, transport.arrivalIata);

  const typeConfig: Record<TipoTrasporto, { label: string; icon: string; modeIcon: string; ticketLabel: string }> = {
    volo: { label: 'Volo', icon: '✈️', modeIcon: '✈️', ticketLabel: 'Carta imbarco / QR' },
    traghetto: { label: 'Traghetto', icon: '⛴️', modeIcon: '🚢', ticketLabel: 'Biglietto / QR' },
    camper: { label: 'Campervan', icon: '🚐', modeIcon: '🚐', ticketLabel: 'Voucher / Contratto' },
    auto: { label: 'Auto a Noleggio', icon: '🚗', modeIcon: '🚗', ticketLabel: 'Voucher / Contratto' },
    transfer: { label: 'Transfer / Bus', icon: '🚐', modeIcon: '🚐', ticketLabel: 'Biglietto / Voucher' },
    taxi: { label: 'Taxi', icon: '🚕', modeIcon: '🚕', ticketLabel: 'Ricevuta / Voucher' },
    treno: { label: 'Treno', icon: '🚆', modeIcon: '🚆', ticketLabel: 'Biglietto / QR' }
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

  return (
    <>
      <div
        onClick={onDetail || onEdit}
        data-transport-type={transport.type}
        className={`w-full max-w-full min-w-0 rounded-2xl relative overflow-hidden transition-all duration-200 cursor-pointer border bg-white dark:bg-[#172033] border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md ${
          isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'
        }`}
      >
        {/* TACCHE LATERALI BOARDING PASS EDITORIAL */}
        <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#F8F7F3] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 pointer-events-none" />
        <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#F8F7F3] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 pointer-events-none" />

        {/* 1. HEADER: COMPAGNIA + CODICE VOLO / MEZZO + DATA + AZIONI SECONDARIE */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-base sm:text-lg shrink-0">{currentType.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-xs sm:text-sm uppercase tracking-wider text-slate-900 dark:text-white truncate">
                  {transport.carrier ? transport.carrier : currentType.label}
                </span>
                {isRental && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold border ${
                    isDropoffDay
                      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                  }`}>
                    <span>{isDropoffDay ? '🏁' : '🔑'}</span>
                    <span>{isDropoffDay ? 'Riconsegna veicolo' : 'Ritiro veicolo'}</span>
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mt-0.5">
                {formatDateIT(displayDateStr)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isRental && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsBagagliOpen(true); }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  transport.bagagli
                    ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                }`}
                title="Franchigia e dettagli bagagli"
                aria-label="Bagagli"
              >
                <span>🧳</span>
                <span>Bagagli</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                hasCopilotNotes
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/15'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
              }`}
              title={hasCopilotNotes ? 'Leggi note operative / Copilota' : 'Aggiungi note Copilota'}
              aria-label="Note Copilota"
            >
              <span>🧭</span>
              <span>Note</span>
            </button>
          </div>
        </div>

        {/* 2. CORPO OPERATIVO: DIFFERENZIATO PER NOLEGGIO GIORNALIERO VS TRATTA */}
        <div className="py-3">
          {isRental && (isPickupDay || isDropoffDay) ? (
            <div className="space-y-2.5">
              {isPickupDay ? (
                <>
                  <div className="flex items-start justify-between gap-3 bg-slate-50/90 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/70">
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                        🔑 Ritiro programmato oggi
                      </span>
                      <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 break-words">
                        📍 {transport.departureLocation || 'Deposito di ritiro'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Orario ritiro</span>
                      <span className="text-lg sm:text-xl font-black font-mono tabular-nums text-slate-950 dark:text-white">
                        {transport.departureTime || '—:—'}
                      </span>
                    </div>
                  </div>
                  {(transport.dropoffDate || transport.dropoffLocation || transport.arrivalLocation) && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">
                        🏁 Riconsegna prevista: <strong className="text-slate-900 dark:text-white">{transport.dropoffDate ? formatDateIT(transport.dropoffDate) : ''} {transport.dropoffTime || transport.arrivalTime || ''}</strong>
                      </span>
                      <span className="truncate font-medium text-slate-500 dark:text-slate-400">
                        {transport.dropoffLocation || transport.arrivalLocation}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl p-3 border border-amber-200/80 dark:border-amber-800/60">
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                        🏁 Riconsegna veicolo oggi
                      </span>
                      <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 break-words">
                        📍 {transport.dropoffLocation || transport.arrivalLocation || transport.departureLocation || 'Deposito di riconsegna'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase text-amber-700/80 dark:text-amber-300/80 block">Entro le ore</span>
                      <span className="text-lg sm:text-xl font-black font-mono tabular-nums text-slate-950 dark:text-white">
                        {transport.dropoffTime || transport.arrivalTime || '—:—'}
                      </span>
                    </div>
                  </div>
                  {transport.departureLocation && (
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                      <span>Ritirato il {formatDateIT(transport.date)}</span>
                      <span className="truncate">{transport.departureLocation}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* TRATTA STANDARD: VOLO, TRENO, TRAGHETTO, TRANSFER O SCHEDA COMPLETA NOLEGGIO */
            <div
              className="items-center gap-2 sm:gap-4"
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)' }}
            >
              {/* ORIGINE / RITIRO */}
              <div className="min-w-0 text-left">
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-400">
                  {isRental ? '🔑 Ritiro' : 'Partenza'}
                </span>
                <div className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white tracking-tight font-mono tabular-nums leading-none">
                  {transport.departureTime || (originInfo.code || '—:—')}
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug break-words mt-1.5">
                  {originInfo.code ? `${originInfo.code} · ${originInfo.name}` : originInfo.name}
                </p>
                {transport.departureLocation && originInfo.code && transport.departureLocation !== originInfo.name && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {transport.departureLocation}
                  </p>
                )}
              </div>

              {/* SEGNO GRAFICO TRATTA */}
              <div className="flex flex-col items-center justify-center px-1 sm:px-2 shrink-0">
                <div className="w-9 sm:w-14 flex items-center justify-center relative">
                  <div className="hounigo-transport-route w-full border-t border-slate-300 dark:border-slate-700" />
                  <span className="hounigo-transport-mode absolute bg-white dark:bg-[#172033] px-1 text-xs text-slate-500">
                    {currentType.modeIcon}
                  </span>
                </div>
                {transport.layover ? (
                  <span className="text-[10px] font-bold text-[#FF6B5F] mt-1.5 text-center whitespace-nowrap">
                    Scalo {transport.layover.airport.split(' ')[0]}
                  </span>
                ) : isRental && transport.dropoffDate ? (
                  <span className="text-[10px] font-bold text-slate-500 mt-1.5 whitespace-nowrap">
                    → {formatDateIT(transport.dropoffDate)}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400 mt-1.5">
                    Diretto
                  </span>
                )}
              </div>

              {/* DESTINAZIONE / RICONSEGNA */}
              <div className="min-w-0 text-right">
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-400">
                  {isRental ? '🏁 Riconsegna' : 'Arrivo'}
                </span>
                <div className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white tracking-tight font-mono tabular-nums leading-none flex items-center justify-end gap-1">
                  <span>{transport.arrivalTime || transport.dropoffTime || (destInfo.code || '—:—')}</span>
                  {isNextDayArrival && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-[#FF6B5F]/15 text-[#FF6B5F] align-top">
                      +1
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug break-words mt-1.5">
                  {destInfo.code ? `${destInfo.code} · ${destInfo.name}` : destInfo.name}
                </p>
                {(transport.dropoffLocation || transport.arrivalLocation) && destInfo.code && (transport.dropoffLocation || transport.arrivalLocation) !== destInfo.name && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {transport.dropoffLocation || transport.arrivalLocation}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 3. DETTAGLI OPERATIVI ESSENZIALI (TERMINAL/GATE, BINARIO, CARROZZA/POSTO, VEICOLO) */}
          {Boolean(transport.terminalGate || transport.posti || (isRental && !isPickupDay && !isDropoffDay && transport.dropoffDate)) && (
            <div className="mt-3 pt-2.5 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
              {transport.terminalGate && (
                <div className={`px-2.5 py-1 rounded-xl border font-semibold max-w-full min-w-0 flex items-center gap-1.5 ${
                  transport.type === 'treno'
                    ? 'bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                }`}>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] uppercase font-extrabold shrink-0">
                    {transport.type === 'treno' ? '🚉 Binario:' : transport.type === 'volo' ? '🛫 Terminal/Gate:' : transport.type === 'traghetto' ? '⚓ Molo/Imbarco:' : isRental ? '🏢 Desk / Ufficio:' : 'Rif:'}
                  </span>
                  <strong className="truncate font-extrabold">{transport.terminalGate}</strong>
                </div>
              )}
              {transport.posti && (
                <div className="px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold max-w-full min-w-0 flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] uppercase font-extrabold shrink-0">
                    {transport.type === 'treno' ? '💺 Carrozza / Posto:' : isRental ? '🚘 Veicolo:' : '💺 Posto:'}
                  </span>
                  <strong className="truncate font-extrabold">{transport.posti}</strong>
                </div>
              )}
              {isRental && !isPickupDay && !isDropoffDay && transport.dropoffDate && (
                <div className="px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold max-w-full min-w-0 flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] uppercase font-extrabold shrink-0">📅 Riconsegna:</span>
                  <strong className="truncate font-extrabold">{formatDateIT(transport.dropoffDate)} {transport.dropoffTime || ''}</strong>
                </div>
              )}
            </div>
          )}

          {/* 4. STATO CHECK-IN / IMBARCO (SEMPRE VISIBILE PER VOLI E TRAGHETTI) */}
          {checkinInfo.cutoffTime && (
            <div className="mt-2.5 min-w-0 px-3 py-1.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span className="shrink-0">⏱️</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {transport.type === 'traghetto' ? 'Chiusura imbarco:' : 'Chiusura check-in:'}
                </span>
                <strong className="font-black text-slate-950 dark:text-white font-mono tabular-nums">
                  {checkinInfo.cutoffTime}
                </strong>
                {checkinInfo.airportArrivalTime && (
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    · consigliato in aeroporto ore <strong className="font-mono font-bold">{checkinInfo.airportArrivalTime}</strong>
                  </span>
                )}
              </div>
              {checkinInfo.statusBadge && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-lg border shrink-0 ${checkinInfo.statusBadge.tone}`}
                >
                  <span>{checkinInfo.statusBadge.icon}</span>
                  <span>{checkinInfo.statusBadge.label}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* 5. FOOTER: STATO ECONOMICO A SINISTRA, AZIONI OPERATIVE CHIARE A DESTRA */}
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {isPackageIncluded ? (
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800">
                Incluso nel pacchetto
              </span>
            ) : isFree ? (
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                Gratuito
              </span>
            ) : transport.cost ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {displayText}
                </span>
                <button
                  type="button"
                  onClick={handleTogglePayment}
                  className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    isPaid
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                  }`}
                  title="Inverti stato pagamento"
                >
                  {isPaid ? '✓ Saldato' : '⏳ Da saldare'}
                </button>
              </div>
            ) : null}
          </div>

          {/* AZIONI OPERATIVE TOUCH-FRIENDLY CON ETICHETTA */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap ml-auto">
            {hasPnr && (
              <button
                type="button"
                onClick={handleCopyPnr}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-200 text-xs font-bold transition-all border border-indigo-200/80 dark:border-indigo-800 cursor-pointer"
                title="Copia codice prenotazione"
              >
                <span className="shrink-0">{pnrCopied ? '✓' : '#️⃣'}</span>
                <span className="font-mono">{pnrCopied ? 'Copiato' : transport.bookingCode}</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsTicketsOpen(true); }}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border cursor-pointer ${
                hasTicket
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
              }`}
              title={`Biglietti e QR · ${currentType.ticketLabel}`}
            >
              <span>🎫</span>
              <span>{currentType.ticketLabel}</span>
            </button>

            {activeMapUrl && (
              <a
                href={activeMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-colors"
                title="Apri navigazione su Google Maps"
                aria-label="Apri su Google Maps"
              >
                <span>📍</span>
                <span>Maps</span>
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

      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={transport.carrier || currentType.label}
        noteCopilota={copilotNotes}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated: Trasporto = {
              ...transport,
              noteCopilota: clean,
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

      {isPNROpen && transport.bookingCode && canSeePrivateInfo && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
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
        </div>
      )}

      <TrasportoBagagliModal
        isOpen={isBagagliOpen}
        onClose={() => setIsBagagliOpen(false)}
        transport={transport}
      />
    </>
  );
}
