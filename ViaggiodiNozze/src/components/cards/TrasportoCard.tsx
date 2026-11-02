import React, { useState } from 'react';
import type { Trasporto, TipoTrasporto } from '../../types';
import TrasportoTicketsModal from '../modals/TrasportoTicketsModal';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import TrasportoBagagliModal from '../modals/TrasportoBagagliModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { getTransportMapTargets } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';
import { formatDateIT } from '../../utils/tripDates';

export interface TrasportoCardProps {
  transport: Trasporto;
  variant?: 'full' | 'compact' | 'standard';
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
    return {
      cutoffTime: raw,
      status: 'scheduled',
      notice: isFerry ? `Imbarco entro: ${raw}` : `Chiusura check-in: ${raw}`,
      statusBadge: {
        label: isFerry ? 'Imbarco' : 'Chiusura',
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

    // Calcolo stato temporale rispetto all'ora attuale (se il volo è per la data odierna)
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
  onEdit,
  onDetail,
  onUpdate
}: TrasportoCardProps) {
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
  const mapTargets = getTransportMapTargets(transport);
  const activeMapUrl = (mapTargets.departureUrl || mapTargets.pickupUrl || mapTargets.primaryUrl || mapTargets.arrivalUrl || mapTargets.dropoffUrl);

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

  const extractCodeOrCity = (locationStr: string, explicitIata?: string): { code: string; name: string } => {
    if (explicitIata && explicitIata.trim()) {
      return {
        code: explicitIata.trim().toUpperCase(),
        name: locationStr ? (locationStr.length > 25 ? locationStr.slice(0, 22) + '…' : locationStr) : explicitIata.trim().toUpperCase()
      };
    }
    if (!locationStr) return { code: 'LOC', name: 'Destinazione' };
    const match = locationStr.match(/\(([A-Z]{3,4})\)/i);
    if (match && match[1]) {
      const code = match[1].toUpperCase();
      const name = locationStr.split('(')[0].trim();
      return { code, name };
    }
    const l = locationStr.toLowerCase();
    if (l.includes('malpensa') || l.includes('milano')) return { code: 'MXP', name: 'Milano' };
    if (l.includes('pechino') || l.includes('beijing')) return { code: 'PEK', name: 'Pechino' };
    if (l.includes('fiumicino') || l.includes('roma')) return { code: 'FCO', name: 'Roma' };
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
    const firstWord = parts[0] || 'LOC';
    return {
      code: firstWord.length > 4 ? firstWord.slice(0, 3).toUpperCase() : firstWord.toUpperCase(),
      name: locationStr.length > 25 ? locationStr.slice(0, 22) + '…' : locationStr
    };
  };

  const originInfo = extractCodeOrCity(transport.departureLocation, transport.departureIata);
  const destInfo = extractCodeOrCity(transport.dropoffLocation || transport.arrivalLocation, transport.arrivalIata);

  const typeConfig: Record<TipoTrasporto, { label: string; icon: string; modeIcon: string }> = {
    volo: { label: 'Volo', icon: '✈️', modeIcon: '✈️' },
    traghetto: { label: 'Traghetto', icon: '⛴️', modeIcon: '🚢' },
    camper: { label: 'Campervan', icon: '🚐', modeIcon: '🚐' },
    auto: { label: 'Auto a Noleggio', icon: '🚗', modeIcon: '🚗' },
    transfer: { label: 'Transfer / Bus', icon: '🚐', modeIcon: '🚐' },
    taxi: { label: 'Taxi', icon: '🚕', modeIcon: '🚕' },
    treno: { label: 'Treno', icon: '🚆', modeIcon: '🚆' }
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

  const hasPnr = Boolean(transport.bookingCode && transport.bookingCode.trim());

  return (
    <>
      <div
        onClick={onDetail || onEdit}
        className={`w-full max-w-full min-w-0 rounded-2xl relative overflow-hidden transition-all duration-200 cursor-pointer border bg-white dark:bg-[#172033] border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md ${
          isCompact ? 'p-3' : 'p-3.5 sm:p-5'
        }`}
      >
        {/* TACCHE LATERALI BOARDING PASS EDITORIAL */}
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#F8F7F3] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 pointer-events-none" />
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#F8F7F3] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 pointer-events-none" />

        {/* 1. HEADER: COMPAGNIA + CODICE VOLO / MEZZO + DATA */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">{currentType.icon}</span>
            <div className="min-w-0">
              <span className="font-extrabold text-xs uppercase tracking-wider text-slate-900 dark:text-white truncate block">
                {transport.carrier ? `${transport.carrier}` : currentType.label}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mt-0.5">
                {formatDateIT(transport.date)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Bagagli Button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsBagagliOpen(true); }}
              className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                transport.bagagli
                  ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 opacity-60 hover:opacity-100'
              }`}
              title="Bagagli"
              aria-label="Bagagli"
            >
              <span className="text-xs">🧳</span>
            </button>

            {/* Copilota Button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                hasCopilotNotes
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/15'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 opacity-60 hover:opacity-100'
              }`}
              title={hasCopilotNotes ? 'Note Copilota presenti' : 'Aggiungi note Copilota'}
              aria-label="Note Copilota"
            >
              <span className="text-xs">🧭</span>
            </button>
          </div>
        </div>

        {/* 2. ***REMOVED***: ORIGINE -> DESTINAZIONE (NUMERI TABULARI, ORARI CHIARI) */}
        <div className="py-3">
          <div
            className="items-center gap-1.5 sm:gap-4"
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)' }}
          >
            {/* ORIGINE */}
            <div className="min-w-0 text-left">
              {transport.departureTime && transport.status === 'prenotato' && (
                <span className="mb-1 block text-[9px] font-extrabold uppercase tracking-wide text-rose-600 dark:text-rose-300">Orario da rispettare</span>
              )}
              {!transport.departureTime && <span className="mb-1 block text-[9px] font-semibold text-slate-400 dark:text-slate-500">Orario non indicato</span>}
              <div className="text-xl sm:text-2xl md:text-3xl font-black text-slate-950 dark:text-white tracking-tight font-mono tabular-nums leading-none">
                {transport.departureTime || originInfo.code}
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide truncate mt-1">
                {originInfo.code} · {originInfo.name}
              </p>
              {transport.departureLocation && transport.departureLocation !== originInfo.name && (
                <p className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {transport.departureLocation}
                </p>
              )}
            </div>

            {/* SEGNO GRAFICO MINIMALE ***REMOVED*** */}
            <div className="flex flex-col items-center justify-center px-1 sm:px-2 shrink-0">
              <div className="w-8 sm:w-12 md:w-16 flex items-center justify-center relative">
                <div className="hounigo-transport-route w-full border-t border-slate-300 dark:border-slate-700" />
                <span className="hounigo-transport-mode absolute bg-white dark:bg-[#172033] px-1 text-[11px] text-slate-400">
                  {currentType.modeIcon}
                </span>
              </div>
              {transport.layover ? (
                <span className="text-[9px] sm:text-[10px] font-bold text-[#FF6B5F] mt-1 text-center whitespace-nowrap">
                  Scalo {transport.layover.airport.split(' ')[0]}
                </span>
              ) : (
                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mt-1">
                  Diretto
                </span>
              )}
            </div>

            {/* DESTINAZIONE */}
            <div className="min-w-0 text-right">
              <div className="text-xl sm:text-2xl md:text-3xl font-black text-slate-950 dark:text-white tracking-tight font-mono tabular-nums leading-none flex items-center justify-end gap-1">
                <span>{transport.arrivalTime || transport.dropoffTime || destInfo.code}</span>
                {isNextDayArrival && (
                  <span className="text-[8px] sm:text-[9px] font-extrabold uppercase px-1 py-0.5 rounded-md bg-[#FF6B5F]/15 text-[#FF6B5F] align-top">
                    +1
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide truncate mt-1">
                {destInfo.code} · {destInfo.name}
              </p>
              {(transport.dropoffLocation || transport.arrivalLocation) && (
                <p className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {transport.dropoffLocation || transport.arrivalLocation}
                </p>
              )}
            </div>
          </div>

          {/* 3. INFORMAZIONI OPERATIVE ADATTIVE (SOLO SE PRESENTI) */}
          {Boolean(transport.terminalGate || transport.posti || (transport.type === 'auto' && transport.dropoffDate)) && (
            <div className="mt-3 pt-2.5 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
              {transport.terminalGate && (
                <div className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium max-w-full min-w-0 flex items-center">
                  <span className="text-slate-400 mr-1 text-[10px] uppercase font-bold shrink-0">
                    {transport.type === 'treno' ? 'Binario:' : transport.type === 'volo' ? 'Terminal/Gate:' : transport.type === 'traghetto' ? 'Molo/Imbarco:' : 'Rif:'}
                  </span>
                  <strong className="truncate">{transport.terminalGate}</strong>
                </div>
              )}
              {transport.posti && (
                <div className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium max-w-full min-w-0 flex items-center">
                  <span className="text-slate-400 mr-1 text-[10px] uppercase font-bold shrink-0">
                    {transport.type === 'treno' ? 'Carrozza / Posto:' : 'Posto:'}
                  </span>
                  <strong className="truncate">{transport.posti}</strong>
                </div>
              )}
              {transport.type === 'auto' && transport.dropoffDate && (
                <div className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium max-w-full min-w-0 flex items-center">
                  <span className="text-slate-400 mr-1 text-[10px] uppercase font-bold shrink-0">Riconsegna:</span>
                  <strong className="truncate">{formatDateIT(transport.dropoffDate)} {transport.dropoffTime || ''}</strong>
                </div>
              )}
            </div>
          )}

          {/* 4. STATO CHECK-IN IN UNA RIGA COMPATTA */}
          {checkinInfo.cutoffTime && !isCompact && (
            <div className="mt-2 min-w-0 px-2.5 py-1 rounded-lg bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-1.5 text-xs">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="text-slate-400 dark:text-slate-500 shrink-0 text-[11px]">⏱️</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 shrink-0 text-[11px]">
                  {transport.type === 'traghetto' ? 'Imbarco:' : 'Check-in:'}
                </span>
                <strong className="font-extrabold text-slate-900 dark:text-white tabular-nums text-xs">
                  {checkinInfo.cutoffTime}
                </strong>
                {checkinInfo.airportArrivalTime && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    · in aeroporto ore {checkinInfo.airportArrivalTime}
                  </span>
                )}
              </div>
              {checkinInfo.statusBadge && (
                <span
                  className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border shrink-0 ${checkinInfo.statusBadge.tone}`}
                >
                  <span>{checkinInfo.statusBadge.icon}</span>
                  <span>{checkinInfo.statusBadge.label}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* 5. FOOTER: PREZZO/PAGAMENTO A SINISTRA, AZIONI OPERATIVE A DESTRA */}
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          {/* STATO ECONOMICO */}
          <div className="flex items-center gap-2">
            {isPackageIncluded ? (
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-100 dark:border-sky-800">
                Incluso
              </span>
            ) : isFree ? (
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Gratuito
              </span>
            ) : transport.cost ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {displayText}
                </span>
                {!isCompact && (
                  <button
                    type="button"
                    onClick={handleTogglePayment}
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                      isPaid
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                    }`}
                    title="Inverti stato pagamento"
                  >
                    {isPaid ? '✓ Saldato' : '⏳ Da saldare'}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* AZIONI OPERATIVE */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* COPIA PNR (SE PRESENTE) */}
            {hasPnr && (
              <button
                type="button"
                onClick={handleCopyPnr}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 max-w-[150px] sm:max-w-[200px] min-w-0"
                title="Copia codice prenotazione"
              >
                <span className="shrink-0">{pnrCopied ? '✓' : '#️⃣'}</span>
                <span className="truncate">{pnrCopied ? 'Codice copiato' : 'Copia codice'}</span>
              </button>
            )}

            {/* APRI BIGLIETTO / QR (SOLO SE PRESENTE UN DOCUMENTO) */}
            {
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsTicketsOpen(true); }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${hasTicket ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'}`}
                title="Biglietti e QR"
              >
                <span>🎫</span>
                <span>Biglietti e QR</span>
              </button>
            }

            {/* LINK MAPS */}
            {activeMapUrl && (
              <a
                href={activeMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs transition-colors"
                title="Apri su Google Maps"
                aria-label="Apri su Google Maps"
              >
                📍
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

      {isPNROpen && transport.bookingCode && (
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
