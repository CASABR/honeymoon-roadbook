import { useState, useEffect } from 'react';
import type { Trasporto, TipoTrasporto } from '../../types';
import Badge from '../common/Badge';
import TrasportoInfoModal from '../modals/TrasportoInfoModal';
import TrasportoTicketsModal from '../modals/TrasportoTicketsModal';
import { getTransportMapTargets } from '../../utils/mapsHelper';
import { storageService } from '../../storage/storageService';

interface TrasportoCardProps {
  transport: Trasporto;
  variant?: 'full' | 'compact';
  onEdit: () => void;
  onDelete?: () => void;
  onUpdate?: (updated: Trasporto) => void;
}

export default function TrasportoCard({
  transport: initialTransport,
  variant = 'full',
  onEdit,
  onUpdate
}: TrasportoCardProps) {
  const [transport, setTransport] = useState<Trasporto>(initialTransport);
  const [isCopied, setIsCopied] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isTicketsOpen, setIsTicketsOpen] = useState(false);
  const [isPNROpen, setIsPNROpen] = useState(false);

  useEffect(() => {
    setTransport(initialTransport);
  }, [initialTransport]);

  const attachmentsCount = transport.attachments?.length || 0;
  const mapTargets = getTransportMapTargets(transport);

  const handleUpdateTransport = (updated: Trasporto) => {
    setTransport(updated);
    if (onUpdate) {
      onUpdate(updated);
    }
  };

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...transport, completed: !transport.completed };
    try {
      await storageService.saveTransport(updated);
      handleUpdateTransport(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyBookingCode = async () => {
    if (!transport.bookingCode) return;
    try {
      await navigator.clipboard.writeText(transport.bookingCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Errore durante la copia:', err);
    }
  };

  // Helper per estrarre codice aeroportuale o nome breve della città
  const extractCodeOrCity = (locationStr: string): { code: string; name: string } => {
    if (!locationStr) return { code: 'LOC', name: 'Destinazione' };
    const match = locationStr.match(/\(([A-Z]{3})\)/i);
    if (match && match[1]) {
      const code = match[1].toUpperCase();
      const name = locationStr.split('(')[0].trim();
      return { code, name };
    }
    // Cerca se contiene codici noti o parole chiave
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
    if (l.includes('penneshaw')) return { code: 'KGC', name: 'Kangaroo Island' };
    if (l.includes('cape jervis')) return { code: 'CJV', name: 'Cape Jervis' };

    // Fallback: prime 3-4 lettere maiuscole
    const parts = locationStr.split(/[,\-–\s]+/);
    const firstWord = parts[0] || 'LOC';
    return {
      code: firstWord.slice(0, 4).toUpperCase(),
      name: locationStr.length > 25 ? locationStr.slice(0, 22) + '...' : locationStr
    };
  };

  let effDepartureLoc = transport.departureLocation;
  let effArrivalLoc = transport.dropoffLocation || transport.arrivalLocation;
  let effDepartureTime = transport.departureTime;
  let effArrivalTime = transport.arrivalTime || transport.dropoffTime;
  let effDepartureDate = transport.date;
  let effCarrier = transport.carrier;

  const originInfo = extractCodeOrCity(effDepartureLoc);
  const destInfo = extractCodeOrCity(effArrivalLoc);

  const typeConfig: Record<
    TipoTrasporto,
    { label: string; icon: string; themeColor: string; bgSoft: string; textAccent: string; modeIcon: string }
  > = {
    volo: {
      label: 'Volo',
      icon: '✈️',
      themeColor: 'from-blue-600 to-indigo-600',
      bgSoft: 'bg-blue-50/80 border-blue-200/80',
      textAccent: 'text-blue-700',
      modeIcon: '✈️'
    },
    traghetto: {
      label: 'Traghetto',
      icon: '⛴️',
      themeColor: 'from-cyan-600 to-teal-600',
      bgSoft: 'bg-cyan-50/80 border-cyan-200/80',
      textAccent: 'text-cyan-800',
      modeIcon: '🚢'
    },
    camper: {
      label: 'Campervan',
      icon: '🚐',
      themeColor: 'from-amber-600 to-orange-600',
      bgSoft: 'bg-amber-50/80 border-amber-200/80',
      textAccent: 'text-amber-800',
      modeIcon: '🚐'
    },
    auto: {
      label: 'Auto a Noleggio',
      icon: '🚗',
      themeColor: 'from-amber-600 to-yellow-600',
      bgSoft: 'bg-amber-50/80 border-amber-200/80',
      textAccent: 'text-amber-800',
      modeIcon: '🚗'
    },
    transfer: {
      label: 'Transfer / Taxi',
      icon: '🚕',
      themeColor: 'from-emerald-600 to-teal-600',
      bgSoft: 'bg-emerald-50/80 border-emerald-200/80',
      textAccent: 'text-emerald-800',
      modeIcon: '🚕'
    },
    treno: {
      label: 'Treno',
      icon: '🚆',
      themeColor: 'from-violet-600 to-purple-600',
      bgSoft: 'bg-violet-50/80 border-violet-200/80',
      textAccent: 'text-violet-800',
      modeIcon: '🚆'
    }
  };

  const currentType = typeConfig[transport.type] || typeConfig.transfer;
  const isRental = transport.type === 'auto' || transport.type === 'camper';

  const statusVariant = {
    pianificato: 'sky',
    prenotato: 'emerald',
    da_prenotare: 'amber',
    completato: 'slate',
    annullato: 'rose'
  }[transport.status] as 'sky' | 'emerald' | 'amber' | 'slate' | 'rose';

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

  const hasInfo = Boolean(transport.notes?.trim() || transport.layover);
  const canHaveTickets =
    transport.type === 'volo' ||
    transport.type === 'traghetto' ||
    transport.type === 'treno' ||
    transport.type === 'auto' ||
    transport.type === 'camper' ||
    Boolean(transport.bookingCode || transport.ticketUrl || attachmentsCount > 0);

  // Determina quale link Google Maps ha la massima pertinenza (partenza prima del viaggio, arrivo se concluso)
  const activeMapUrl = transport.status === 'completato' 
    ? (mapTargets.arrivalUrl || mapTargets.dropoffUrl || mapTargets.primaryUrl)
    : (mapTargets.departureUrl || mapTargets.pickupUrl || mapTargets.primaryUrl);



  return (
    <>
      <article
        className={`w-full rounded-3xl ${variant === 'compact' ? 'p-3' : 'p-4'} border shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-slate-300 ${
          transport.completed
            ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60'
            : 'bg-white border-slate-200/90'
        }`}
      >
        {/* Decorazione tacche laterali stile Boarding Pass Wallet (cerchietti ritagliati) */}
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 border border-slate-200/60 pointer-events-none" />
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 border border-slate-200/60 pointer-events-none" />

        {/* 1. HEADER BOARDING PASS */}
        <header className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-base shrink-0 shadow-2xs">
              {currentType.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {currentType.label}
                </span>
                {transport.copilota && (
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200">
                    🧭 Co-pilota
                  </span>
                )}
              </div>
              <div className="flex items-start gap-1.5 mt-0.5">
                <button
                  type="button"
                  onClick={handleToggleComplete}
                  className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center cursor-pointer transition-all mt-0.5 ${
                    transport.completed
                      ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                      : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400'
                  }`}
                  aria-label={transport.completed ? 'Segna come da fare' : 'Segna come completato'}
                >
                  {transport.completed && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <h2 className={`text-xs sm:text-sm font-extrabold text-[#172033] dark:text-slate-50 truncate ${transport.completed ? 'opacity-75' : ''}`}>
                  {effCarrier || 'Tratta programmata'}
                </h2>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge label={statusLabel} variant={statusVariant} />
            <div className="text-right flex items-center justify-center">
              {effDepartureTime ? (
                <div>
                  <span className="text-xs font-mono font-extrabold text-[#172033] dark:text-slate-50 block leading-none">
                    {effDepartureTime}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium leading-none">Partenza</span>
                </div>
              ) : (
                <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[10px] font-bold text-[#64748B] dark:text-slate-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 transition">
                  ⏱️ Orario?
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 2. DIAGRAMMA VISIVO DELLA TRATTA (Boarding Pass Departure -> Route -> Arrival) */}
        <div className="py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* ORIGINE / PARTENZA */}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-2xl sm:text-3xl font-black text-[#172033] dark:text-slate-50 tracking-tight font-mono">
                {originInfo.code}
              </div>
              <p className="text-[11px] font-bold text-slate-700 truncate mt-0.5" title={effDepartureLoc}>
                {originInfo.name}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {formatDate(effDepartureDate)} {effDepartureTime ? `• ${effDepartureTime}` : ''}
              </p>
            </div>

            {/* TRATTA CENTRALE GRAFICA CON SCALO O ICONA MEZZO */}
            <div className="flex-1 flex flex-col items-center justify-center px-1">
              <div className="relative w-full flex items-center justify-center">
                <div className="w-full border-t-2 border-dashed border-slate-300" />
                <span className="absolute p-1.5 bg-white rounded-full border border-slate-200 shadow-2xs text-xs">
                  {currentType.modeIcon}
                </span>
              </div>

              {transport.layover ? (
                <div className="mt-2 text-center flex flex-col gap-1 items-center justify-center">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <span>🛑 Scalo {transport.layover.airport.split(' ')[0]}</span>
                    {transport.layover.duration && <span>({transport.layover.duration})</span>}
                  </span>
                  {/* Detailed layover info */}
                  <div className="text-[9px] text-[#64748B] dark:text-slate-400 font-medium">
                     {transport.layover.departureDate ? formatDate(transport.layover.departureDate) : ''} {transport.layover.departureTime ? ` h ${transport.layover.departureTime}` : ''}
                     {transport.layover.carrier && ` • ${transport.layover.carrier}`}
                  </div>
                </div>
              ) : isRental ? (
                <div className="mt-2 text-center">
                  <span className="text-[9px] font-semibold text-[#64748B] dark:text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {transport.dropoffDate ? `Fino al ${formatDate(transport.dropoffDate)}` : 'Noleggio'}
                  </span>
                </div>
              ) : (
                <div className="mt-2 text-center">
                  <span className="text-[9px] font-semibold text-slate-400">
                    Tratta Diretta
                  </span>
                </div>
              )}
            </div>

            {/* DESTINAZIONE / ARRIVO */}
            <div className="flex-1 min-w-0 text-right">
              <div className="text-2xl sm:text-3xl font-black text-[#172033] dark:text-slate-50 tracking-tight font-mono">
                {destInfo.code}
              </div>
              <p className="text-[11px] font-bold text-slate-700 truncate mt-0.5" title={effArrivalLoc}>
                {destInfo.name}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {effArrivalTime ? `h ${effArrivalTime}` : 'Arrivo'}
                {transport.arrivalDate && transport.arrivalDate !== effDepartureDate ? ` (+1)` : ''}
              </p>
            </div>
          </div>

          {/* Scalo o noleggio extra se presenti (senza blocco DA/A duplicato) */}
          {transport.notes && transport.notes.includes('Ritira') && (
            <div className="mt-2 text-xs text-[#64748B] dark:text-slate-400 bg-slate-50 p-2 rounded-xl border border-slate-100">
              {transport.notes}
            </div>
          )}
        </div>

        {/* 3. BANDA INFERIORE "DETTAGLI OPERATIVI" */}
        {variant === 'full' && (
        <footer className="mt-2">
          {/* RIGA 1: COSTI E PAGAMENTI */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-800 w-full">
            {/* Costo / Saldo */}
            {transport.cost && transport.cost.trim() && !transport.cost.toLowerCase().includes('incluso') && (
              <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${
                transport.cost.toLowerCase().includes('saldato') 
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' 
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }`}>
                {transport.cost.toLowerCase().match(/saldato|saldare|costo|saldo/) ? transport.cost : `Costo: ${transport.cost}`}
              </span>
            )}
            {/* Acconto */}
            {(transport.depositPaid || transport.acconto) && (
              <span className="inline-flex items-center bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium px-2 py-0.5 rounded-md">
                Acconto: {transport.depositPaid || transport.acconto}
              </span>
            )}
          </div>

          {/* RIGA 2: PULSANTI D'AZIONE */}
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 dark:border-slate-800/50">
            {/* LATO SINISTRO: Azioni Principali */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Maps */}
              {activeMapUrl && (
                <a
                  href={activeMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
                >
                  <span className="text-[10px]">📍</span> Maps
                </a>
              )}

              {/* PNR (spostato nella riga azioni per salvare spazio) */}
              {transport.bookingCode && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsPNROpen(true); }}
                  title="Mostra Codice PNR"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
                >
                  <span className="text-[10px]">#️⃣</span> PNR
                </button>
              )}

              {/* Pass / Biglietti */}
              {canHaveTickets && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsTicketsOpen(true); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
                >
                  <span className="text-[10px]">🎟️</span> Pass/QR
                  {attachmentsCount > 0 && (
                    <span className="ml-1 px-1.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[9px] font-bold">
                      {attachmentsCount}
                    </span>
                  )}
                </button>
              )}

              {/* Dettagli (Ghost) */}
              {hasInfo && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsInfoOpen(true); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
                >
                  <span className="text-[10px]">ℹ️</span> Dettagli
                </button>
              )}
            </div>

            {/* LATO DESTRO: Gestione */}
            
          </div>
        </footer>
        )}
      </article>

      {/* MODAL DETTAGLI / INFO "i" */}
      <TrasportoInfoModal
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        transport={transport}
      />

      {/* MODAL BIGLIETTI & QR CODE */}
      <TrasportoTicketsModal
        isOpen={isTicketsOpen}
        onClose={() => setIsTicketsOpen(false)}
        transport={transport}
        onUpdateTransport={handleUpdateTransport}
      />

      {/* MICRO-MODALE / POPOVER PNR ELEGANTE STILE IOS */}
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
            
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
              Codice Prenotazione (PNR)
            </h3>
            
            <p className="text-xs text-slate-400 mt-0.5">
              {transport.carrier || 'Trasporto'} • {originInfo.code} ➔ {destInfo.code}
            </p>

            <div className="my-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="font-mono text-xl sm:text-2xl font-black text-[#172033] dark:text-slate-50 tracking-wider select-all break-all">
                {transport.bookingCode}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyBookingCode}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isCopied ? (
                  <>
                    <span className="text-sm">✓</span>
                    <span>Copiato negli appunti!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copia Codice</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsPNROpen(false); }}
                className="py-3 px-4 rounded-xl text-xs font-semibold text-[#64748B] dark:text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
