export interface MockItem {
  id: string;
  type: 'trasporto' | 'tappa' | 'attivita' | 'noleggio' | 'alloggio' | 'spot';
  time: string;
  endTime?: string;
  title: string;
  subtitle?: string;
  location: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  bookingCode?: string;
  ticketUrl?: string;
  hasQr?: boolean;
  notes?: string;
  accentColor: string;
  details: Record<string, string>;
  photoUrl?: string;
  goldenHour?: string;
}

export const MOCK_DAY_DATA = {
  tripTitle: 'Viaggio in Andalusia',
  currentDate: '2026-11-28',
  formattedDate: 'Sabato 28 Novembre 2026',
  dayNumber: 1,
  totalDays: 14,
  location: 'Madrid ➔ Córdoba',
  weather: '☀️ 19°C · Soleggiato',
  items: [
    {
      id: 'train_1',
      type: 'trasporto',
      time: '08:35',
      endTime: '10:15',
      title: 'Treno Alta Velocità AVE 02084',
      subtitle: 'Madrid Puerta de Atocha ➔ Córdoba Central',
      location: 'Madrid Puerta de Atocha Almudena Grandes',
      address: 'Glorieta del Emperador Carlos V, Madrid',
      bookingCode: 'AVE-8942K',
      hasQr: true,
      ticketUrl: '#',
      accentColor: '#3B82F6', // Blue
      details: {
        'Binario': '4',
        'Carrozza': '5',
        'Posti': '12A, 12B (Finestrino)',
        'Durata': '1h 40m',
        'Operatore': 'Renfe AVE'
      },
      notes: 'Controllo sicurezza bagagli ai varchi 15 minuti prima della partenza.'
    },
    {
      id: 'tappa_1',
      type: 'tappa',
      time: '11:00',
      endTime: '12:15',
      title: 'Puente Romano & Torre de la Calahorra',
      subtitle: 'Sosta panoramica e passeggiata storica',
      location: 'Ronda de Isasa, Córdoba',
      address: 'Ronda de Isasa, s/n, 14003 Córdoba',
      coordinates: { lat: 37.8775, lng: -4.7792 },
      accentColor: '#10B981', // Emerald
      details: {
        'Accesso': 'Pedonale dal lato sud',
        'Durata prevista': '1h 15m',
        'Visuale': 'Vista iconica sulla Mezquita e sul fiume Guadalquivir'
      },
      notes: 'Perfetto per i primi scatti del centro storico prima del tour guidato.'
    },
    {
      id: 'attivita_1',
      type: 'attivita',
      time: '12:30',
      endTime: '14:15',
      title: 'Mezquita-Catedral di Córdoba',
      subtitle: 'Visita guidata salta-fila con radioguida',
      location: 'Calle del Cardenal Herrero, 1, Córdoba',
      address: 'Calle del Cardenal Herrero, 1, 14003 Córdoba',
      bookingCode: 'MZQ-2026-X9',
      hasQr: true,
      ticketUrl: '#',
      accentColor: '#8B5CF6', // Purple
      details: {
        'Ingresso': 'Porta del Perdón (ritrovo guida)',
        'Lingua': 'Italiano',
        'Incluso': 'Biglietto con accesso prioritario + Radioguida',
        'Durata': '1h 45m'
      },
      notes: 'Punto d incontro 15 minuti prima davanti alla fontana del Patio de los Naranjos.'
    },
    {
      id: 'noleggio_1',
      type: 'noleggio',
      time: '15:00',
      title: 'Ritiro Auto a Noleggio — Hertz',
      subtitle: 'Hertz Córdoba Stazione Central',
      location: 'Stazione Córdoba Central - Atrio Arrivi',
      address: 'Plaza de las Tres Culturas, 14011 Córdoba',
      bookingCode: 'HZ-88921-ES',
      accentColor: '#F59E0B', // Amber
      details: {
        'Modello': 'Gruppo C (Peugeot 2008 o similare)',
        'Cauzione': '€300 su carta di credito',
        'Riconsegna': '02 Dicembre ore 10:00 (Siviglia)',
        'Franchigia': 'Zero pensieri inclusa'
      },
      notes: 'Patente fisica e carta di credito a nome dell autista principale necessarie.'
    },
    {
      id: 'alloggio_1',
      type: 'alloggio',
      time: '16:30',
      title: 'Hotel Hospes Palacio del Bailío 5★',
      subtitle: 'Check-in e sistemazione in camera',
      location: 'Centro Storico Córdoba',
      address: 'Calle Ramírez de las Casas Deza, 10, 14001 Córdoba',
      bookingCode: 'BK-7741-BAIL',
      accentColor: '#EC4899', // Pink / Rose
      details: {
        'Check-in': 'Dalle 15:00 alle 23:00',
        'Camera': 'Deluxe Patio Heritage',
        'Servizi': 'Parcheggio con valletto · Spa termale romana · Colazione inclusa',
        'Telefono': '+34 957 49 89 00'
      },
      notes: 'Comunicare l arrivo con l auto alla reception per l accesso alla ZTL del centro.'
    },
    {
      id: 'spot_1',
      type: 'spot',
      time: '18:45',
      endTime: '19:30',
      title: 'Mirador del Guadalquivir',
      subtitle: 'Spot Fotografico al Tramonto',
      location: 'Paseo de la Ribera, Córdoba',
      address: 'Paseo de la Ribera, 14003 Córdoba',
      coordinates: { lat: 37.8762, lng: -4.7768 },
      accentColor: '#F97316', // Orange
      goldenHour: 'Finestra ideale: 18:50 – 19:20',
      photoUrl: 'https://images.unsplash.com/photo-1543783207-ec64e4d95325?auto=format&fit=crop&w=600&q=80',
      details: {
        'Luce': 'Golden Hour & Blue Hour',
        'Consiglio ottica': 'Grandangolare 24mm per comprendere arco del ponte e riflesso sull acqua'
      },
      notes: 'Luce calda straordinaria sulla facciata in arenaria del Ponte e della Cattedrale.'
    }
  ] as MockItem[]
};

