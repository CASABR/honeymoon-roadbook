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
  createdAt: number;
  updatedAt: number;
}

export type TipoTrasporto = 'volo' | 'traghetto' | 'auto' | 'camper' | 'transfer' | 'treno' | 'bus' | 'altro';
export type StatoTrasporto = 'pianificato' | 'prenotato' | 'da_prenotare' | 'completato' | 'annullato';

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
  layover?: {
    airport: string;
    duration?: string;
    arrivalTime?: string;
    departureTime?: string;
    notes?: string;
  };
  notes?: string;
  status: StatoTrasporto;
  createdAt: number;
  updatedAt: number;
}

export type SectionTab = 'attivita' | 'alloggi' | 'trasporti';
