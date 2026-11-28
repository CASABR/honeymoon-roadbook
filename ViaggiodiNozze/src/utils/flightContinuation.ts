import type { Trasporto } from '../types';

export type FlightContinuation = { airport: string; carrier?: string; destination: string; date: string; time: string; minutes: number };
function airportCode(iata?:string, location?:string):string {
  const code=(iata||'').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) return code;
  return (location||'').trim().match(/^([A-Z]{3})(?:\s|·|-|$)/)?.[1] || '';
}
function wallTime(date?:string,time?:string):number {
  if(!date||!time||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return NaN;
  return Date.parse(date+'T'+time+':00Z');
}
/** A same-airport onward flight is a planned connection, not proof of a single ticket.
 * Use local times only at the same airport and do not modify either booking. */
export function findFlightContinuation(flight:Trasporto, all:Trasporto[]):FlightContinuation|null {
  if(flight.type!=='volo'||flight.layover||flight.status==='annullato')return null;
  const airport=airportCode(flight.arrivalIata,flight.arrivalLocation);
  const arrival=wallTime(flight.arrivalDate||flight.date,flight.arrivalTime);
  if(!airport||!Number.isFinite(arrival))return null;
  const next=all.filter(t=>t.id!==flight.id&&t.type==='volo'&&t.status!=='annullato'&&Number.isFinite(wallTime(t.date,t.departureTime))&&wallTime(t.date,t.departureTime)>=arrival)
    .sort((a,b)=>wallTime(a.date,a.departureTime)-wallTime(b.date,b.departureTime))[0];
  if(!next||airportCode(next.departureIata,next.departureLocation)!==airport)return null;
  const minutes=(wallTime(next.date,next.departureTime)-arrival)/60000;
  if(minutes<=0||minutes>48*60)return null;
  return {airport,carrier:next.carrier,destination:next.arrivalIata||next.arrivalLocation,date:next.date,time:next.departureTime||'',minutes};
}
