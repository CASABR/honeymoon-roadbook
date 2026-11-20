import type { PublicNextTransportInfo } from '../../utils/liveNextTransport';

interface LiveNextTransportCardProps {
  item?: PublicNextTransportInfo | null;
}

/**
 * Mini-card pubblica e compatta (max 2 righe di contenuto) per il prossimo spostamento importante.
 * Espone esclusivamente dati pubblici non sensibili e, per i soli voli con numero reale, il link Flightradar24.
 */
export default function LiveNextTransportCard({ item }: LiveNextTransportCardProps) {
  if (!item) return null;

  const detailLine = [
    item.typeLabel,
    item.dateLabel,
    `${item.departureTime} ora locale`,
    item.serviceNumber,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      data-testid="live-next-transport-card"
      aria-label="Prossimo spostamento importante"
      className="mt-3 rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-xs dark:border-slate-800 dark:bg-slate-900/70 sm:px-4 sm:py-2.5"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-sm leading-none" aria-hidden="true">
            {item.icon}
          </span>
          <p
            data-testid="live-next-transport-route"
            className="flex min-w-0 flex-1 items-center gap-1 text-xs font-extrabold text-[#172033] dark:text-white sm:text-sm"
            title={item.routeLabel}
          >
            <span className="min-w-0 truncate">{item.fromLabel}</span>
            <span className="shrink-0 text-slate-400" aria-hidden="true">→</span>
            <span className="min-w-0 truncate">{item.toLabel}</span>
          </p>
        </div>

        {item.type === 'volo' && item.flightradarUrl && (
          <a
            href={item.flightradarUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="live-next-transport-flight-link"
            aria-label={`Stato volo ${item.serviceNumber || ''} su Flightradar24`.trim()}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#FFF0ED] px-2.5 py-0.5 text-[11px] font-bold text-[#C83E31] transition hover:bg-[#FFE3DD] dark:bg-[#FF6B5F]/20 dark:text-[#FF8C82]"
          >
            Stato volo ↗
          </a>
        )}
      </div>

      <p
        data-testid="live-next-transport-meta"
        className="mt-1 min-w-0 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400"
      >
        {detailLine}
      </p>
    </section>
  );
}
