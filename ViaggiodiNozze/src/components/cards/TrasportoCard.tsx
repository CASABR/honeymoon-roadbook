import { useState } from 'react';
import type { Trasporto, TipoTrasporto } from '../../types';
import TrasportoTicketsModal from '../modals/TrasportoTicketsModal';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { getTransportMapTargets } from '../../utils/mapsHelper';
import { resolvePaymentInfo } from '../../utils/priceHelper';

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
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  const attachmentsCount = transport.attachments?.length || 0;
  const mapTargets = getTransportMapTargets(transport);
  const canHaveTickets =
    transport.type === 'volo' ||
    transport.type === 'traghetto' ||
    transport.type === 'treno' ||
    transport.type === 'auto' ||
    transport.type === 'camper' ||
    Boolean(transport.bookingCode || transport.ticketUrl || attachmentsCount > 0);

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
        className={`w-full rounded-2xl ${variant === 'compact' ? 'p-3' : 'p-3.5 sm:p-4'} border shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700`}
      >
        {/* Decorazione tacche laterali stile Boarding Pass Wallet (cerchietti ritagliati) */}
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700 pointer-events-none" />
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700 pointer-events-none" />

        {/* TOP */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[11px] font-semibold uppercase tracking-wider">
              <span className="text-sm">{currentType.icon}</span> {currentType.label}
            </span>
            <div className="flex flex-col ml-1">
              <span className="font-semibold text-base leading-snug tracking-tight text-slate-900 dark:text-white">
                {transport.carrier || currentType.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {transport.status && transport.status !== 'completato' && (
              <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600">
                {statusLabel}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer shadow-2xs ${
                (transport.noteCopilota || transport.copilota)
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 opacity-60 hover:opacity-100'
              }`}
              title="Note Copilota"
            >
              <span className="text-sm">🧭</span>
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* ORIGINE */}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                {originInfo.code}
              </div>
              <p className="text-sm font-medium tracking-normal text-slate-600 dark:text-slate-300 truncate mt-0.5">
                {originInfo.name}
              </p>
              <p className="text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400 mt-0.5">
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
                  <span className="text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400">
                    Scalo {transport.layover.airport.split(' ')[0]}
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-center">
                  <span className="text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400">
                    Diretto
                  </span>
                </div>
              )}
            </div>

            {/* DESTINAZIONE */}
            <div className="flex-1 min-w-0 text-right">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                {destInfo.code}
              </div>
              <p className="text-sm font-medium tracking-normal text-slate-600 dark:text-slate-300 truncate mt-0.5">
                {destInfo.name}
              </p>
              <p className="text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400 mt-0.5">
                {transport.arrivalTime ? `h ${transport.arrivalTime}` : 'Arrivo'}
              </p>
            </div>
          </div>

          {transport.posti && (
            <div className="mt-2 flex flex-col items-start">
              <div className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 inline-flex items-center gap-1">
                💺 Posti: {transport.posti}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {isPackageIncluded ? (
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full text-sky-700 bg-sky-50 border border-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50">
                Incluso nel pacchetto
              </span>
            ) : isFree ? (
              <span className="text-sm font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                Gratuito
              </span>
            ) : transport.cost ? (
              <span className="text-sm font-medium tracking-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                {displayText}
              </span>
            ) : (
              <span className="text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400">
                Costo da definire
              </span>
            )}

            {!isFree && !isPackageIncluded && (
              <button
                type="button"
                onClick={handleTogglePayment}
                className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-2xs ${
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

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {Boolean(transport.bookingCode && transport.bookingCode.trim()) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsPNROpen(true); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-medium transition-colors"
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
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-medium transition-colors"
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
      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={transport.carrier || currentType.label}
        noteCopilota={transport.noteCopilota || (typeof transport.copilota === 'string' ? transport.copilota : '')}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated: Trasporto = {
              ...transport,
              noteCopilota: notes.trim(),
              copilota: Boolean(notes.trim()) || transport.copilota,
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
