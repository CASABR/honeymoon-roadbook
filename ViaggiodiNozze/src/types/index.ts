export type StatoAttivita = 'prenotato' | 'da_valutare' | 'non_bloccato' | 'libero';
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
  date?: string; // YYYY-MM-DD
  title: string;
  time?: string; // HH:mm
  location: string;
  cost?: string; // Costo in €
  category: CategoriaAttivita;
  sottocategoria?: 'Escursione' | 'Tour Guidato' | 'Museo' | 'Adrenalina' | 'Altro';
  duration?: string;
  orarioRitrovo?: string; // HH:mm
  orarioInizio?: string; // HH:mm
  address?: string;
  acconto?: string;
  paymentStatus?: 'saldato' | 'da_saldare';
  notes?: string;
  link?: string;
  status: StatoAttivita;
  platform?: string; // Piattaforma prenotazione (GetYourGuide, Headout, ecc.)
  copilota?: boolean;
  completed?: boolean;
  noteCopilota?: string; // Note e promemoria riservati del co-pilota
  coordinate?: Coordinate;
  qrCode?: string; // Codice testuale, numero biglietto o URL per QR code
  attachments?: TransportAttachment[]; // File, biglietti, immagini o QR code salvati offline
  createdAt: number;
  updatedAt: number;
}

export interface Tappa {
  id: string;
  titolo: string;
  sottocategoria?: string;
  data?: string; // YYYY-MM-DD
  date?: string; // Alias di data YYYY-MM-DD
  dayId?: string;
  coordinate?: Coordinate;
  indirizzo?: string;
  mapsUrl?: string; // Link o indirizzo Maps
  nota?: string; // Note generali
  noteCopilota?: string; // Note specifiche per il copilota
  copilota?: boolean;
  completed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Ristorante {
  id: string;
  nome: string;
  sottocategoria?: 'Colazione' | 'Pranzo' | 'Cena' | 'Aperitivo' | 'Street Food' | 'Altro';
  data?: string; // YYYY-MM-DD
  date?: string; // Alias di data YYYY-MM-DD
  dayId?: string;
  orario?: string; // HH:mm
  budget?: string; // es. 45 €
  coordinate?: Coordinate;
  indirizzo?: string;
  telefono?: string;
  linkPrenotazione?: string;
  _enriched?: boolean;
  nota?: string;
  noteCopilota?: string;
  copilota?: boolean;
  completed?: boolean;
  attachments?: TransportAttachment[];
  createdAt: number;
  updatedAt: number;
}

export type StatoAlloggio = 'da_prenotare' | 'prenotato' | 'completato';

export interface Alloggio {
  id: string;
  name: string;
  sottocategoria?: 'Hotel' | 'B&B' | 'Appartamento' | 'Campeggio/Piazzola' | 'Altro';
  pinCode?: string;
  acconto?: string;
  location: string;
  checkIn: string; // YYYY-MM-DD
  checkInTime?: string; // HH:mm
  checkOut: string; // YYYY-MM-DD
  checkOutTime?: string; // HH:mm
  address: string;
  cost?: string; // Costo totale in €
  paymentStatus?: 'saldato' | 'da_saldare'; // Stato pagamento
  bookingUrl?: string;
  bookingCode?: string;
  phone?: string;
  notes?: string;
  status: StatoAlloggio;
  noteCopilota?: string;
  copilota?: boolean;
  completed?: boolean;
  coordinate?: Coordinate;
  attachments?: TransportAttachment[];
  createdAt: number;
  updatedAt: number;
}

export type TipoTrasporto = 'volo' | 'traghetto' | 'auto' | 'camper' | 'transfer' | 'treno';
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
  category: 'passaporto' | 'visto' | 'assicurazione' | 'patente' | 'alloggi' | 'attivita' | 'altro';
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
  arrivalDate?: string; // YYYY-MM-DD (per voli notturni / multi-giorno)
  arrivalTime?: string; // HH:mm
  departureLocation: string;
  departureIata?: string;
  arrivalLocation: string;
  arrivalIata?: string;
  dropoffDate?: string; // YYYY-MM-DD (per noleggi auto e camper)
  dropoffTime?: string; // HH:mm
  dropoffLocation?: string; // Luogo di riconsegna
  carrier?: string;
  bookingCode?: string;
  ticketUrl?: string;
  cost?: string;
  posti?: string;
  bagagli?: string;
  depositoCauzionale?: string;
  franchigia?: string;
  politicaCarburante?: string;
  sistemazioneTraghetto?: string;
  veicoloTraghetto?: string;
  depositPaid?: string; // Quantitativo di acconto già dato
  acconto?: string; // Alias di depositPaid
  layover?: {
    airport: string;
    duration?: string;
    arrivalTime?: string; // Arrivo allo scalo (Tratta 1)
    departureTime?: string; // Partenza dallo scalo (Tratta 2)
    departureDate?: string; // Data di ripartenza (se diversa dal giorno di arrivo)
    arrivalDate?: string; // Data di arrivo a destinazione finale (Tratta 2)
    carrier?: string; // Compagnia/Numero volo Tratta 2
    notes?: string;
  };
  notes?: string;
  attachments?: TransportAttachment[];
  noteCopilota?: string;
  copilota?: boolean;
  completed?: boolean;
  coordinate?: Coordinate;
  status: StatoTrasporto;
  createdAt: number;
  updatedAt: number;
}

export type RouteProfile = 'driving-car' | 'foot-walking';

export interface RouteInfo {
  distanceKm: number;
  formattedDistance: string; // es. "185.4 km"
  durationSeconds: number;
  formattedDuration: string; // es. "2h 35m"
  profile?: RouteProfile;
  manualOverride?: boolean;
}

export interface RoutingCacheItem {
  id: string; // es. route_${profile}_${from}_${to}
  from: string;
  to: string;
  profile?: RouteProfile;
  route: RouteInfo;
  updatedAt: number;
}

export interface Shopping {
  id: string;
  nome: string;
  sottocategoria?: string;
  scopo?: string;
  data?: string; // YYYY-MM-DD
  date?: string; // Alias di data YYYY-MM-DD
  dayId?: string;
  orario?: string; // HH:mm
  budget?: string; // es. 50 €
  coordinate?: Coordinate;
  indirizzo?: string;
  link?: string;
  nota?: string;
  noteCopilota?: string;
  copilota?: boolean;
  completed?: boolean;
  attachments?: TransportAttachment[];
  createdAt: number;
  updatedAt: number;
}

export type SectionTab = 'oggi' | 'categorie' | 'mappa' | 'altro';
export type CategoriaTab = 'tappe' | 'attivita' | 'ristoranti' | 'alloggi' | 'trasporti' | 'shopping' | 'spese';

export type TransportDisplayMode = 'full' | 'compact' | 'state';
export type TransportSegmentContext = 'leg1' | 'leg2' | 'scalo' | 'arrival' | 'dropoff';

export interface TimelineItem {
  id: string;
  type: 'attivita' | 'trasporto' | 'tappa' | 'ristorante' | 'alloggio' | 'shopping';
  time: string; // HH:mm or '23:59' if undefined
  title: string;
  location: string;
  categoryOrType: string;
  copilota?: boolean;
  completed?: boolean;
  noteCopilota?: string;
  coordinate?: Coordinate;
  originalData: any;
  displayMode?: TransportDisplayMode;
  stateLabel?: string;
  segmentContext?: TransportSegmentContext;
}

export type CategoriaSpesa = 'trasporti' | 'alloggi' | 'attivita' | 'ristoranti' | 'altro';
export type StatoSpesa = 'saldato' | 'da_saldare';

export interface Spesa {
  id: string;
  title: string;
  amount: number;       // importo in Euro (€)
  category: CategoriaSpesa;
  status: StatoSpesa;
  date: string;         // YYYY-MM-DD
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type DeviceRole = 'guida' | 'copilota' | 'viewer';

export type ColorNota = 'amber' | 'sky' | 'emerald' | 'rose';

export interface NotaViaggio {
  id: string;
  title?: string;
  content: string;
  color: ColorNota;
  createdAt: number;
  updatedAt: number;
}

export type TipoBagaglio = 'stiva' | 'mano' | 'borsa';
export type PasseggeroBagaglio = 'sposo' | 'sposa' | 'entrambi';

export interface Bagaglio {
  id: string;
  voloId?: string;
  voloTitle?: string;
  tipo: TipoBagaglio;
  pesoKg: number;
  descrizione: string;
  note?: string;
  passeggero: PasseggeroBagaglio;
  verificato: boolean;
  createdAt: number;
  updatedAt: number;
}
