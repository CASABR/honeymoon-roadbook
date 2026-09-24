import { useState } from 'react';
import type { Trasporto, TipoTrasporto } from '../../types';
import Badge from '../common/Badge';

interface TrasportoCardProps {
  transport: Trasporto;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TrasportoCard({ transport, onEdit, onDelete }: TrasportoCardProps) {
  const [copied, setCopied] = useState(false);

  // Stili cromatici distintivi per categoria di trasporto
  const typeConfig: Record<
    TipoTrasporto,
    { label: string; icon: string; borderAccent: string; bgGradient: string; badgeStyle: string; dotColor: string }
  > = {
    volo: {
      label: 'Volo',
      icon: '✈️',
      borderAccent: 'border-l-4 border-l-[#2563eb]',
      bgGradient: 'bg-gradient-to-br from-blue-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#dbeafe] text-[#1e40af] border border-blue-200',
      dotColor: 'bg-blue-400 ring-blue-500/20'
    },
    traghetto: {
      label: 'Traghetto / Barca',
      icon: '⛴️',
      borderAccent: 'border-l-4 border-l-[#0891b2]',
      bgGradient: 'bg-gradient-to-br from-cyan-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#cffafe] text-[#155e75] border border-cyan-200',
      dotColor: 'bg-cyan-400 ring-cyan-500/20'
    },
    camper: {
      label: 'Noleggio Campervan',
      icon: '🚐',
      borderAccent: 'border-l-4 border-l-[#d97706]',
      bgGradient: 'bg-gradient-to-br from-amber-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#fef3c7] text-[#92400e] border border-amber-200',
      dotColor: 'bg-amber-400 ring-amber-500/20'
    },
    auto: {
      label: 'Noleggio Auto',
      icon: '🚗',
      borderAccent: 'border-l-4 border-l-[#d97706]',
      bgGradient: 'bg-gradient-to-br from-amber-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#fef3c7] text-[#92400e] border border-amber-200',
      dotColor: 'bg-amber-400 ring-amber-500/20'
    },
    transfer: {
      label: 'Transfer / Taxi',
      icon: '🚕',
      borderAccent: 'border-l-4 border-l-[#059669]',
      bgGradient: 'bg-gradient-to-br from-emerald-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-[#d1fae5] text-[#065f46] border border-emerald-200',
      dotColor: 'bg-emerald-400 ring-emerald-500/20'
    },
    treno: {
      label: 'Treno',
      icon: '🚄',
      borderAccent: 'border-l-4 border-l-indigo-600',
      bgGradient: 'bg-gradient-to-br from-indigo-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
      dotColor: 'bg-indigo-400 ring-indigo-500/20'
    },
    bus: {
      label: 'Bus',
      icon: '🚌',
      borderAccent: 'border-l-4 border-l-blue-600',
      bgGradient: 'bg-gradient-to-br from-blue-950/30 via-slate-900/95 to-slate-900',
      badgeStyle: 'bg-blue-100 text-blue-800 border border-blue-200',
      dotColor: 'bg-blue-400 ring-blue-500/20'
    },
    altro: {
      label: 'Spostamento',
      icon: '🧭',
      borderAccent: 'border-l-4 border-l-slate-600',
      bgGradient: 'bg-slate-900',
      badgeStyle: 'bg-slate-200 text-slate-800 border border-slate-300',
      dotColor: 'bg-slate-400 ring-slate-500/20'
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
        <span className="inline-flex items-center text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm">
          {label}
        </span>
      );
    }

    // 🔴 ROSSO (Rose/Rosso)
    const label = rawCost.startsWith('⏳') ? rawCost : `⏳ ${rawCost}`;
    return (
      <span className="inline-flex items-center text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-sm">
        {label}
      </span>
    );
  };

  return (
    <article
      className={`w-full rounded-2xl border border-slate-800 ${currentType.borderAccent} ${currentType.bgGradient} p-3.5 sm:p-4 shadow-lg transition-all duration-200 hover:border-slate-700/90`}
    >
      {/* 1. HEADER CARD: Categoria, Vettore e Prezzo in Euro Sempre in Primo Piano */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800/70">
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
            <span className="text-[11px] font-semibold text-slate-200 bg-slate-800/90 px-2 py-0.5 rounded-md border border-slate-700/60 truncate max-w-[170px] sm:max-w-none">
              {transport.carrier}
            </span>
          )}

          {/* Badge Stato compatto */}
          <Badge label={statusLabel} variant={statusVariant} />
        </div>

        {/* PREZZO IN EURO IN ALTO A DESTRA */}
        <div className="shrink-0">{renderCostBadge()}</div>
      </div>

      {/* 2. CORPO DELLA CARD: Differenziato per Categoria */}
      <div className="pt-3 pb-1">
        {isRental ? (
          /* ================= LAYOUT DEDICATO NOLEGGI (AUTO & CAMPER) ================= */
          <div className="space-y-2.5">
            {/* Nome Veicolo e Compagnia */}
            {transport.carrier && (
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <span className="text-amber-400 text-base">🔑</span>
                <span>{transport.carrier}</span>
              </div>
            )}

            {/* Box Ritiro & Riconsegna mobile-first */}
            <div className="space-y-2.5 bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
              {/* Ritiro */}
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 text-xs mt-0.5">
                  🔑
                </div>
                <div className="text-xs leading-relaxed min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span className="font-bold text-amber-400 uppercase tracking-wider text-[10px]">
                      Ritiro (Pick-up)
                    </span>
                    <span className="font-mono text-white font-semibold text-xs">
                      {formatDate(transport.date)}
                      {transport.departureTime ? ` • h ${transport.departureTime}` : ''}
                    </span>
                  </div>
                  <div className="text-slate-300 mt-0.5 font-medium break-words">
                    {transport.departureLocation}
                  </div>
                </div>
              </div>

              {/* Riconsegna */}
              <div className="flex items-start gap-2.5 pt-2 border-t border-slate-700/60">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 text-xs mt-0.5">
                  🏁
                </div>
                <div className="text-xs leading-relaxed min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span className="font-bold text-amber-400 uppercase tracking-wider text-[10px]">
                      Riconsegna (Drop-off)
                    </span>
                    <span className="font-mono text-white font-semibold text-xs">
                      {formatDate(transport.dropoffDate || transport.date)}
                      {transport.dropoffTime ? ` • h ${transport.dropoffTime}` : ''}
                    </span>
                  </div>
                  <div className="text-slate-300 mt-0.5 font-medium break-words">
                    {transport.dropoffLocation || transport.arrivalLocation}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ================= LAYOUT VOLI, TRAGHETTI E TRANSFER: LINEA TEMPORALE GRAFICA ================= */
          <div className="relative pl-6 py-1 space-y-4">
            {/* Linea verticale grafica continua/tratteggiata */}
            <div className="absolute left-[7px] top-3 bottom-3 w-0.5 border-l-2 border-dashed border-sky-500/35" />

            {/* 1. PUNTO PARTENZA */}
            <div className="relative flex items-start gap-2.5">
              {/* Dot Indicatore */}
              <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-sky-400 ring-4 ring-sky-500/20 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-mono font-bold text-white tracking-wide">
                    {transport.departureTime || 'Orario da definire'}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">
                    {transport.type === 'volo'
                      ? 'Partenza / Decollo'
                      : transport.type === 'traghetto'
                      ? 'Partenza / Imbarco'
                      : 'Partenza / Pick-up'}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5 leading-snug break-words">
                  {transport.departureLocation}
                </div>
              </div>
            </div>

            {/* 2. PUNTO SCALO (SE PRESENTE) — LINEA TEMPORALE CON BOX DEDICATO */}
            {transport.layover && (
              <div className="relative flex items-start gap-2.5 my-2">
                {/* Dot Scalo */}
                <div className="absolute -left-6 top-2.5 w-3.5 h-3.5 rounded-full bg-amber-400 ring-4 ring-amber-500/20 flex items-center justify-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                </div>

                <div className="min-w-0 flex-1 p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <span>🛑</span>
                      <span>SCALO: {transport.layover.airport}</span>
                    </span>
                    {transport.layover.duration && (
                      <span className="text-[10px] sm:text-[11px] font-bold font-mono text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-md">
                        ⏳ Attesa: {transport.layover.duration}
                      </span>
                    )}
                  </div>

                  {/* Orario Inizio e Fine Scalo */}
                  {(transport.layover.arrivalTime || transport.layover.departureTime) && (
                    <div className="text-[11px] text-slate-300 font-mono mt-1.5 flex items-center gap-1 flex-wrap">
                      <span className="text-slate-400">Intervallo:</span>
                      <span className="text-slate-200 font-semibold">
                        Dalle {transport.layover.arrivalTime || '—'} alle {transport.layover.departureTime || '—'}
                      </span>
                    </div>
                  )}

                  {transport.layover.notes && (
                    <div className="text-[11px] text-amber-200/90 mt-1 font-normal">
                      {transport.layover.notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. PUNTO ARRIVO FINALE */}
            <div className="relative flex items-start gap-2.5">
              {/* Dot Arrivo */}
              <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-mono font-bold text-white tracking-wide">
                    {transport.arrivalTime || 'Orario da definire'}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                    {transport.type === 'volo'
                      ? 'Arrivo / Atterraggio'
                      : transport.type === 'traghetto'
                      ? 'Arrivo / Sbarco'
                      : 'Arrivo / Destinazione'}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5 leading-snug break-words">
                  {transport.arrivalLocation}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Codice Prenotazione / PNR con Tasto Copia Rapido */}
        {transport.bookingCode && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700/70">
              <span className="text-[11px] text-slate-400 font-medium">PNR:</span>
              <span className="text-xs font-mono text-sky-300 font-bold tracking-wider">
                {transport.bookingCode}
              </span>
              <button
                type="button"
                onClick={handleCopyBookingCode}
                title="Copia codice prenotazione"
                className="ml-1 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 transition-colors cursor-pointer flex items-center gap-1 active:scale-95"
              >
                {copied ? (
                  <>
                    <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-emerald-400 font-bold">Copiato!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Copia</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Note operative ben visibili */}
        {transport.notes && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 leading-relaxed">
            <div className="flex items-start gap-1.5">
              <span className="text-amber-400 shrink-0 text-xs pt-0.5">📋</span>
              <span className="text-slate-300 font-normal break-words">{transport.notes}</span>
            </div>
          </div>
        )}

        {/* Link Biglietto / Voucher se presente */}
        {transport.ticketUrl && (
          <div className="mt-2">
            <a
              href={transport.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-medium transition-colors"
            >
              <span>Vedi voucher / biglietto</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        )}
      </div>

      {/* 3. FOOTER DELLA CARD: Pulsanti interni alla card (Modifica ed Elimina) */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="text-[10px] font-mono text-slate-500">
          <span>{formatDate(transport.date)}</span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onEdit}
            title="Modifica trasporto"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-slate-100 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 transition-all cursor-pointer active:scale-95 min-h-[32px]"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            <span>Modifica</span>
          </button>

          <button
            type="button"
            onClick={onDelete}
            title="Elimina trasporto"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all cursor-pointer active:scale-95 min-h-[32px]"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span>Elimina</span>
          </button>
        </div>
      </div>
    </article>
  );
}
