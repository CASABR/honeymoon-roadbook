import { useState } from 'react';
import type { PublicNextTransportInfo } from '../../utils/liveNextTransport';

interface LiveNextTransportCardProps {
  item?: PublicNextTransportInfo | null;
  items?: PublicNextTransportInfo[] | null;
}

/**
 * Mini-card pubblica e compatta (max 2 righe di contenuto) per i prossimi spostamenti importanti.
 * Espone esclusivamente dati pubblici non sensibili, frecce discrete se sono disponibili più tratte
 * e, per i soli voli con numero reale, il link Flightradar24 aggiornato alla tratta visualizzata.
 */
export default function LiveNextTransportCard({ item, items }: LiveNextTransportCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = items && items.length > 0 ? items : item ? [item] : [];
  if (list.length === 0) return null;

  const matchedIndex = selectedId ? list.findIndex((entry) => entry.id === selectedId) : -1;
  const activeIndex = matchedIndex >= 0 ? matchedIndex : 0;
  const current = list[activeIndex];
  const hasMultiple = list.length > 1;

  const detailLine = [
    current.typeLabel,
    current.dateLabel,
    `${current.departureTime} ora locale`,
    current.serviceNumber,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      data-testid="live-next-transport-card"
      aria-label="Prossimi spostamenti importanti"
      className="mt-2.5 rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-xs dark:border-slate-800 dark:bg-slate-900/70 sm:px-4"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-sm leading-none" aria-hidden="true">
            {current.icon}
          </span>
          <p
            data-testid="live-next-transport-route"
            className="flex min-w-0 flex-1 items-center gap-1 text-xs font-extrabold leading-tight text-[#172033] dark:text-white sm:text-sm"
            title={current.routeLabel}
          >
            <span className="min-w-0 truncate">{current.fromLabel}</span>
            <span className="shrink-0 text-slate-400" aria-hidden="true">→</span>
            <span className="min-w-0 truncate">{current.toLabel}</span>
          </p>
        </div>

        {current.type === 'volo' && current.flightradarUrl && (
          <a
            href={current.flightradarUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="live-next-transport-flight-link"
            aria-label={`Stato volo ${current.serviceNumber || ''} su Flightradar24`.trim()}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#FFF0ED] px-2.5 py-0.5 text-[11px] font-bold text-[#C83E31] transition hover:bg-[#FFE3DD] dark:bg-[#FF6B5F]/20 dark:text-[#FF8C82]"
          >
            Stato volo ↗
          </a>
        )}
      </div>

      <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
        <p
          data-testid="live-next-transport-meta"
          className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400"
        >
          {detailLine}
        </p>

        {hasMultiple && (
          <div
            data-testid="live-next-transport-pager"
            className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400"
          >
            <button
              type="button"
              data-testid="live-next-transport-prev"
              aria-label="Trasporto precedente"
              disabled={activeIndex <= 0}
              onClick={() => {
                const prev = list[activeIndex - 1];
                if (prev) setSelectedId(prev.id);
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-default"
            >
              ‹
            </button>
            <span
              data-testid="live-next-transport-counter"
              className="min-w-[2.4ch] text-center font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500"
            >
              {activeIndex + 1}/{list.length}
            </span>
            <button
              type="button"
              data-testid="live-next-transport-next"
              aria-label="Trasporto successivo"
              disabled={activeIndex >= list.length - 1}
              onClick={() => {
                const next = list[activeIndex + 1];
                if (next) setSelectedId(next.id);
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-default"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
