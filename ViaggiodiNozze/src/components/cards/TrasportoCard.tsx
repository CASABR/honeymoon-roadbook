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
  const [copied, setCopied] = useState(false);
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

  // Stili cromatici distintivi per categoria di trasporto
  const typeConfig: Record<
    TipoTrasporto,
    { label: string; icon: string; borderAccent: string; badgeStyle: string }
  > = {
    volo: {
      label: 'Volo',
      icon: '✈️',
      borderAccent: 'border-l-4 border-l-blue-600',
      badgeStyle: 'bg-blue-50 text-blue-800 border border-blue-200'
    },
    traghetto: {
      label: 'Traghetto / Barca',
      icon: '⛴️',
      borderAccent: 'border-l-4 border-l-cyan-600',
      badgeStyle: 'bg-cyan-50 text-cyan-800 border border-cyan-200'
    },
    camper: {
      label: 'Noleggio Campervan',
      icon: '🚐',
      borderAccent: 'border-l-4 border-l-amber-600',
      badgeStyle: 'bg-amber-50 text-amber-800 border border-amber-200'
    },
    auto: {
      label: 'Noleggio Auto',
      icon: '🚗',
      borderAccent: 'border-l-4 border-l-amber-600',
      badgeStyle: 'bg-amber-50 text-amber-800 border border-amber-200'
    },
    transfer: {
      label: 'Transfer / Taxi',
      icon: '🚕',
      borderAccent: 'border-l-4 border-l-emerald-600',
      badgeStyle: 'bg-emerald-50 text-emerald-800 border border-emerald-200'
    },
    treno: {
      label: 'Treno',
      icon: '🚄',
      borderAccent: 'border-l-4 border-l-indigo-600',
      badgeStyle: 'bg-indigo-50 text-indigo-800 border border-indigo-200'
    },
    bus: {
      label: 'Bus',
      icon: '🚌',
      borderAccent: 'border-l-4 border-l-blue-600',
      badgeStyle: 'bg-blue-50 text-blue-800 border border-blue-200'
    },
    altro: {
      label: 'Spostamento',
      icon: '🧭',
      borderAccent: 'border-l-4 border-l-slate-400',
      badgeStyle: 'bg-slate-100 text-slate-800 border border-slate-200'
    }
  };

  const currentType = typeConfig[transport.type] || typeConfig.altro;
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

  const handleCopyBookingCode = async () => {
    if (!transport.bookingCode) return;
    try {
      await navigator.clipboard.writeText(transport.bookingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Errore durante la copia:', err);
    }
  };

  // Rendering del Prezzo / Costo Sempre Visibile con Codice Colore Immediato
  const renderCostBadge = () => {
    if (!transport.cost || !transport.cost.trim()) {
      return (
        <span className="inline-flex items-center text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200">
          Costo n/d
        </span>
      );
    }

    const rawCost = transport.cost.trim();
    const lower = rawCost.toLowerCase();

    const isPaid =
      lower.includes('saldato') ||
      lower.includes('incluso') ||
      lower.includes('confermato') ||
      lower.includes('acquistato') ||
      (transport.status === 'prenotato' &&
        !lower.includes('da saldare') &&
        !lower.includes('attesa') &&
        !lower.includes('stimato') &&
        !lower.includes('definizione'));

    const isPending =
      lower.includes('da saldare') ||
      lower.includes('attesa') ||
      lower.includes('stimato') ||
      lower.includes('definizione') ||
      lower.includes('da finalizzare') ||
      lower.includes('posto') ||
      transport.status === 'da_prenotare';

    if (isPaid && !isPending) {
      // 🟢 VERDE (Smeraldo)
      const label = rawCost.startsWith('✓') ? rawCost : `✓ ${rawCost}`;
      return (
        <span className="inline-flex items-center text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
          {label}
        </span>
      );
    }

    // 🔴 ROSSO (Rose/Rosso)
    const label = rawCost.startsWith('⏳') ? rawCost : `⏳ ${rawCost}`;
    return (
      <span className="inline-flex items-center text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
        {label}
      </span>
    );
  };

  const hasInfo = Boolean(transport.notes?.trim() || transport.layover);
  const canHaveTickets =
    transport.type === 'volo' ||
    transport.type === 'traghetto' ||
    transport.type === 'auto' ||
    transport.type === 'camper' ||
    Boolean(transport.bookingCode || transport.ticketUrl || attachmentsCount > 0);

  return (
    <>
      <article
        className={`w-full rounded-3xl border border-slate-200/80 ${currentType.borderAccent} bg-white p-4 shadow-sm transition-all duration-200 hover:border-slate-300`}
      >
        {/* 1. HEADER CARD: Categoria, Vettore e Prezzo in Euro Sempre in Primo Piano */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {/* Badge Categoria */}
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm shrink-0 ${currentType.badgeStyle}`}
            >
              <span>{currentType.icon}</span>
              <span>{currentType.label}</span>
            </span>

            {/* Vettore / Compagnia */}
            {transport.carrier && !isRental && (
              <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 truncate max-w-[160px] sm:max-w-none">
                {transport.carrier}
              </span>
            )}

            {/* Badge Stato compatto */}
            <Badge label={statusLabel} variant={statusVariant} />

            {/* Badge Co-pilota */}
            {transport.copilota && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span>🧭</span>
                <span>Co-pilota</span>
              </span>
            )}
          </div>

          {/* PREZZO IN EURO IN ALTO A DESTRA */}
          <div className="shrink-0">{renderCostBadge()}</div>
        </div>

        {/* 2. CORPO DELLA CARD: TRATTA O TIMELINE ESSENZIALE */}
        <div className="pt-2.5 pb-1">
          {isRental ? (
            /* ================= LAYOUT DEDICATO NOLEGGI (AUTO & CAMPER) ================= */
            <div className="space-y-2">
              {transport.carrier && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <span className="text-amber-500">🔑</span>
                  <span>{transport.carrier}</span>
                </div>
              )}

              {/* Box Ritiro & Riconsegna essenziale */}
              <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                {/* Ritiro */}
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-800 shrink-0 text-[10px] mt-0.5">
                    🔑
                  </div>
                  <div className="text-xs leading-tight min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="font-bold text-amber-800 uppercase tracking-wider text-[10px]">
                        Ritiro (Pick-up)
                      </span>
                      <span className="font-mono text-slate-900 font-bold text-[11px]">
                        {formatDate(transport.date)}
                        {transport.departureTime ? ` • h ${transport.departureTime}` : ''}
                      </span>
                    </div>
                    <div className="text-slate-600 mt-0.5 font-medium truncate">
                      {transport.departureLocation}
                    </div>
                  </div>
                </div>

                {/* Riconsegna */}
                <div className="flex items-start gap-2 pt-2 border-t border-slate-200/60">
                  <div className="w-5 h-5 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-800 shrink-0 text-[10px] mt-0.5">
                    🏁
                  </div>
                  <div className="text-xs leading-tight min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="font-bold text-amber-800 uppercase tracking-wider text-[10px]">
                        Riconsegna (Drop-off)
                      </span>
                      <span className="font-mono text-slate-900 font-bold text-[11px]">
                        {formatDate(transport.dropoffDate || transport.date)}
                        {transport.dropoffTime ? ` • h ${transport.dropoffTime}` : ''}
                      </span>
                    </div>
                    <div className="text-slate-600 mt-0.5 font-medium truncate">
                      {transport.dropoffLocation || transport.arrivalLocation}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ================= LAYOUT VOLI, TRAGHETTI E TRANSFER ================= */
            <div className="relative pl-5 py-0.5 space-y-3">
              {/* Linea verticale grafica continua */}
              <div className="absolute left-[6px] top-2.5 bottom-2.5 w-0.5 border-l-2 border-dashed border-slate-200" />

              {/* 1. PUNTO PARTENZA */}
              <div className="relative flex items-start gap-2">
                <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-100 flex items-center justify-center shrink-0">
                  <div className="w-1 h-1 rounded-full bg-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-mono font-extrabold text-slate-900 tracking-wide">
                      {transport.departureTime || 'Orario n/d'}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                      Partenza
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {transport.departureLocation}
                  </div>
                </div>
              </div>

              {/* 2. PUNTO SCALO COMPATTO (SE PRESENTE) */}
              {transport.layover && (
                <div className="relative flex items-start gap-2 my-1">
                  <div className="absolute -left-5 top-2 w-3 h-3 rounded-full bg-amber-500 ring-4 ring-amber-100 flex items-center justify-center shrink-0">
                    <div className="w-1 h-1 rounded-full bg-white" />
                  </div>

                  <div className="min-w-0 flex-1 p-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1 truncate">
                      <span>🛑</span>
                      <span>Scalo: {transport.layover.airport}</span>
                    </span>
                    {transport.layover.duration && (
                      <span className="text-[10px] font-bold font-mono text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded">
                        ⏳ {transport.layover.duration}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 3. PUNTO ARRIVO FINALE */}
              <div className="relative flex items-start gap-2">
                <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-emerald-600 ring-4 ring-emerald-100 flex items-center justify-center shrink-0">
                  <div className="w-1 h-1 rounded-full bg-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-mono font-extrabold text-slate-900 tracking-wide">
                      {transport.arrivalTime || 'Orario n/d'}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Arrivo
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {transport.arrivalLocation}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGA INFERIORE PULITA: PNR + AZIONI MIRATE */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
          {/* Sezione Sinistra: PNR Rapido (se presente) */}
          <div className="flex items-center gap-1.5">
            {transport.bookingCode ? (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200">
                <span className="text-[10px] text-slate-500 font-medium">PNR:</span>
                <span className="text-xs font-mono text-blue-700 font-bold tracking-wider">
                  {transport.bookingCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyBookingCode}
                  title="Copia PNR"
                  className="ml-0.5 p-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors cursor-pointer active:scale-95 min-w-[24px] flex items-center justify-center"
                >
                  {copied ? (
                    <span className="text-emerald-600 font-bold text-[11px]">✓</span>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            ) : (
              <span className="text-[11px] font-mono text-slate-400 font-medium">
                {formatDate(transport.date)}
              </span>
            )}
          </div>

          {/* Sezione Destra: Pulsanti Mirati (Naviga se Maps, Info se note, Pass se accessibile) */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* 1. Pulsante Naviga Google Maps (Solo se presente) */}
            {mapTargets.primaryUrl && (
              <a
                href={mapTargets.primaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Naviga su Google Maps verso ${mapTargets.primaryLabel}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer active:scale-95 min-h-[38px]"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[11px]">Naviga</span>
              </a>
            )}

            {/* 2. Pulsante Info "i" (Solo se presenti note operative o scali) */}
            {hasInfo && (
              <button
                type="button"
                onClick={() => setIsInfoOpen(true)}
                title="Dettagli e istruzioni operative"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all cursor-pointer active:scale-95 min-h-[38px]"
              >
                <span className="font-bold text-[13px] leading-none">ℹ</span>
                <span className="text-[11px]">Info</span>
              </button>
            )}

            {/* 3. Pulsante Biglietti & QR Code (Solo per tratte con titolo o allegati) */}
            {canHaveTickets && (
              <button
                type="button"
                onClick={() => setIsTicketsOpen(true)}
                title="Biglietti, Pass e QR Code offline"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 min-h-[38px] border ${
                  attachmentsCount > 0
                    ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                <span className="text-xs">🎟️</span>
                <span className="text-[11px]">Pass</span>
                {attachmentsCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-600 text-white">
                    {attachmentsCount}
                  </span>
                )}
              </button>
            )}

            {/* 4. Pulsante Modifica */}
            <button
              type="button"
              onClick={onEdit}
              title="Modifica trasporto"
              className="w-9 h-9 min-h-[38px] min-w-[38px] rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer active:scale-95 flex items-center justify-center border border-slate-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>

            {/* 5. Pulsante Elimina */}
            <button
              type="button"
              onClick={onDelete}
              title="Elimina trasporto"
              className="w-9 h-9 min-h-[38px] min-w-[38px] rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer active:scale-95 flex items-center justify-center border border-slate-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
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
