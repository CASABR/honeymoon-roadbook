import { useState, useEffect } from 'react';
import type { Trasporto, TipoTrasporto } from '../../types';
import Badge from '../common/Badge';
import TrasportoInfoModal from '../modals/TrasportoInfoModal';
import TrasportoTicketsModal from '../modals/TrasportoTicketsModal';
import { getTransportMapTargets } from '../../utils/mapsHelper';

interface TrasportoCardProps {
  transport: Trasporto;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate?: (updated: Trasporto) => void;
}

export default function TrasportoCard({
  transport: initialTransport,
  onEdit,
  onDelete,
  onUpdate
}: TrasportoCardProps) {
  const [transport, setTransport] = useState<Trasporto>(initialTransport);
  const [isCopied, setIsCopied] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isTicketsOpen, setIsTicketsOpen] = useState(false);

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

  const originInfo = extractCodeOrCity(transport.departureLocation);
  const destInfo = extractCodeOrCity(transport.dropoffLocation || transport.arrivalLocation);

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
    transport.type === 'auto' ||
    transport.type === 'camper' ||
    Boolean(transport.bookingCode || transport.ticketUrl || attachmentsCount > 0);

  // Determina quale link Google Maps ha la massima pertinenza (partenza prima del viaggio, arrivo se concluso)
  const activeMapUrl = transport.status === 'completato' 
    ? (mapTargets.arrivalUrl || mapTargets.dropoffUrl || mapTargets.primaryUrl)
    : (mapTargets.departureUrl || mapTargets.pickupUrl || mapTargets.primaryUrl);

  const activeMapLabel = transport.status === 'completato' ? 'Arrivo' : 'Partenza';

  return (
    <>
      <article
        className="w-full bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-slate-300"
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
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                {transport.carrier || 'Tratta programmata'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge label={statusLabel} variant={statusVariant} />
            <div className="text-right">
              <span className="text-xs font-mono font-extrabold text-slate-900">
                {transport.departureTime || '--:--'}
              </span>
              <p className="text-[9px] text-slate-400 font-medium">Partenza</p>
            </div>
          </div>
        </header>

        {/* 2. DIAGRAMMA VISIVO DELLA TRATTA (Boarding Pass Departure -> Route -> Arrival) */}
        <div className="py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* ORIGINE / PARTENZA */}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
                {originInfo.code}
              </div>
              <p className="text-[11px] font-bold text-slate-700 truncate mt-0.5" title={transport.departureLocation}>
                {originInfo.name}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {formatDate(transport.date)} {transport.departureTime ? `• ${transport.departureTime}` : ''}
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

              {/* Scalo o durata se presenti */}
              {transport.layover ? (
                <div className="mt-2 text-center">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <span>🛑 Scalo {transport.layover.airport.split(' ')[0]}</span>
                    {transport.layover.duration && <span>({transport.layover.duration})</span>}
                  </span>
                </div>
              ) : isRental ? (
                <div className="mt-2 text-center">
                  <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
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
              <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
                {destInfo.code}
              </div>
              <p className="text-[11px] font-bold text-slate-700 truncate mt-0.5" title={transport.dropoffLocation || transport.arrivalLocation}>
                {destInfo.name}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {transport.arrivalTime ? `${transport.arrivalTime}` : (transport.dropoffTime ? `h ${transport.dropoffTime}` : 'Arrivo')}
              </p>
            </div>
          </div>

          {/* Scalo o noleggio extra se presenti (senza blocco DA/A duplicato) */}
          {transport.notes && transport.notes.includes('Ritira') && (
            <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100">
              {transport.notes}
            </div>
          )}
        </div>

        {/* 3. BANDA INFERIORE "DETTAGLI OPERATIVI" COMPATTA SU SINGOLA RIGA */}
        <footer className="pt-2.5 border-t border-dashed border-slate-200 flex items-center justify-between gap-2">
          {/* Sezione Chip: PNR, Prezzo / Acconto */}
          <div className="flex items-center gap-1.5 flex-nowrap min-w-0 overflow-x-auto no-scrollbar">
            {/* Chip PNR con click per copiare */}
            {transport.bookingCode ? (
              <button
                type="button"
                onClick={handleCopyBookingCode}
                title="Tocca per copiare il codice prenotazione"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <span className="text-[9px] font-bold text-slate-500 uppercase">PNR</span>
                <span className="text-[11px] font-mono font-bold text-blue-700 tracking-wider">
                  {transport.bookingCode}
                </span>
                {isCopied ? (
                  <span className="text-emerald-600 font-bold text-xs ml-0.5">✓</span>
                ) : (
                  <svg className="w-2.5 h-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            ) : null}

            {/* Chip Costo in Euro (mostra solo importi reali in €, non 'Incluso nel pacchetto') */}
            {transport.cost && transport.cost.trim() && !transport.cost.toLowerCase().includes('incluso') && (
              <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${
                transport.cost.toLowerCase().includes('saldato')
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                {transport.cost}
              </span>
            )}

            {/* Chip Acconto */}
            {(transport.depositPaid || transport.acconto) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                <span>Acconto: {transport.depositPaid || transport.acconto}</span>
              </span>
            )}
          </div>

          {/* Azioni Rapide Compatte: Maps, Info, Pass, Modifica, Elimina */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Tasto Mappe Rapido Micro */}
            {activeMapUrl && (
              <a
                href={activeMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Apri su Google Maps (${activeMapLabel})`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer active:scale-95"
              >
                <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Maps ↗</span>
              </a>
            )}

            {/* Pulsante Info Micro */}
            {hasInfo && (
              <button
                type="button"
                onClick={() => setIsInfoOpen(true)}
                title="Dettagli e note"
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all cursor-pointer active:scale-95"
              >
                <span>Dettagli</span>
              </button>
            )}

            {/* Pulsante Pass / Biglietti */}
            {canHaveTickets && (
              <button
                type="button"
                onClick={() => setIsTicketsOpen(true)}
                title="Biglietti, Pass e QR Code offline"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer active:scale-95 border ${
                  attachmentsCount > 0
                    ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                <span>🎟️</span>
                <span>Pass</span>
                {attachmentsCount > 0 && (
                  <span className="ml-0.5 px-1 py-0.1 rounded-full text-[9px] font-bold bg-purple-600 text-white leading-none">
                    {attachmentsCount}
                  </span>
                )}
              </button>
            )}

            {/* Pulsante Modifica Discreto */}
            <button
              type="button"
              onClick={onEdit}
              title="Modifica trasporto"
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer active:scale-95 flex items-center justify-center border border-slate-200/80"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>

            {/* Pulsante Elimina Discreto */}
            <button
              type="button"
              onClick={onDelete}
              title="Elimina trasporto"
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer active:scale-95 flex items-center justify-center border border-slate-200/80"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </footer>
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
    </>
  );
}
