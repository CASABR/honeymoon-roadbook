export type StatoAttivita = 'pianificata' | 'completata' | 'annullata';
export type CategoriaAttivita = 'visita' | 'cibo' | 'relax' | 'shopping' | 'natura' | 'cultura' | 'altro';

export interface Giorno {
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // es. "Giorno 1 - Arrivo"
  location: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Attivita {
  id: string;
  dayId: string;
  title: string;
  time?: string; // HH:mm
  location: string;
  category: CategoriaAttivita;
  duration?: string;
  notes?: string;
  link?: string;
  status: StatoAttivita;
  copilota?: boolean;
  coordinate?: Coordinate;
  qrCode?: string; // Codice testuale, numero biglietto o URL per QR code
  attachments?: TransportAttachment[]; // File, biglietti, immagini o QR code salvati offline
  createdAt: number;
  updatedAt: number;
}

export interface Tappa {
  id: string;
  titolo: string;
  data?: string; // YYYY-MM-DD
  coordinate?: Coordinate;
  nota?: string;
  copilota?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Ristorante {
  id: string;
  nome: string;
  data?: string; // YYYY-MM-DD
  coordinate?: Coordinate;
  indirizzo?: string;
  telefono?: string;
  linkPrenotazione?: string;
  nota?: string;
  copilota?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type StatoAlloggio = 'da_prenotare' | 'prenotato' | 'completato';

export interface Alloggio {
  id: string;
  name: string;
  location: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  address: string;
  bookingUrl?: string;
  bookingCode?: string;
  phone?: string;
  notes?: string;
  status: StatoAlloggio;
  copilota?: boolean;
  coordinate?: Coordinate;
  createdAt: number;
  updatedAt: number;
}

export type TipoTrasporto = 'volo' | 'traghetto' | 'auto' | 'camper' | 'transfer' | 'treno' | 'bus' | 'altro';
export type StatoTrasporto = 'pianificato' | 'prenotato' | 'da_prenotare' | 'completato' | 'annullato';

export interface TransportAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  dataUrl: string;
  size: number;
  createdAt: string;
}

export interface TravelDocument {
  id: string;
  category: 'passaporto' | 'visto' | 'assicurazione' | 'patente' | 'altro';
  title: string;
  description?: string;
  status?: string;
  validity?: string;
  expiresAt?: string;
  attachments: TransportAttachment[];
  updatedAt: string;
}

export interface Trasporto {
  id: string;
  type: TipoTrasporto;
  date: string; // YYYY-MM-DD
  departureTime?: string; // HH:mm
  arrivalTime?: string; // HH:mm
  departureLocation: string;
  arrivalLocation: string;
  dropoffDate?: string; // YYYY-MM-DD (per noleggi auto e camper)
  dropoffTime?: string; // HH:mm
  dropoffLocation?: string; // Luogo di riconsegna
  carrier?: string;
  bookingCode?: string;
  ticketUrl?: string;
  cost?: string;
  depositPaid?: string; // Quantitativo di acconto già dato
  acconto?: string; // Alias di depositPaid
  layover?: {
    airport: string;
    duration?: string;
    arrivalTime?: string;
    departureTime?: string;
    notes?: string;
  };
  notes?: string;
  attachments?: TransportAttachment[];
  copilota?: boolean;
  coordinate?: Coordinate;
  status: StatoTrasporto;
  createdAt: number;
  updatedAt: number;
}

export interface RouteInfo {
  distanceKm: number;
  formattedDistance: string; // es. "185.4 km"
  durationSeconds: number;
  formattedDuration: string; // es. "2h 35m"
  manualOverride?: boolean;
}

export interface RoutingCacheItem {
  id: string; // es. route_${from}_${to}
  from: string;
  to: string;
  route: RouteInfo;
  updatedAt: number;
}

export type SectionTab = 'oggi' | 'attivita' | 'tappe' | 'alloggi' | 'trasporti' | 'altro';

export interface TimelineItem {
  id: string;
  type: 'attivita' | 'trasporto';
  time: string; // HH:mm or '23:59' if undefined
  title: string;
  location: string;
  categoryOrType: string;
  copilota?: boolean;
  originalData: any;
}
