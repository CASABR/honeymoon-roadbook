
import type { Trasporto, TransportSegmentContext } from '../../types';
import { formatDateIT } from '../../utils/tripDates';

interface InTransitBannerProps {
  transport: Trasporto;
  dateStr: string;
  segmentContext?: TransportSegmentContext;
}

const ARRIVAL_ICONS: Record<string, string> = {
  volo: '🛬',
  treno: '🚆',
  traghetto: '⛴️',
  transfer: '🚐',
  taxi: '🚕',
};

export default function InTransitBanner({ transport, dateStr, segmentContext }: InTransitBannerProps) {
  const layover = transport.layover;
  const finalArrivalDate = layover?.arrivalDate || transport.arrivalDate;
  const isRental = transport.type === 'auto' || transport.type === 'camper';
  const isArrival = !isRental && (segmentContext === 'arrival' || (finalArrivalDate === dateStr && transport.date !== dateStr));

  let icon = ARRIVAL_ICONS[transport.type] || '📍';
  let title = `Arrivo a ${transport.arrivalLocation}`;
  let subtitle = '';

  if (isRental) {
    // Noleggio: mai "Arrivo". Giorno intermedio = veicolo attivo; la riconsegna e' una card dedicata nel giorno dropoffDate.
    const label = transport.type === 'camper' ? 'camper' : 'auto';
    icon = transport.type === 'camper' ? '🚐' : '🚗';
    const place = transport.dropoffLocation?.split('(')[0]?.trim() || transport.arrivalLocation?.split('(')[0]?.trim() || '';
    title = `Noleggio ${label} in corso${transport.carrier ? ` • ${transport.carrier.split('(')[0].trim()}` : ''}`;
    if (transport.dropoffDate) {
      subtitle = `Riconsegna ${label} il ${formatDateIT(transport.dropoffDate)}${transport.dropoffTime ? ` alle ${transport.dropoffTime}` : ''}${place ? ` • ${place}` : ''}`;
    }
  } else if (segmentContext === 'scalo' && layover) {
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
    title = `Arrivo a ${transport.arrivalLocation}`;
    const arrivalTime = layover?.arrivalTime || transport.arrivalTime;
    if (arrivalTime) {
      subtitle = `Arrivo previsto alle ${arrivalTime}`;
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
