export type StatoAttivita = 'prenotato' | 'da_valutare' | 'non_bloccato' | 'libero';
export type CategoriaAttivita = 'visita' | 'cibo' | 'relax' | 'shopping' | 'natura' | 'cultura' | 'altro';
export type TipologiaPercorsoTrekking = 'anello' | 'andata_ritorno' | 'lineare';
export type FasciaLuceFotografica = 'alba' | 'golden_hour' | 'tramonto' | 'notte' | 'qualsiasi';

export interface Giorno {
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // es. "Giorno 1 - Arrivo"
  location: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type DayRouteTransportMode = 'driving' | 'walking';

export interface DayMapRouteEntry {
  url: string;
  mode: DayRouteTransportMode;
  isComplete?: boolean;
  stopsCount?: number;
  notes?: string;
  updatedAt?: number;
}

export interface DayMapsRoutes {
  driving?: DayMapRouteEntry | null;
  walking?: DayMapRouteEntry | null;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface TrekkingRoutePreview {
  coordinates: Coordinate[];
  verified: boolean;
  sourceLabel?: string;
}

export type TimeStatus = 'confermato' | 'indicativo' | 'non_specificato';

export interface Attivita {
  id: string;
  dayId: string;
  date?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (per attività multi-giorno o escursioni estese)
  title: string;
  time?: string; // HH:mm
  timeStatus?: TimeStatus; // 'confermato' (default su inserimento manuale) | 'indicativo'
  timeZone?: string; // IANA, es. Europe/Rome
  location: string;
  cost?: string; // Costo in €
  category: CategoriaAttivita;
  sottocategoria?: 'Passeggiata' | 'Trekking' | 'Spot fotografico' | 'Escursione' | 'Tour Guidato' | 'Museo' | 'Adrenalina' | 'Altro';
  duration?: string;
  distanceKm?: number;
  elevationGainM?: number;
  hikingDurationMinutes?: number;
  routeType?: TipologiaPercorsoTrekking;
  routePreview?: TrekkingRoutePreview;
  currency?: string;
  difficulty?: string;
  lightWindow?: FasciaLuceFotografica;
  photoSubject?: string;
  orarioRitrovo?: string; // HH:mm
  orarioInizio?: string; // HH:mm
  address?: string;
  googleMapsUrl?: string; // Link Google Maps separato
  originLocation?: string; // Eventuale percorso con origine
  destinationLocation?: string; // Eventuale percorso con destinazione
  isRoute?: boolean; // Flag se è un percorso (es. Google Maps Directions)
  childTappe?: Tappa[]; // Tappe subordinate collegate (opzionale a runtime/timeline)
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
  openingHours?: OpeningHoursInfo;
  createdAt: number;
  updatedAt: number;
}

export interface Tappa {
  id: string;
  titolo: string;
  sottocategoria?: string;
  passeggiataId?: string; // Collegamento facoltativo alla Passeggiata contenitore
  data?: string; // YYYY-MM-DD
  date?: string; // Alias di data YYYY-MM-DD
  dayId?: string;
  order?: number; // Ordine cronologico
  orario?: string; // HH:mm
  time?: string; // Alias di orario HH:mm
  timeStatus?: TimeStatus;
  coordinate?: Coordinate;
  indirizzo?: string;
  mapsUrl?: string; // Link o indirizzo Maps
  bookingCode?: string; // Riferimento di una prenotazione effettiva
  qrCode?: string; // Codice QR o biglietto associato
  ticketUrl?: string; // Biglietto o voucher collegato
  linkedBookingId?: string; // Prenotazione esplicitamente associata
  linkedDocumentId?: string; // Documento esplicitamente associato
  linkedDocumentIds?: string[];
  attachments?: TransportAttachment[];
  lightWindow?: FasciaLuceFotografica;
  photoSubject?: string;
  openingHours?: OpeningHoursInfo;
  nota?: string; // Note generali
  noteCopilota?: string; // Note specifiche per il copilota
  copilota?: boolean;
  completed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type OpeningHoursDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export type OpeningHoursStatus = 'unverified' | 'manual' | 'verified';
export type OpeningHoursAccessType = 'unknown' | 'attraction' | 'outdoor';

export interface OpeningHoursInfo {
  status: OpeningHoursStatus;
  accessType: OpeningHoursAccessType;
  weekly?: Partial<Record<OpeningHoursDay, string>>;
  exceptions?: Record<string, string>;
  source?: string;
  verifiedAt?: string;
  timeZone?: string;
  notes?: string;
}

export interface Ristorante {
  id: string;
  nome: string;
  sottocategoria?: 'Colazione' | 'Pranzo' | 'Cena' | 'Aperitivo' | 'Street Food' | 'Altro' | 'colazione' | 'pranzo' | 'cena' | 'snack';
  data?: string; // YYYY-MM-DD
  date?: string; // Alias di data YYYY-MM-DD
  dayId?: string;
  orario?: string; // HH:mm
  timeStatus?: TimeStatus;
  budget?: string; // es. 45 €
  coordinate?: Coordinate;
  indirizzo?: string;
  telefono?: string;
  linkPrenotazione?: string;
  _enriched?: boolean;
  nota?: string;
  noteCopilota?: string;
  status?: 'saldato' | 'da_saldare';
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
  checkInTime?: string; // HH:mm (orario check-in struttura)
  arrivalTime?: string; // HH:mm (mio orario di arrivo previsto)
  timeStatus?: TimeStatus;
  checkOut: string; // YYYY-MM-DD
  checkOutTime?: string; // HH:mm (orario check-out struttura)
  timeZone?: string; // IANA, usato esclusivamente per promemoria certi
  address: string;
  cost?: string; // Costo totale in €
  depositPaid?: string; // Somma versata / saldo pagato
  cancellazioneGratuitaEntro?: string; // es. '11 Dicembre 2026' o data ISO
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

export type TipoTrasporto = 'volo' | 'traghetto' | 'auto' | 'camper' | 'transfer' | 'taxi' | 'treno';
export type StatoTrasporto = 'pianificato' | 'prenotato' | 'da_prenotare' | 'completato' | 'annullato';

export interface TransportAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  purpose?: 'photo' | 'document';
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
  company?: string;
  policyNumber?: string;
  assistancePhones?: string;
  usefulContacts?: string;
  coverage?: string;
  notes?: string;
  linkedEntityType?: 'tappa' | 'attivita' | 'trasporto' | 'alloggio' | 'ristorante' | 'shopping';
  linkedEntityId?: string;
  attachments: TransportAttachment[];
  createdAt?: number | string;
  updatedAt: string | number;
}

export interface Trasporto {
  id: string;
  type: TipoTrasporto;
  date: string; // YYYY-MM-DD
  departureTime?: string; // HH:mm
  timeStatus?: TimeStatus;
  departureTimeZone?: string; // IANA, es. Pacific/Auckland
  arrivalDate?: string; // YYYY-MM-DD (per voli notturni / multi-giorno)
  arrivalTime?: string; // HH:mm
  departureLocation: string;
  departureIata?: string;
  arrivalLocation: string;
  arrivalIata?: string;
  dropoffDate?: string; // YYYY-MM-DD (per noleggi auto e camper)
  dropoffTime?: string; // HH:mm
  dropoffTimeZone?: string; // IANA, per riconsegna noleggio
  dropoffLocation?: string; // Luogo di riconsegna
  dropoffCoordinate?: Coordinate; // Coordinate geografiche punto riconsegna
  carrier?: string;
  bookingCode?: string;
  ticketUrl?: string;
  cost?: string;
  packageIncluded?: boolean; // Esplicitamente 'Incluso nel pacchetto'
  posti?: string;
  bagagli?: string;
  terminalGate?: string;
  checkinCutoff?: string;
  depositPaid?: string; // Quantitativo di acconto già dato
  acconto?: string; // Alias di depositPaid
  amountPaid?: string; // Alias di depositPaid
  paymentStatus?: 'saldato' | 'da_saldare'; // Stato pagamento
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
  timeStatus?: TimeStatus;
  budget?: string; // es. 50 €
  cost?: string; // Alias di budget
  acconto?: string; // Importo versato/acconto
  depositPaid?: string; // Alias di acconto
  amountPaid?: string; // Alias di acconto
  paymentStatus?: 'saldato' | 'da_saldare'; // Stato pagamento
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
  time: string; // HH:mm; stringa vuota se l'orario non e' disponibile
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
  /** true se `time` è un valore predefinito/indicativo (non inserito dall'utente né da una prenotazione) */
  timeIsDefault?: boolean;
  timeStatus?: TimeStatus;
  effectiveDate?: string;
  sortTime?: string;
  sortOrder?: number;
  physicalLocation?: boolean;
  informational?: boolean;
}

export type CategoriaSpesa = 'trasporti' | 'alloggi' | 'attivita' | 'ristoranti' | 'shopping' | 'altro';
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
  recordKind?: 'nota';
  order?: number;
  createdAt: number;
  updatedAt: number;
}

export type StatoScadenza = 'da_fare' | 'in_attesa' | 'completata' | 'scaduta';
export type TipoCollegamentoScadenza = 'attivita' | 'alloggio' | 'trasporto' | 'tappa';

export interface Scadenza {
  id: string;
  recordKind: 'scadenza';
  title: string;
  content: string;
  color: ColorNota;
  dueDate?: string;
  dueTime?: string;
  timeZone?: string;
  dateVerified: boolean;
  status: StatoScadenza;
  reminderMinutesBefore: number;
  linkedEntityType?: TipoCollegamentoScadenza;
  linkedEntityId?: string;
  linkedEntityLabel?: string;
  externalUrl?: string;
  copilotNotes?: string;
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

export interface TombstoneRecord {
  id: string;
  entityType: string;
  deletedId: string;
  deletedAt: number;
  timestamp?: number;
  pending?: boolean;
}

export interface SyncResultDetail {
  pushedCount: number;
  pulledCount: number;
  deletedCount: number;
  failedCount: number;
  timestamp: number;
}
