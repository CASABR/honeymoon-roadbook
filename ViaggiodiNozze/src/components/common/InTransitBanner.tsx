
import type { Trasporto } from '../../types';

interface InTransitBannerProps {
  transport: Trasporto;
  dateStr: string;
}

export default function InTransitBanner({ transport, dateStr }: InTransitBannerProps) {
  const layover = transport.layover;
  const isArrival = transport.arrivalDate === dateStr && transport.date !== dateStr;
  
  let icon = '🛬';
  let title = `Arrivo a ${transport.arrivalLocation}`;
  let subtitle = '';

  if (layover && (layover.departureDate === dateStr || transport.arrivalDate === dateStr)) {
    // We are in layover
    icon = '🛑';
    title = `Scalo a ${layover.airport.split(' ')[0]}`;
    if (layover.duration) {
       title += ` • ${layover.duration}`;
    }
    
    if (layover.departureTime) {
      subtitle = `Ripartenza alle ${layover.departureTime} • Volo ${layover.carrier || transport.carrier || ''}`;
    } else {
      subtitle = `In attesa del volo successivo`;
    }
  } else if (isArrival) {
    icon = '🛬';
    title = `Arrivo a ${transport.arrivalLocation}`;
    if (transport.arrivalTime) {
      subtitle = `Arrivo previsto alle ${transport.arrivalTime}`;
    }
  }

  return (
    <div className="bg-sky-50 rounded-2xl border border-sky-100/50 p-3 shadow-xs flex items-center gap-3 w-full">
      <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm shrink-0 border border-sky-100 shadow-2xs">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-bold text-sky-900 tracking-tight truncate">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[10px] text-sky-700 font-medium truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
