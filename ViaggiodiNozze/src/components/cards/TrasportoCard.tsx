import { useState } from 'react';
import type { Trasporto, TipoTrasporto } from '../../types';
import TrasportoTicketsModal from '../modals/TrasportoTicketsModal';
import { getTransportMapTargets } from '../../utils/mapsHelper';

interface TrasportoCardProps {
  transport: Trasporto;
  variant?: 'full' | 'compact';
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Trasporto) => void;
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

  const attachmentsCount = transport.attachments?.length || 0;
  const mapTargets = getTransportMapTargets(transport);
  const canHaveTickets =
    transport.type === 'volo' ||
    transport.type === 'traghetto' ||
    transport.type === 'treno' ||
    transport.type === 'auto' ||
    transport.type === 'camper' ||
    Boolean(transport.bookingCode || transport.ticketUrl || attachmentsCount > 0);

  const activeMapUrl = transport.status === 'completato' 
    ? (mapTargets.arrivalUrl || mapTargets.dropoffUrl || mapTargets.primaryUrl)
    : (mapTargets.departureUrl || mapTargets.pickupUrl || mapTargets.primaryUrl);

  const extractCodeOrCity = (locationStr: string): { code: string; name: string } => {
    if (!locationStr) return { code: 'LOC', name: 'Destinazione' };
    const match = locationStr.match(/\(([A-Z]{3})\)/i);
    if (match && match[1]) {
      const code = match[1].toUpperCase();
      const name = locationStr.split('(')[0].trim();
      return { code, name };
    }
    const l = locationStr.toLowerCase();
    if (l.includes('malpensa') || l.includes('milano')) return { code: 'MXP', name: 'Milano' };
    if (l.includes('pechino') || l.includes('beijing')) return { code: 'PEK', name: 'Pechino' };
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
      code: firstWord.slice(0, 4).toUpperCase(),
      name: locationStr.length > 25 ? locationStr.slice(0, 22) + '...' : locationStr
    };
  };

  const originInfo = extractCodeOrCity(transport.departureLocation);
  const destInfo = extractCodeOrCity(transport.dropoffLocation || transport.arrivalLocation);
  
  const typeConfig: Record<TipoTrasporto, { label: string; icon: string; modeIcon: string }> = {
    volo: { label: 'Volo', icon: '✈️', modeIcon: '✈️' },
    traghetto: { label: 'Traghetto', icon: '⛴️', modeIcon: '🚢' },
    camper: { label: 'Campervan', icon: '🚐', modeIcon: '🚐' },
    auto: { label: 'Auto a Noleggio', icon: '🚗', modeIcon: '🚗' },
    transfer: { label: 'Transfer / Taxi', icon: '🚕', modeIcon: '🚕' },
    treno: { label: 'Treno', icon: '🚆', modeIcon: '🚆' }
  };
  const currentType = typeConfig[transport.type] || typeConfig.transfer;
  
  const statusLabel = {
    pianificato: 'Pianificato',
    prenotato: 'Confermato',
    da_prenotare: 'In attesa',
    completato: 'Completato',
    annullato: 'Annullato'
  }[transport.status] || transport.status;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <div 
        onClick={onDetail || onEdit}
        className={`w-full rounded-2xl ${variant === 'compact' ? 'p-3' : 'p-3.5 sm:p-4'} border shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800`}
      >
        {/* Decorazione tacche laterali stile Boarding Pass Wallet (cerchietti ritagliati) */}
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 pointer-events-none" />
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 pointer-events-none" />

        {/* TOP */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-xs font-medium">
              <span className="text-sm">{currentType.icon}</span> {currentType.label}
            </span>
            <div className="flex flex-col ml-1">
              <span className="font-semibold text-base text-slate-800 dark:text-slate-100 leading-snug">
                {transport.carrier || currentType.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(transport.noteCopilota || transport.copilota) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 transition-colors shadow-2xs"
                title="Apri per visualizzare la nota del co-pilota"
              >
                🧭 Co-pilota
              </button>
            )}
            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${transport.status === 'prenotato' || transport.status === 'completato' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* BODY */}
        <div className="py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* ORIGINE */}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                {originInfo.code}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-normal truncate mt-0.5">
                {originInfo.name}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                {formatDate(transport.date)} {transport.departureTime ? `• ${transport.departureTime}` : ''}
              </p>
            </div>

            {/* TRATTA CENTRALE */}
            <div className="flex-1 flex flex-col items-center justify-center px-1">
              <div className="relative w-full flex items-center justify-center">
                <div className="w-full border-t-2 border-dashed border-slate-300 dark:border-slate-600" />
                <span className="absolute p-1 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-xs">
                  {currentType.modeIcon}
                </span>
              </div>
              {transport.layover ? (
                <div className="mt-1 text-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    Scalo {transport.layover.airport.split(' ')[0]}
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    Diretto
                  </span>
                </div>
              )}
            </div>

            {/* DESTINAZIONE */}
            <div className="flex-1 min-w-0 text-right">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                {destInfo.code}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-normal truncate mt-0.5">
                {destInfo.name}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                {transport.arrivalTime ? `h ${transport.arrivalTime}` : 'Arrivo'}
              </p>
            </div>
          </div>

          {transport.posti && (
            <div className="mt-2 flex flex-col items-start">
              <div className="text-xs font-medium px-2 py-0.5 rounded-full text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 inline-flex items-center gap-1">
                💺 Posti: {transport.posti}
              </div>
            </div>
          )}

          {/* BOX NOTE COPILOTA */}
          {(transport.noteCopilota || transport.copilota) && (
            <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-2.5 rounded-lg text-xs leading-relaxed text-amber-900 dark:text-amber-200 mt-2.5 flex items-start gap-1.5">
              <span className="shrink-0 text-sm">🧭</span>
              <span className="flex-1 break-words">{transport.noteCopilota || transport.copilota}</span>
            </div>
          )}
        </div>

        {/* BOTTOM */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center">
            {transport.cost === '0.00' || transport.cost === '0' ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full text-sky-700 bg-sky-50 border border-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50">
                Incluso nel pacchetto
              </span>
            ) : transport.cost ? (
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                {transport.cost}
              </span>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                Costo da definire
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {transport.bookingCode && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsPNROpen(true); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-medium transition-colors"
              >
                <span className="text-[10px]">#️⃣</span> PNR
              </button>
            )}
            {canHaveTickets && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsTicketsOpen(true); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 text-xs font-medium transition-colors shadow-2xs"
              >
                <span className="text-[10px]">🎫</span> Biglietto
              </button>
            )}
            {activeMapUrl && (
              <a
                href={activeMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-medium transition-colors"
              >
                <span className="text-[10px]">📍</span> Maps
              </a>
            )}
          </div>
        </div>
      </div>

      <TrasportoTicketsModal
        isOpen={isTicketsOpen}
        onClose={() => setIsTicketsOpen(false)}
        transport={transport}
        onUpdateTransport={(updated) => { if (onUpdate) onUpdate(updated); }}
      />
      {isPNROpen && transport.bookingCode && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { e.stopPropagation(); setIsPNROpen(false); }}
        >
          <div 
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center text-2xl mx-auto mb-3 shadow-2xs">
              🎟️
            </div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-500">Codice PNR</h3>
            <div className="my-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="font-mono text-xl sm:text-2xl font-black text-slate-900 tracking-wider select-all break-all">
                {transport.bookingCode}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsPNROpen(false); }}
              className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors w-full cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
