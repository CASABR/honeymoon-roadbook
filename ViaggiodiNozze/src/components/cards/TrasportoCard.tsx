import { useState, useEffect } from 'react';
import type { Trasporto, TipoTrasporto } from '../../types';
import Badge from '../common/Badge';
import TrasportoInfoModal from '../modals/TrasportoInfoModal';
import TrasportoTicketsModal from '../modals/TrasportoTicketsModal';

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

  const handleUpdateTransport = (updated: Trasporto) => {
    setTransport(updated);
    if (onUpdate) {
      onUpdate(updated);
    }
  };

  // Stili cromatici distintivi per categoria di trasporto
  const typeConfig: Record<
    TipoTrasporto,
    { label: string; icon: string; borderAccent: string; bgGradient: string; badgeStyle: string }
  > = {
    volo: {
      label: 'Volo',
      icon: '✈️',
      borderAccent: 'border-l-4 border-l-[#2563eb]',
      bgGradient: 'bg-gradient-to-br from-blue-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#dbeafe] text-[#1e40af] border border-blue-200'
    },
    traghetto: {
      label: 'Traghetto / Barca',
      icon: '⛴️',
      borderAccent: 'border-l-4 border-l-[#0891b2]',
      bgGradient: 'bg-gradient-to-br from-cyan-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#cffafe] text-[#155e75] border border-cyan-200'
    },
    camper: {
      label: 'Noleggio Campervan',
      icon: '🚐',
      borderAccent: 'border-l-4 border-l-[#d97706]',
      bgGradient: 'bg-gradient-to-br from-amber-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#fef3c7] text-[#92400e] border border-amber-200'
    },
    auto: {
      label: 'Noleggio Auto',
      icon: '🚗',
      borderAccent: 'border-l-4 border-l-[#d97706]',
      bgGradient: 'bg-gradient-to-br from-amber-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#fef3c7] text-[#92400e] border border-amber-200'
    },
    transfer: {
      label: 'Transfer / Taxi',
      icon: '🚕',
      borderAccent: 'border-l-4 border-l-[#059669]',
      bgGradient: 'bg-gradient-to-br from-emerald-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#d1fae5] text-[#065f46] border border-emerald-200'
    },
    treno: {
      label: 'Treno',
      icon: '🚄',
      borderAccent: 'border-l-4 border-l-indigo-600',
      bgGradient: 'bg-gradient-to-br from-indigo-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-indigo-100 text-indigo-800 border border-indigo-200'
    },
    bus: {
      label: 'Bus',
      icon: '🚌',
      borderAccent: 'border-l-4 border-l-blue-600',
      bgGradient: 'bg-gradient-to-br from-blue-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-blue-100 text-blue-800 border border-blue-200'
    },
    altro: {
      label: 'Spostamento',
      icon: '🧭',
      borderAccent: 'border-l-4 border-l-slate-600',
      bgGradient: 'bg-slate-900',
      badgeStyle: 'bg-slate-200 text-slate-800 border border-slate-300'
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
        <span className="inline-flex items-center text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-lg bg-slate-800/80 text-slate-400 border border-slate-700/80">
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
        <span className="inline-flex items-center text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm">
          {label}
        </span>
      );
    }

    // 🔴 ROSSO (Rose/Rosso)
    const label = rawCost.startsWith('⏳') ? rawCost : `⏳ ${rawCost}`;
    return (
      <span className="inline-flex items-center text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-sm">
        {label}
      </span>
    );
  };

  return (
    <>
      <article
        className={`w-full rounded-2xl border border-slate-800 ${currentType.borderAccent} ${currentType.bgGradient} p-3.5 shadow-md transition-all duration-200 hover:border-slate-700/90`}
      >
        {/* 1. HEADER CARD: Categoria, Vettore e Prezzo in Euro Sempre in Primo Piano */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/70">
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
              <span className="text-[11px] font-semibold text-slate-200 bg-slate-800/90 px-2 py-0.5 rounded-md border border-slate-700/60 truncate max-w-[160px] sm:max-w-none">
                {transport.carrier}
              </span>
            )}

            {/* Badge Stato compatto */}
            <Badge label={statusLabel} variant={statusVariant} />
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
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                  <span className="text-amber-400">🔑</span>
                  <span>{transport.carrier}</span>
                </div>
              )}

              {/* Box Ritiro & Riconsegna essenziale */}
              <div className="space-y-2 bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/60">
                {/* Ritiro */}
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 text-[10px] mt-0.5">
                    🔑
                  </div>
                  <div className="text-xs leading-tight min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="font-bold text-amber-400 uppercase tracking-wider text-[10px]">
                        Ritiro (Pick-up)
                      </span>
                      <span className="font-mono text-white font-semibold text-[11px]">
                        {formatDate(transport.date)}
                        {transport.departureTime ? ` • h ${transport.departureTime}` : ''}
                      </span>
                    </div>
                    <div className="text-slate-300 mt-0.5 font-medium truncate">
                      {transport.departureLocation}
                    </div>
                  </div>
                </div>

                {/* Riconsegna */}
                <div className="flex items-start gap-2 pt-1.5 border-t border-slate-700/60">
                  <div className="w-5 h-5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 text-[10px] mt-0.5">
                    🏁
                  </div>
                  <div className="text-xs leading-tight min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="font-bold text-amber-400 uppercase tracking-wider text-[10px]">
                        Riconsegna (Drop-off)
                      </span>
                      <span className="font-mono text-white font-semibold text-[11px]">
                        {formatDate(transport.dropoffDate || transport.date)}
                        {transport.dropoffTime ? ` • h ${transport.dropoffTime}` : ''}
                      </span>
                    </div>
                    <div className="text-slate-300 mt-0.5 font-medium truncate">
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
              <div className="absolute left-[6px] top-2.5 bottom-2.5 w-0.5 border-l-2 border-dashed border-sky-500/35" />

              {/* 1. PUNTO PARTENZA */}
              <div className="relative flex items-start gap-2">
                <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-sky-400 ring-4 ring-sky-500/20 flex items-center justify-center shrink-0">
                  <div className="w-1 h-1 rounded-full bg-slate-950" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-white tracking-wide">
                      {transport.departureTime || 'Orario n/d'}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">
                      Partenza
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {transport.departureLocation}
                  </div>
                </div>
              </div>

              {/* 2. PUNTO SCALO COMPATTO (SE PRESENTE) */}
              {transport.layover && (
                <div className="relative flex items-start gap-2 my-1">
                  <div className="absolute -left-5 top-2 w-3 h-3 rounded-full bg-amber-400 ring-4 ring-amber-500/20 flex items-center justify-center shrink-0">
                    <div className="w-1 h-1 rounded-full bg-slate-950" />
                  </div>

                  <div className="min-w-0 flex-1 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1 truncate">
                      <span>🛑</span>
                      <span>Scalo: {transport.layover.airport}</span>
                    </span>
                    {transport.layover.duration && (
                      <span className="text-[10px] font-bold font-mono text-amber-200 bg-amber-500/20 px-1.5 py-0.2 rounded">
                        ⏳ {transport.layover.duration}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 3. PUNTO ARRIVO FINALE */}
              <div className="relative flex items-start gap-2">
                <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 flex items-center justify-center shrink-0">
                  <div className="w-1 h-1 rounded-full bg-slate-950" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-white tracking-wide">
                      {transport.arrivalTime || 'Orario n/d'}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      Arrivo
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {transport.arrivalLocation}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGA INFERIORE PULITA: PNR + PULSANTI INFO "i", QR CODE/BIGLIETTI, MODIFICA ED ELIMINA */}
        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1.5 flex-wrap">
          {/* Sezione Sinistra: PNR Rapido (se presente) */}
          <div className="flex items-center gap-1.5">
            {transport.bookingCode ? (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800/90 border border-slate-700/80">
                <span className="text-[10px] text-slate-400 font-medium">PNR:</span>
                <span className="text-[11px] font-mono text-sky-300 font-bold tracking-wider">
                  {transport.bookingCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyBookingCode}
                  title="Copia PNR"
                  className="ml-0.5 p-1 text-[10px] text-sky-400 hover:text-sky-200 transition-colors cursor-pointer active:scale-95"
                >
                  {copied ? (
                    <span className="text-emerald-400 font-bold text-[10px]">✓</span>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <span className="text-[10px] font-mono text-slate-500">
                {formatDate(transport.date)}
              </span>
            )}
          </div>

          {/* Sezione Destra: Pulsanti Info "i", Biglietti / QR Code, Modifica ed Elimina */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* 1. Pulsante Info "i" */}
            <button
              type="button"
              onClick={() => setIsInfoOpen(true)}
              title="Dettagli e istruzioni operative"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition-all cursor-pointer active:scale-95 min-h-[30px]"
            >
              <span className="font-bold text-[13px] leading-none">ℹ</span>
              <span className="text-[11px]">Info</span>
            </button>

            {/* 2. Pulsante Biglietti & QR Code */}
            <button
              type="button"
              onClick={() => setIsTicketsOpen(true)}
              title="Biglietti, Pass e QR Code offline"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95 min-h-[30px] border ${
                attachmentsCount > 0
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <span className="text-xs">🎟️</span>
              <span className="text-[11px]">Pass</span>
              {attachmentsCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-400 text-slate-950">
                  {attachmentsCount}
                </span>
              )}
            </button>

            {/* 3. Pulsante Modifica */}
            <button
              type="button"
              onClick={onEdit}
              title="Modifica trasporto"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer active:scale-95 min-h-[30px] min-w-[30px] flex items-center justify-center border border-slate-700/60"
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

            {/* 4. Pulsante Elimina */}
            <button
              type="button"
              onClick={onDelete}
              title="Elimina trasporto"
              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 transition-colors cursor-pointer active:scale-95 min-h-[30px] min-w-[30px] flex items-center justify-center border border-rose-500/30"
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
