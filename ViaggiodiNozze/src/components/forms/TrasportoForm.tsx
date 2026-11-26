import { formatDraftBalance } from '../../utils/budgetDisplay';
import CurrencyAmountInput from '../common/CurrencyAmountInput';
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Check, Copy, Route, Wallet, List, Settings, MessageSquare, PlaneTakeoff, PlaneLanding } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';
import type { Trasporto, TipoTrasporto, StatoTrasporto, TransportAttachment } from '../../types';
import TimeZoneInput from '../common/TimeZoneInput';
import { DateTimePickerInput } from '../common/TimePickerInput';
import FormActionButtons from './FormActionButtons';
import Modal from '../common/Modal';
import TrasportoBagagliModal from '../modals/TrasportoBagagliModal';
import TrasportoTicketsModal from '../modals/TrasportoTicketsModal';
import { buildEurSavePatch } from '../../services/currencyService';
import { parseCostToNumber } from '../../utils/priceHelper';
import { resolveReliableIataTimeZone, isValidIanaTimeZone, resolveUnambiguousPlaceTimeZone } from '../../utils/reliableTimeZone';
import {
  resolveAirportIataAndTimeZone,
  resolveTimeZoneFromIata,
  computeLayoverDuration,
} from '../../utils/transportIataTzHelper';

interface TrasportoFormProps {
  initialData?: Trasporto | null;
  defaultDate?: string;
  defaultTime?: string;
  onSave: (data: Omit<Trasporto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

type OperationalFieldKey =
  | 'bookingCode'
  | 'iata'
  | 'terminalGate'
  | 'checkinCutoff'
  | 'posti'
  | 'bagagli'
  | 'veicolo'
  | 'assicurazione'
  | 'cauzione'
  | 'layover';

interface SubcategoryUiConfig {
  id: TipoTrasporto;
  pillLabel: string;
  carrierLabel: string;
  carrierPlaceholder: string;
  bookingCodeLabel: string;
  bookingCodePlaceholder: string;
  departureLabel: string;
  departurePlaceholder: string;
  arrivalLabel: string;
  arrivalPlaceholder: string;
  terminalLabel: string;
  terminalPlaceholder: string;
  checkinLabel: string;
  checkinPlaceholder: string;
  postiLabel: string;
  postiPlaceholder: string;
  primaryFields: OperationalFieldKey[];
}

const SUBCATEGORY_OPTIONS: SubcategoryUiConfig[] = [
  {
    id: 'volo',
    pillLabel: '✈️ Aereo',
    carrierLabel: 'Compagnia / Volo',
    carrierPlaceholder: 'es. Air China CA950',
    bookingCodeLabel: 'PNR / Codice volo',
    bookingCodePlaceholder: 'es. ABC123 / CA950',
    departureLabel: 'Partenza',
    departurePlaceholder: 'Aeroporto partenza',
    arrivalLabel: 'Arrivo',
    arrivalPlaceholder: 'Aeroporto arrivo',
    terminalLabel: 'Terminal / Gate',
    terminalPlaceholder: 'es. T3, Gate E12',
    checkinLabel: 'Chiusura check-in',
    checkinPlaceholder: 'es. 18:00 o 2h prima',
    postiLabel: 'Posto',
    postiPlaceholder: 'es. 14A, 14B',
    primaryFields: ['bookingCode', 'iata', 'terminalGate', 'checkinCutoff', 'bagagli', 'posti', 'layover'],
  },
  {
    id: 'treno',
    pillLabel: '🚆 Treno',
    carrierLabel: 'Operatore / N. Treno',
    carrierPlaceholder: 'es. Frecciarossa 9612',
    bookingCodeLabel: 'PNR / Codice biglietto',
    bookingCodePlaceholder: 'es. XY789Z',
    departureLabel: 'Stazione partenza',
    departurePlaceholder: 'Stazione di partenza',
    arrivalLabel: 'Stazione arrivo',
    arrivalPlaceholder: 'Stazione di arrivo',
    terminalLabel: 'Binario',
    terminalPlaceholder: 'es. Binario 4',
    checkinLabel: 'Presentarsi entro',
    checkinPlaceholder: 'es. 15 min prima',
    postiLabel: 'Carrozza / Posto',
    postiPlaceholder: 'es. Car. 5 · 12A, 12B',
    primaryFields: ['bookingCode', 'terminalGate', 'posti'],
  },
  {
    id: 'traghetto',
    pillLabel: '⛴️ Traghetto',
    carrierLabel: 'Compagnia navale',
    carrierPlaceholder: 'es. Interislander',
    bookingCodeLabel: 'Codice prenotazione',
    bookingCodePlaceholder: 'es. FERRY-442',
    departureLabel: 'Porto imbarco',
    departurePlaceholder: 'Porto di partenza',
    arrivalLabel: 'Porto arrivo',
    arrivalPlaceholder: 'Porto di arrivo',
    terminalLabel: 'Molo / Imbarco',
    terminalPlaceholder: 'es. Molo 2 / Gate B',
    checkinLabel: 'Imbarco entro',
    checkinPlaceholder: 'es. 07:30',
    postiLabel: 'Cabina / Posto',
    postiPlaceholder: 'es. Cabina 412 / Ponte',
    primaryFields: ['bookingCode', 'terminalGate', 'checkinCutoff', 'posti', 'veicolo'],
  },
  {
    id: 'auto',
    pillLabel: '🚗 Auto',
    carrierLabel: 'Agenzia noleggio',
    carrierPlaceholder: 'es. Hertz, Avis, Sixt',
    bookingCodeLabel: 'Codice prenotazione',
    bookingCodePlaceholder: 'es. HERTZ-9981',
    departureLabel: 'Ritiro',
    departurePlaceholder: 'Sede / Aeroporto ritiro',
    arrivalLabel: 'Riconsegna',
    arrivalPlaceholder: 'Sede / Aeroporto riconsegna',
    terminalLabel: 'Desk / Ufficio',
    terminalPlaceholder: 'es. Terminal arrivi, Box 3',
    checkinLabel: 'Orario limite ritiro',
    checkinPlaceholder: 'es. Entro le 20:00',
    postiLabel: 'Modello / Categoria',
    postiPlaceholder: 'es. Toyota RAV4 o SUV',
    primaryFields: ['bookingCode', 'posti', 'terminalGate', 'assicurazione', 'cauzione'],
  },
  {
    id: 'camper',
    pillLabel: '🚐 Camper',
    carrierLabel: 'Operatore camper',
    carrierPlaceholder: 'es. Jucy, Maui, Britz',
    bookingCodeLabel: 'Codice prenotazione',
    bookingCodePlaceholder: 'es. MAUI-5102',
    departureLabel: 'Ritiro camper',
    departurePlaceholder: 'Deposito ritiro',
    arrivalLabel: 'Riconsegna camper',
    arrivalPlaceholder: 'Deposito riconsegna',
    terminalLabel: 'Desk / Deposito',
    terminalPlaceholder: 'es. Depot Airport Rd',
    checkinLabel: 'Briefing / Ritiro entro',
    checkinPlaceholder: 'es. 15:30',
    postiLabel: 'Veicolo / Posti letto',
    postiPlaceholder: 'es. 2 Berth HiTop',
    primaryFields: ['bookingCode', 'posti', 'terminalGate', 'assicurazione', 'cauzione'],
  },
  {
    id: 'transfer',
    pillLabel: '🚌 Bus / Transfer',
    carrierLabel: 'Operatore / Linea',
    carrierPlaceholder: 'es. Terravision, Shuttle',
    bookingCodeLabel: 'Codice biglietto',
    bookingCodePlaceholder: 'es. BUS-304',
    departureLabel: 'Fermata partenza',
    departurePlaceholder: 'Fermata / Punto di prelievo',
    arrivalLabel: 'Fermata arrivo',
    arrivalPlaceholder: 'Fermata / Destinazione',
    terminalLabel: 'Fermata / Banchina',
    terminalPlaceholder: 'es. Stallo 7',
    checkinLabel: 'Presentarsi entro',
    checkinPlaceholder: 'es. 10 min prima',
    postiLabel: 'Posto',
    postiPlaceholder: 'es. Posto libero / 8A',
    primaryFields: ['bookingCode', 'terminalGate', 'posti', 'bagagli'],
  },
  {
    id: 'taxi',
    pillLabel: '🚕 Taxi',
    carrierLabel: 'Servizio / Autista',
    carrierPlaceholder: 'es. Uber, Taxi locale',
    bookingCodeLabel: 'Codice corsa / Targa',
    bookingCodePlaceholder: 'es. Corsa #12 / Targa',
    departureLabel: 'Prelievo',
    departurePlaceholder: 'Indirizzo di prelievo',
    arrivalLabel: 'Destinazione',
    arrivalPlaceholder: 'Indirizzo di destinazione',
    terminalLabel: 'Punto incontro',
    terminalPlaceholder: 'es. Uscita B',
    checkinLabel: 'Attesa massima',
    checkinPlaceholder: 'es. 15 min',
    postiLabel: 'Veicolo / Passeggeri',
    postiPlaceholder: 'es. Berlina 2 pax',
    primaryFields: [],
  },
  {
    id: 'metro',
    pillLabel: '🚇 Metro',
    carrierLabel: 'Linea / Rete',
    carrierPlaceholder: 'es. Metro Linea A',
    bookingCodeLabel: 'Titolo / Riferimento',
    bookingCodePlaceholder: 'es. Abbonamento / Biglietto',
    departureLabel: 'Stazione partenza',
    departurePlaceholder: 'Stazione metro partenza',
    arrivalLabel: 'Stazione arrivo',
    arrivalPlaceholder: 'Stazione metro arrivo',
    terminalLabel: 'Direzione / Banchina',
    terminalPlaceholder: 'es. Dir. Centro, Binario 2',
    checkinLabel: 'Frequenza / Limite',
    checkinPlaceholder: 'es. Ogni 5 min',
    postiLabel: 'Carrozza',
    postiPlaceholder: 'es. Testa treno',
    primaryFields: ['terminalGate'],
  },
];

const SUBCATEGORY_MAP: Record<TipoTrasporto, SubcategoryUiConfig> = SUBCATEGORY_OPTIONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<TipoTrasporto, SubcategoryUiConfig>
);

const inputClass =
  'w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-[#FF6B5F] transition-colors placeholder:text-slate-400';
const whiteInputClass =
  'w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F] transition-colors placeholder:text-slate-400';
const labelClass = 'block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1';

// Resolve departure and arrival independently; do not guess on conflicting evidence.
function resolveFlightZone(iata: string | undefined, location: string | undefined): string | undefined {
  const byCode = resolveTimeZoneFromIata(iata) || resolveReliableIataTimeZone(iata) || undefined;
  const byPlace = resolveAirportIataAndTimeZone(location).timeZone;
  return byCode && byPlace && byCode !== byPlace ? undefined : byCode || byPlace;
}

// Keep the existing persisted posti field compatible with older devices and imports.
function splitTrainSeats(value: string): { coach: string; seats: string } {
  const canonical = value.match(/^Carrozza: ([\s\S]*?) · Posti: ?([\s\S]*)$/);
  if (canonical) return { coach: canonical[1], seats: canonical[2] };
  const legacy = value.match(/^\s*(?:Carrozza|Car\.?|Coach)\s*:?\s*([A-Z]?\d+[A-Z]?)\s*(?:[·;]\s*(?:Posti?\s*:?\s*)?([\s\S]*))?$/i);
  return legacy ? { coach: legacy[1], seats: legacy[2] || '' } : { coach: '', seats: value };
}
function joinTrainSeats(coach: string, seats: string): string {
  return coach ? `Carrozza: ${coach} · Posti: ${seats}` : seats;
}

// Used by compact Aereo and Treno layouts. Keep long values readable on Safari as well as Chromium.
function FlightAdaptiveText({ value, className = '', ...props }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = '0px';
      const border = el.offsetHeight - el.clientHeight;
      el.style.height = `${el.scrollHeight + border + 1}px`;
    };
    fit();
    let width = el.clientWidth;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (width !== el.clientWidth) {
        width = el.clientWidth;
        fit();
      }
    }) : undefined;
    observer?.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [value]);
  return <textarea {...props} ref={ref} value={value} rows={1} className={`${className} flight-adaptive-text`} />;
}

export default function TrasportoForm({ initialData, defaultDate, defaultTime, onSave, onCancel, onDelete }: TrasportoFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const [type, setType] = useState<TipoTrasporto>('volo');

  // Identità
  const [carrier, setCarrier] = useState('');
  const [bookingCode, setBookingCode] = useState('');

  // Partenza / Ritiro
  const [departureLocation, setDepartureLocation] = useState('');
  const [departureIata, setDepartureIata] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [departureTimeZone, setDepartureTimeZone] = useState('');

  // Arrivo / Riconsegna
  const [arrivalLocation, setArrivalLocation] = useState('');
  const [arrivalIata, setArrivalIata] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [dropoffTimeZone, setDropoffTimeZone] = useState('');

  // Dettagli operativi specifici & compatibilità
  const [posti, setPosti] = useState('');
  const [bagagli, setBagagli] = useState('');
  const [terminalGate, setTerminalGate] = useState('');
  const [checkinOpen, setCheckinOpen] = useState('');
  const [checkinCutoff, setCheckinCutoff] = useState('');
  const [veicolo, setVeicolo] = useState('');
  const [assicurazione, setAssicurazione] = useState('');
  const [cauzione, setCauzione] = useState('');
  const [hasLayover, setHasLayover] = useState(false);
  const [layoverAirport, setLayoverAirport] = useState('');
  const [layoverIata, setLayoverIata] = useState('');
  const [layoverArrivalDate, setLayoverArrivalDate] = useState('');
  const [layoverArrivalTime, setLayoverArrivalTime] = useState('');
  const [layoverDepartureDate, setLayoverDepartureDate] = useState('');
  const [layoverDepartureTime, setLayoverDepartureTime] = useState('');
  const [layoverCarrier, setLayoverCarrier] = useState('');
  const [layoverTerminalGate, setLayoverTerminalGate] = useState('');
  const [layoverDuration, setLayoverDuration] = useState('');
  const [layoverNotes, setLayoverNotes] = useState('');

  // Economico
  const [cost, setCost] = useState('');
  const [depositPaid, setDepositPaid] = useState('');
  const [isSaldato, setIsSaldato] = useState(false);
  const [packageIncluded, setPackageIncluded] = useState(false);

  // Documenti & Note
  const [ticketUrl, setTicketUrl] = useState('');
  const [attachments, setAttachments] = useState<TransportAttachment[]>([]);
  const [noteCopilota, setNoteCopilota] = useState('');
  const [copilota, setCopilota] = useState(false);

  // Sezioni espandibili (altre sottocategorie)
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);

  // Sezioni & modali dedicati Aereo
  const [isFlightDetailsOpen, setIsFlightDetailsOpen] = useState(false);
  const [isFlightAdvancedOpen, setIsFlightAdvancedOpen] = useState(false);
  const [isFlightNotesOpen, setIsFlightNotesOpen] = useState(false);
  const [isLayoverExpanded, setIsLayoverExpanded] = useState(false);
  const [isPnrModalOpen, setIsPnrModalOpen] = useState(false);
  const [isBagagliModalOpen, setIsBagagliModalOpen] = useState(false);
  const [isTicketsModalOpen, setIsTicketsModalOpen] = useState(false);
  const [pnrCopied, setPnrCopied] = useState(false);

  const [error, setError] = useState('');

  const cfg = SUBCATEGORY_MAP[type] || SUBCATEGORY_MAP.volo;
  const isRental = type === 'auto' || type === 'camper';
  const isFlight = type === 'volo';
  const isTrain = type === 'treno';
  const trainSeats = splitTrainSeats(posti);

  const formatForInput = (d?: string, t?: string) => {
    if (!d) return '';
    return t ? `${d}T${t}` : `${d}T00:00`;
  };

  const initializedIdRef = useRef<string | null | undefined>(undefined);
  const departureAirportBeforeEdit = useRef('');
  const arrivalAirportBeforeEdit = useRef('');

  useEffect(() => {
    const currentId = initialData?.id || '__new__';
    if (initializedIdRef.current === currentId) {
      return;
    }
    initializedIdRef.current = currentId;

    if (initialData) {
      setType(initialData.type);
      setCarrier(initialData.carrier || '');
      setBookingCode(initialData.bookingCode || '');

      setDepartureLocation(initialData.departureLocation || '');
      setDepartureIata(initialData.departureIata || '');
      setDepartureDate(formatForInput(initialData.date, initialData.departureTime));
      setDepartureTimeZone(initialData.departureTimeZone || '');

      const isRentalType = initialData.type === 'auto' || initialData.type === 'camper';
      if (isRentalType) {
        setArrivalLocation(initialData.dropoffLocation || initialData.arrivalLocation || '');
        setArrivalIata(initialData.arrivalIata || '');
        setArrivalDate(formatForInput(initialData.dropoffDate, initialData.dropoffTime));
        setDropoffTimeZone(initialData.dropoffTimeZone || '');
      } else {
        setArrivalLocation(initialData.arrivalLocation || '');
        setArrivalIata(initialData.arrivalIata || '');
        setArrivalDate(formatForInput(initialData.arrivalDate || initialData.date, initialData.arrivalTime));
        setDropoffTimeZone(initialData.dropoffTimeZone || '');
      }

      setPosti(initialData.posti || '');
      setBagagli(initialData.bagagli || '');
      setTerminalGate(initialData.terminalGate || '');
      setCheckinOpen(initialData.checkinOpen || '');
      setCheckinCutoff(initialData.checkinCutoff || '');
      setVeicolo(initialData.veicolo || '');
      setAssicurazione(initialData.assicurazione || '');
      setCauzione(initialData.cauzione || '');

      const hasExistingLayover = Boolean(initialData.layover && (initialData.type === 'volo' || initialData.type === 'treno' ? initialData.layover.airport : Object.values(initialData.layover).some(Boolean)));
      setHasLayover(hasExistingLayover);
      setLayoverAirport(initialData.layover?.airport || '');
      const existingLayoverIata = initialData.layover?.iata || (initialData.type === 'volo' ? resolveAirportIataAndTimeZone(initialData.layover?.airport).iata : '') || '';
      setLayoverIata(existingLayoverIata);
      setLayoverArrivalDate(initialData.layover?.arrivalDate || initialData.date || '');
      setLayoverArrivalTime(initialData.layover?.arrivalTime || '');
      setLayoverDepartureDate(initialData.layover?.departureDate || '');
      setLayoverDepartureTime(initialData.layover?.departureTime || '');
      setLayoverCarrier(initialData.layover?.carrier || '');
      setLayoverTerminalGate(initialData.layover?.terminalGate || '');
      setLayoverDuration(initialData.layover?.duration || '');
      setLayoverNotes(initialData.layover?.notes || '');
      setIsLayoverExpanded(false);

      // Auto-risoluzione IATA/Fuso orario per voli esistenti solo se mancanti e univoci
      if (initialData.type === 'volo') {
        const depRes = resolveAirportIataAndTimeZone(initialData.departureLocation);
        if (!initialData.departureIata && depRes.iata) setDepartureIata(depRes.iata);
        const depZone = resolveFlightZone(initialData.departureIata || depRes.iata, initialData.departureLocation);
        if (!initialData.departureTimeZone && depZone) setDepartureTimeZone(depZone);
        const arrRes = resolveAirportIataAndTimeZone(initialData.arrivalLocation);
        if (!initialData.arrivalIata && arrRes.iata) setArrivalIata(arrRes.iata);
        const arrZone = resolveFlightZone(initialData.arrivalIata || arrRes.iata, initialData.arrivalLocation);
        if (!initialData.dropoffTimeZone && arrZone) setDropoffTimeZone(arrZone);
      }

      setCost(initialData.cost || '');
      const isPkg = initialData.packageIncluded === true || initialData.cost === 'Incluso' || initialData.cost === 'Incluso nel pacchetto';
      setPackageIncluded(isPkg);
      const acconto = initialData.depositPaid || initialData.acconto || '';
      setDepositPaid(acconto);

      const c = parseFloat((initialData.cost || '0').replace(',', '.'));
      const a = parseFloat((acconto || '0').replace(',', '.'));
      setIsSaldato(c > 0 && a >= c);

      const tUrl = initialData.ticketUrl || '';
      setTicketUrl(tUrl);
      setAttachments(initialData.attachments || []);
      const existingNotes = [initialData.noteCopilota, (initialData as any).notes, (initialData as any).nota]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join('\n\n');
      setNoteCopilota(existingNotes);
      setCopilota(Boolean(existingNotes.trim()) || initialData.copilota || false);
      setIsSecondaryOpen(false);
      setIsFlightDetailsOpen(false);
      setIsFlightAdvancedOpen(false);
      setIsFlightNotesOpen(false);
    } else {
      setType('volo');
      setCarrier('');
      setBookingCode('');
      setDepartureLocation('');
      setDepartureIata('');
      setDepartureDate(defaultDate && defaultTime ? `${defaultDate}T${defaultTime}` : '');
      setDepartureTimeZone('');
      setArrivalLocation('');
      setArrivalIata('');
      setArrivalDate('');
      setDropoffTimeZone('');
      setPosti('');
      setBagagli('');
      setTerminalGate('');
      setCheckinOpen('');
      setCheckinCutoff('');
      setVeicolo('');
      setAssicurazione('');
      setCauzione('');
      setHasLayover(false);
      setLayoverAirport('');
      setLayoverIata('');
      setLayoverArrivalDate('');
      setLayoverArrivalTime('');
      setLayoverDepartureDate('');
      setLayoverDepartureTime('');
      setLayoverCarrier('');
      setLayoverTerminalGate('');
      setLayoverDuration('');
      setLayoverNotes('');
      setIsLayoverExpanded(false);
      setCost('');
      setPackageIncluded(false);
      setDepositPaid('');
      setIsSaldato(false);
      setTicketUrl('');
      setAttachments([]);
      setNoteCopilota('');
      setCopilota(false);
      setIsSecondaryOpen(false);
      setIsFlightDetailsOpen(false);
      setIsFlightAdvancedOpen(false);
      setIsFlightNotesOpen(false);
    }
  }, [defaultDate, defaultTime, initialData]);

  useEffect(() => {
    if (isSaldato && cost && !initialData?.depositPaid && !initialData?.acconto) {
      setDepositPaid(cost);
    }
  }, [isSaldato, cost, initialData?.depositPaid, initialData?.acconto]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departureLocation.trim() || !departureDate) {
      setError('Partenza (Luogo e Data) sono obbligatori.');
      return;
    }

    let parsedDepDate = '';
    let parsedDepTime = '';
    if (departureDate) {
      const parts = departureDate.split('T');
      parsedDepDate = parts[0];
      parsedDepTime = parts[1] || '';
    }

    let parsedArrDate = '';
    let parsedArrTime = '';
    if (arrivalDate) {
      const parts = arrivalDate.split('T');
      parsedArrDate = parts[0];
      parsedArrTime = parts[1] || '';
    }

    setError('');

    const normalizedMoney = !packageIncluded
      ? await buildEurSavePatch({
          costRaw: cost.trim() || undefined,
          depositRaw: depositPaid.trim() || undefined,
          existingItem: initialData
        })
      : {};

    const { cost: normCost, depositPaid: normDep, acconto: normAcc, ...normMeta } = normalizedMoney;

    const preservedLayover =
      hasLayover && (layoverAirport.trim() || (!isFlight && !isTrain && Boolean(initialData?.layover)))
        ? {
            ...(initialData?.layover || {}),
            airport: layoverAirport.trim(),
            iata: layoverIata.trim().toUpperCase() || undefined,
            arrivalDate: layoverArrivalDate.trim() || undefined,
            arrivalTime: layoverArrivalTime.trim() || undefined,
            departureDate: layoverDepartureDate.trim() || undefined,
            departureTime: layoverDepartureTime.trim() || undefined,
            carrier: layoverCarrier.trim() || undefined,
            terminalGate: layoverTerminalGate.trim() || undefined,
            duration: layoverDuration.trim() || undefined,
            notes: layoverNotes || undefined,
          }
        : undefined;

    const baseData = {
      id: initialData?.id,
      type,
      carrier: carrier.trim() || undefined,
      bookingCode: bookingCode.trim() || undefined,

      date: parsedDepDate,
      departureTime: parsedDepTime || undefined,
      departureTimeZone: departureTimeZone.trim() || (isFlight ? resolveFlightZone(departureIata, departureLocation) : resolveUnambiguousPlaceTimeZone(departureLocation) || undefined),
      departureLocation: departureLocation.trim(),
      departureIata: departureIata.trim() || (isFlight ? resolveAirportIataAndTimeZone(departureLocation).iata : undefined),
      arrivalIata: arrivalIata.trim() || (isFlight ? resolveAirportIataAndTimeZone(arrivalLocation).iata : undefined),

      ...normMeta,
      cost: packageIncluded ? 'Incluso nel pacchetto' : (normCost ?? (cost.trim() || undefined)),
      packageIncluded,
      depositPaid: packageIncluded ? '0' : (normDep ?? (depositPaid.trim() || undefined)),
      acconto: packageIncluded ? '0' : (normAcc ?? (depositPaid.trim() || undefined)),

      ticketUrl: ticketUrl.trim() || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      noteCopilota: noteCopilota.trim() || undefined,
      notes: noteCopilota.trim() || undefined,
      terminalGate: terminalGate.trim() || undefined,
      checkinOpen: checkinOpen.trim() || undefined,
      checkinCutoff: checkinCutoff.trim() || undefined,
      posti: posti.trim() || undefined,
      bagagli: bagagli.trim() || undefined,
      veicolo: veicolo.trim() || undefined,
      assicurazione: assicurazione.trim() || undefined,
      cauzione: cauzione.trim() || undefined,
      layover: preservedLayover,
      copilota: Boolean(noteCopilota.trim()) || copilota || undefined,
      paymentStatus: (packageIncluded ? undefined : (isSaldato ? 'saldato' : 'da_saldare')) as any,
      status: (packageIncluded || isSaldato) ? 'completato' : (initialData?.status || 'prenotato') as StatoTrasporto,
    };

    if (isRental) {
      onSave({
        ...baseData,
        arrivalLocation: departureLocation.trim(),
        dropoffLocation: arrivalLocation.trim() || undefined,
        dropoffDate: parsedArrDate || undefined,
        dropoffTime: parsedArrTime || undefined,
        dropoffTimeZone: dropoffTimeZone.trim() || resolveUnambiguousPlaceTimeZone(arrivalLocation) || undefined,
      });
    } else {
      onSave({
        ...baseData,
        arrivalLocation: arrivalLocation.trim() || departureLocation.trim(),
        arrivalDate: parsedArrDate || parsedDepDate || undefined,
        arrivalTime: parsedArrTime || undefined,
        dropoffTimeZone: dropoffTimeZone.trim() || (isFlight ? resolveFlightZone(arrivalIata, arrivalLocation) : resolveUnambiguousPlaceTimeZone(arrivalLocation) || undefined),
      });
    }
  };

  const getSaldo = () => {
    const c = parseCostToNumber(cost);
    const a = parseCostToNumber(depositPaid);
    return Math.max(0, c - a);
  };

  const isPrimaryField = (field: OperationalFieldKey) => cfg.primaryFields.includes(field);

  const hasValue = (field: OperationalFieldKey): boolean => {
    switch (field) {
      case 'bookingCode':
        return Boolean(bookingCode.trim());
      case 'iata':
        return Boolean(departureIata.trim() || arrivalIata.trim());
      case 'terminalGate':
        return Boolean(terminalGate.trim());
      case 'checkinCutoff':
        return Boolean(checkinCutoff.trim());
      case 'posti':
        return Boolean(posti.trim());
      case 'bagagli':
        return Boolean(bagagli.trim());
      case 'veicolo':
        return Boolean(veicolo.trim());
      case 'assicurazione':
        return Boolean(assicurazione.trim());
      case 'cauzione':
        return Boolean(cauzione.trim());
      case 'layover':
        return Boolean(hasLayover || layoverAirport.trim() || layoverDuration.trim());
    }
  };

  // Visibile nel corpo principale se è primario per la sottocategoria OPPURE se è già compilato (anche se atipico)
  const isVisibleField = (field: OperationalFieldKey) => isPrimaryField(field) || hasValue(field);

  const renderOperationalField = (field: OperationalFieldKey) => {
    switch (field) {
      case 'bookingCode':
        return (
          <div key="bookingCode" data-testid="field-bookingCode">
            <label className={labelClass}>{cfg.bookingCodeLabel}</label>
            <input
              type="text"
              placeholder={cfg.bookingCodePlaceholder}
              value={bookingCode}
              onChange={(e) => setBookingCode(e.target.value)}
              className={inputClass}
            />
          </div>
        );
      case 'terminalGate':
        return (
          <div key="terminalGate" data-testid="field-terminalGate">
            <label className={labelClass}>{cfg.terminalLabel}</label>
            <input
              type="text"
              placeholder={cfg.terminalPlaceholder}
              value={terminalGate}
              onChange={(e) => setTerminalGate(e.target.value)}
              className={inputClass}
            />
          </div>
        );
      case 'checkinCutoff':
        return (
          <div key="checkinCutoff" data-testid="field-checkinCutoff">
            <label className={labelClass}>{cfg.checkinLabel}</label>
            <input
              type="text"
              placeholder={cfg.checkinPlaceholder}
              value={checkinCutoff}
              onChange={(e) => setCheckinCutoff(e.target.value)}
              className={inputClass}
            />
          </div>
        );
      case 'posti':
        return (
          <div key="posti" data-testid="field-posti">
            <label className={labelClass}>{cfg.postiLabel}</label>
            <input
              type="text"
              placeholder={cfg.postiPlaceholder}
              value={posti}
              onChange={(e) => setPosti(e.target.value)}
              className={inputClass}
            />
          </div>
        );
      case 'bagagli':
        return (
          <div key="bagagli" data-testid="field-bagagli">
            <label className={labelClass}>Bagagli inclusi</label>
            <input
              type="text"
              placeholder="es. 2x23kg stiva + 8kg mano"
              value={bagagli}
              onChange={(e) => setBagagli(e.target.value)}
              className={inputClass}
            />
          </div>
        );
      case 'veicolo':
        return (
          <div key="veicolo" data-testid="field-veicolo">
            <label className={labelClass}>Veicolo a bordo</label>
            <input
              type="text"
              placeholder="es. Auto targata AB123CD"
              value={veicolo}
              onChange={(e) => setVeicolo(e.target.value)}
              className={inputClass}
            />
          </div>
        );
      case 'assicurazione':
        return (
          <div key="assicurazione" data-testid="field-assicurazione">
            <label className={labelClass}>Assicurazione</label>
            <input
              type="text"
              placeholder="es. Kasko zero franchigia"
              value={assicurazione}
              onChange={(e) => setAssicurazione(e.target.value)}
              className={inputClass}
            />
          </div>
        );
      case 'cauzione':
        return (
          <div key="cauzione" data-testid="field-cauzione">
            <label className={labelClass}>Deposito / Cauzione</label>
            <input
              type="text"
              placeholder="es. € 500 preautorizzazione"
              value={cauzione}
              onChange={(e) => setCauzione(e.target.value)}
              className={inputClass}
            />
          </div>
        );
      case 'layover':
        return (
          <div key="layover" data-testid="field-layover" className="sm:col-span-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                {isFlight ? 'Volo con scalo' : 'Scalo intermedio (compilato)'}
              </label>
              <input
                type="checkbox"
                checked={hasLayover}
                onChange={(e) => setHasLayover(e.target.checked)}
                className="w-4 h-4 rounded text-[#FF6B5F] bg-white border-slate-300 focus:ring-[#FF6B5F]"
              />
            </div>
            {hasLayover && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <input
                  type="text"
                  placeholder="Aeroporto Scalo (es. PEK)"
                  value={layoverAirport}
                  onChange={(e) => setLayoverAirport(e.target.value)}
                  className={whiteInputClass}
                />
                <input
                  type="text"
                  placeholder="Durata scalo (es. 2h 15m)"
                  value={layoverDuration}
                  onChange={(e) => setLayoverDuration(e.target.value)}
                  className={whiteInputClass}
                />
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const genericMainFields: OperationalFieldKey[] = (['terminalGate', 'checkinCutoff', 'posti', 'veicolo', 'assicurazione', 'cauzione'] as OperationalFieldKey[]).filter(isVisibleField);
  const genericExtraFields: OperationalFieldKey[] = (['terminalGate', 'checkinCutoff', 'posti', 'veicolo', 'assicurazione', 'cauzione'] as OperationalFieldKey[]).filter(field => !genericMainFields.includes(field));
  const genericDepZone = resolveUnambiguousPlaceTimeZone(departureLocation);
  const genericArrZone = resolveUnambiguousPlaceTimeZone(arrivalLocation);
  const genericZoneReview = Boolean(
    (departureLocation.trim() && (!isValidIanaTimeZone(departureTimeZone.trim() || genericDepZone) || (genericDepZone && departureTimeZone && genericDepZone !== departureTimeZone))) ||
    (arrivalLocation.trim() && (!isValidIanaTimeZone(dropoffTimeZone.trim() || genericArrZone) || (genericArrZone && dropoffTimeZone && genericArrZone !== dropoffTimeZone)))
  );

  const handleDepartureAirportBlur = () => {
    if (!isFlight) return;
    const res = resolveAirportIataAndTimeZone(departureLocation);
    const prior = resolveAirportIataAndTimeZone(departureAirportBeforeEdit.current);
    const changed = departureAirportBeforeEdit.current.trim() !== departureLocation.trim();
    const replaceCode = !departureIata.trim() || (changed && Boolean(prior.iata) && departureIata === prior.iata);
    const nextCode = replaceCode ? (res.iata || '') : departureIata;
    if (replaceCode) setDepartureIata(nextCode);
    const zone = resolveFlightZone(nextCode, departureLocation);
    const priorZone = resolveFlightZone(departureIata, departureAirportBeforeEdit.current);
    if (!departureTimeZone.trim() || (changed && priorZone && departureTimeZone === priorZone)) setDepartureTimeZone(zone || '');
  };

  const handleArrivalAirportBlur = () => {
    if (!isFlight) return;
    const res = resolveAirportIataAndTimeZone(arrivalLocation);
    const prior = resolveAirportIataAndTimeZone(arrivalAirportBeforeEdit.current);
    const changed = arrivalAirportBeforeEdit.current.trim() !== arrivalLocation.trim();
    const replaceCode = !arrivalIata.trim() || (changed && Boolean(prior.iata) && arrivalIata === prior.iata);
    const nextCode = replaceCode ? (res.iata || '') : arrivalIata;
    if (replaceCode) setArrivalIata(nextCode);
    const zone = resolveFlightZone(nextCode, arrivalLocation);
    const priorZone = resolveFlightZone(arrivalIata, arrivalAirportBeforeEdit.current);
    if (!dropoffTimeZone.trim() || (changed && priorZone && dropoffTimeZone === priorZone)) setDropoffTimeZone(zone || '');
  };

  const syncLayoverAutoFields = (next: {
    airport?: string;
    iata?: string;
    arrDate?: string;
    arrTime?: string;
    depDate?: string;
    depTime?: string;
  }) => {
    const airportVal = next.airport ?? layoverAirport;
    let iataVal = next.iata ?? layoverIata;
    const res = isTrain ? { iata: undefined, timeZone: resolveUnambiguousPlaceTimeZone(airportVal) || undefined } : resolveAirportIataAndTimeZone(airportVal);
    if (!iataVal.trim() && res.iata) {
      iataVal = res.iata;
      setLayoverIata(res.iata);
    }
    const tz = res.timeZone || (isTrain ? undefined : resolveTimeZoneFromIata(iataVal));
    const calc = computeLayoverDuration({
      arrivalDate: next.arrDate ?? layoverArrivalDate,
      arrivalTime: next.arrTime ?? layoverArrivalTime,
      departureDate: next.depDate ?? layoverDepartureDate,
      departureTime: next.depTime ?? layoverDepartureTime,
      timeZone: tz,
    });
    if (calc) setLayoverDuration(calc);
  };

  const draftTransport: Trasporto | null = initialData
    ? {
        ...initialData,
        type,
        carrier: carrier.trim() || undefined,
        bookingCode: bookingCode.trim() || undefined,
        departureLocation: departureLocation.trim() || initialData.departureLocation,
        arrivalLocation: arrivalLocation.trim() || initialData.arrivalLocation,
        bagagli: bagagli.trim() || undefined,
        ticketUrl: ticketUrl.trim() || undefined,
        attachments,
      }
    : null;

  const handleCopyPnr = async () => {
    const text = bookingCode.trim();
    if (!text) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // ignore clipboard fallback
    }
    setPnrCopied(true);
    setTimeout(() => setPnrCopied(false), 1800);
  };

  const atypicalFlightFields: OperationalFieldKey[] = (
    ['veicolo', 'assicurazione', 'cauzione'] as OperationalFieldKey[]
  ).filter((f) => hasValue(f));
  const filledFlightDetails = [checkinOpen, checkinCutoff, posti].filter(value => value.trim()).length;
  const flightDetailsSummary = `${filledFlightDetails}/3${atypicalFlightFields.length ? ` +${atypicalFlightFields.length}` : ''}`;
  const inferredDepartureZone = resolveFlightZone(departureIata, departureLocation);
  const inferredArrivalZone = resolveFlightZone(arrivalIata, arrivalLocation);
  const currentDepartureZone = departureTimeZone.trim() || inferredDepartureZone || '';
  const currentArrivalZone = dropoffTimeZone.trim() || inferredArrivalZone || '';
  const zoneMismatch = Boolean(
    (inferredDepartureZone && currentDepartureZone !== inferredDepartureZone) ||
    (inferredArrivalZone && currentArrivalZone !== inferredArrivalZone)
  );
  const bothZonesValid = isValidIanaTimeZone(currentDepartureZone) && isValidIanaTimeZone(currentArrivalZone);
  const knownDepCode = resolveAirportIataAndTimeZone(departureLocation).iata;
  const knownArrCode = resolveAirportIataAndTimeZone(arrivalLocation).iata;
  const airportNeedsReview = !bothZonesValid || zoneMismatch ||
    !/^[A-Z]{3}$/.test(departureIata.trim()) || !/^[A-Z]{3}$/.test(arrivalIata.trim()) ||
    Boolean(knownDepCode && knownDepCode !== departureIata.trim()) ||
    Boolean(knownArrCode && knownArrCode !== arrivalIata.trim());

  const renderEconomicBody = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flight-section-title">
          <Wallet aria-hidden="true" className="flight-section-icon" />
          Quadro economico
        </span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs hover:bg-sky-50 transition-colors">
          <input
            type="checkbox"
            checked={packageIncluded}
            onChange={(e) => {
              const checked = e.target.checked;
              setPackageIncluded(checked);
              if (checked) {
                setCost('Incluso');
                setDepositPaid('0');
                setIsSaldato(false);
              } else {
                setCost('');
              }
            }}
            className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500"
          />
          <span className="text-xs font-bold text-sky-800">Incluso nel pacchetto</span>
        </label>
      </div>

      {!packageIncluded ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={labelClass}>Costo totale e valuta</label>
              <CurrencyAmountInput
                type="text"
                placeholder="es. 150.00"
                value={cost}
                onValueChange={(value) => setCost(value)}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-bold focus:outline-none focus:border-[#FF6B5F]"
                uncertain={Boolean((initialData as { currencyUncertain?: boolean } | null | undefined)?.currencyUncertain)}
                currencyLabel="Valuta costo"
              />
            </div>
            <div>
              <label className={labelClass}>Acconto versato</label>
              <CurrencyAmountInput
                type="text"
                placeholder="es. 50.00"
                value={depositPaid}
                onValueChange={(value) => {
                  setDepositPaid(value);
                  setIsSaldato(false);
                }}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
                uncertain={Boolean((initialData as { currencyUncertain?: boolean } | null | undefined)?.currencyUncertain)}
                currencyLabel="Valuta acconto"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => {
                const newVal = !isSaldato;
                setIsSaldato(newVal);
                if (newVal && cost) {
                  setDepositPaid(cost);
                } else if (!newVal) {
                  setDepositPaid('0');
                }
              }}
            >
              <input
                type="checkbox"
                checked={isSaldato}
                readOnly
                className="w-4 h-4 rounded text-emerald-500 bg-white border-slate-300 focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-slate-700">Saldato interamente</span>
            </div>
            {cost && (
              <div className="text-right">
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Saldo Rimanente</span>
                <span className={`text-sm font-extrabold ${getSaldo() > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {formatDraftBalance(cost, depositPaid)}
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="p-2 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800 font-medium">
          ℹ️ Servizio coperto dal pacchetto di viaggio. Non genera costi autonomi nel bilancio.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3" data-testid="trasporto-form" data-transport-subcategory={type}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {isLockedByOther && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
            <span className="text-base animate-pulse">⚠️</span>
            <span>Attenzione: il dispositivo "{lockedBy}" sta già modificando questo elemento in tempo reale.</span>
          </div>
        )}

        {error && (
          <div className="p-2.5 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
            {error}
          </div>
        )}

        {isFlight ? (
          <div className="space-y-2 hounigo-flight-compact" data-testid="flight-back-layout">
            {/* 1. Compagnia e numero volo, con selettore sottocategoria accanto */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.2rem,0.42fr)] gap-2 items-end">
              <div className="min-w-0" data-testid="field-carrier">
                <label className={labelClass}>Compagnia e numero volo</label>
                <input
                  type="text"
                  placeholder="es. Air China CA950"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="min-w-0">
                <label className={labelClass}>Mezzo</label>
                <select
                  data-testid="flight-subcategory-select"
                  aria-label="Sottocategoria trasporto"
                  value={type}
                  onChange={(e) => setType(e.target.value as TipoTrasporto)}
                  className={inputClass}
                >
                  {SUBCATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.pillLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. Itinerario: partenza, arrivo e terminal condividono il contesto visivo */}
            <section className="flight-section flight-section-itinerary space-y-1.5" data-testid="flight-itinerary-section" aria-labelledby="flight-itinerary-title">
              <h3 id="flight-itinerary-title" className="flight-section-title"><Route aria-hidden="true" className="flight-section-icon" /> Itinerario</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 flight-airport-block">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    <PlaneTakeoff aria-hidden="true" className="flight-section-icon" /> Partenza
                  </label>
                  {departureIata.trim() && (
                    <span
                      data-testid="flight-departure-iata-badge"
                      className="px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-800 font-mono text-[10px] font-extrabold tracking-wider"
                    >
                      {departureIata.trim().toUpperCase()}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Aeroporto di partenza"
                  value={departureLocation}
                  onChange={(e) => setDepartureLocation(e.target.value)}
                  onFocus={() => { departureAirportBeforeEdit.current = departureLocation; }}
                  onBlur={handleDepartureAirportBlur}
                  className={whiteInputClass}
                  required
                />
                <DateTimePickerInput
                  value={departureDate}
                  onChange={setDepartureDate}
                  required
                  dateLabel="Data partenza"
                  timeLabel="Orario"
                />
              </div>

              <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 flight-airport-block">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    <PlaneLanding aria-hidden="true" className="flight-section-icon" /> Arrivo
                  </label>
                  {arrivalIata.trim() && (
                    <span
                      data-testid="flight-arrival-iata-badge"
                      className="px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-800 font-mono text-[10px] font-extrabold tracking-wider"
                    >
                      {arrivalIata.trim().toUpperCase()}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Aeroporto di arrivo"
                  value={arrivalLocation}
                  onChange={(e) => setArrivalLocation(e.target.value)}
                  onFocus={() => { arrivalAirportBeforeEdit.current = arrivalLocation; }}
                  onBlur={handleArrivalAirportBlur}
                  className={whiteInputClass}
                />
                <DateTimePickerInput
                  value={arrivalDate}
                  onChange={setArrivalDate}
                  dateLabel="Data arrivo"
                  timeLabel="Orario"
                />
              </div>
            </div>

            {/* 3. Terminal / Gate */}
            <div data-testid="field-terminalGate">
              <label className={labelClass}>Terminal / Gate</label>
              <FlightAdaptiveText
                aria-label="Terminal / Gate"
                placeholder="es. T3, Gate E12"
                value={terminalGate}
                onChange={(e) => setTerminalGate(e.target.value)}
                className={`${inputClass} h-auto min-h-[3rem] py-1.5 resize-y whitespace-pre-wrap break-words`}
              />
            </div>

            {/* Mostra la correzione soltanto in caso di dati mancanti o incoerenti.
                Mantieni aperto il pannello durante la correzione manuale. */}
            {(airportNeedsReview || isFlightAdvancedOpen) && (
            <div className="flight-airport-correction">
              <button
                type="button"
                data-testid="toggle-flight-advanced"
                aria-expanded={isFlightAdvancedOpen}
                onClick={() => setIsFlightAdvancedOpen((prev) => !prev)}
                className={`flight-airport-correction-toggle ${airportNeedsReview ? 'flight-status-review' : ''}`}
              >
                <Settings aria-hidden="true" className="flight-section-icon" />
                <span>{airportNeedsReview ? 'Verifica aeroporti' : 'Chiudi verifica'}</span>
                {isFlightAdvancedOpen ? <ChevronUp aria-hidden="true" className="w-3.5 h-3.5" /> : <ChevronDown aria-hidden="true" className="w-3.5 h-3.5" />}
              </button>

              {isFlightAdvancedOpen && (
                <div className="flight-technical-body p-2.5 space-y-2">
                  <p className="flight-zone-help">I fusi sono ricavati dagli aeroporti riconosciuti. Correggili solo se necessario.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div data-testid="field-departureIata">
                      <label className={labelClass}>IATA Partenza</label>
                      <input
                        type="text"
                        placeholder="es. FCO"
                        value={departureIata}
                        onChange={(e) => setDepartureIata(e.target.value.toUpperCase())}
                        onBlur={() => {
                          const zone = resolveFlightZone(departureIata, departureLocation);
                          if (!departureTimeZone.trim() && zone) setDepartureTimeZone(zone);
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div data-testid="field-arrivalIata">
                      <label className={labelClass}>IATA Arrivo</label>
                      <input
                        type="text"
                        placeholder="es. AKL"
                        value={arrivalIata}
                        onChange={(e) => setArrivalIata(e.target.value.toUpperCase())}
                        onBlur={() => {
                          const zone = resolveFlightZone(arrivalIata, arrivalLocation);
                          if (!dropoffTimeZone.trim() && zone) setDropoffTimeZone(zone);
                        }}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <TimeZoneInput
                      value={departureTimeZone}
                      onChange={setDepartureTimeZone}
                      label="Fuso orario partenza"
                    />
                    <TimeZoneInput
                      value={dropoffTimeZone}
                      onChange={setDropoffTimeZone}
                      label="Fuso orario arrivo"
                    />
                  </div>
                  {(inferredDepartureZone || inferredArrivalZone) && (
                    <button type="button" className="flight-use-auto" data-testid="flight-use-auto-zones" onClick={() => {
                      if (inferredDepartureZone) setDepartureTimeZone(inferredDepartureZone);
                      if (inferredArrivalZone) setDropoffTimeZone(inferredArrivalZone);
                      setIsFlightAdvancedOpen(false);
                    }}>Usa fusi rilevati</button>
                  )}
                </div>
              )}
            </div>
            )}

            </section>

            {/* 4. Quadro economico sempre aperto */}
            <div className="flight-section flight-section-finance" data-testid="flight-finance-always-open">
              {renderEconomicBody()}
            </div>

            {/* Scalo: blocco dedicato distinto dall'itinerario diretto */}
            {!hasLayover ? (
              <button
                type="button"
                data-testid="add-layover-btn"
                onClick={() => {
                  setHasLayover(true);
                  setIsLayoverExpanded(true);
                }}
                className="flight-section flight-section-layover flight-technical-row flight-add-layover w-full text-left cursor-pointer"
              >
                <span className="flight-technical-label"><Route className="flight-section-icon" aria-hidden="true" /> Aggiungi scalo</span>
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <div className="flight-section flight-section-layover overflow-hidden" data-testid="field-layover">
                <div className="flight-technical-row gap-2">
                  <button
                    type="button"
                    data-testid="toggle-layover-summary"
                    onClick={() => setIsLayoverExpanded((prev) => !prev)}
                    className="flex-1 flex items-center justify-between text-left min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="flight-technical-label shrink-0">
                        <Route aria-hidden="true" className="flight-section-icon" /> Scalo
                      </span>
                      <span className="text-xs font-semibold text-slate-600 truncate">
                        · {layoverIata ? `${layoverIata.toUpperCase()} · ` : ''}{layoverAirport || 'Da configurare'}
                        {layoverDuration ? ` · ${layoverDuration}` : ''}
                        {layoverCarrier ? ` · ${layoverCarrier}` : ''}
                      </span>
                    </div>
                    {isLayoverExpanded ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    data-testid="remove-layover-btn"
                    onClick={() => {
                      setHasLayover(false);
                      setLayoverAirport('');
                      setLayoverIata('');
                      setLayoverArrivalDate('');
                      setLayoverArrivalTime('');
                      setLayoverDepartureDate('');
                      setLayoverDepartureTime('');
                      setLayoverCarrier('');
                      setLayoverTerminalGate('');
                      setLayoverDuration('');
                      setLayoverNotes('');
                      setIsLayoverExpanded(false);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    title="Rimuovi scalo"
                    aria-label="Rimuovi scalo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isLayoverExpanded && (
                  <div className="flight-technical-body p-2.5 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-8">
                        <label className={labelClass}>Aeroporto intermedio</label>
                        <input
                          type="text"
                          placeholder="es. Beijing Capital"
                          value={layoverAirport}
                          onChange={(e) => setLayoverAirport(e.target.value)}
                          onBlur={() => syncLayoverAutoFields({ airport: layoverAirport })}
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <label className={labelClass}>IATA scalo</label>
                        <input
                          type="text"
                          placeholder="es. PEK"
                          value={layoverIata}
                          onChange={(e) => setLayoverIata(e.target.value.toUpperCase())}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className={labelClass}>Data arrivo scalo</label>
                        <input
                          type="date"
                          value={layoverArrivalDate}
                          onChange={(e) => {
                            setLayoverArrivalDate(e.target.value);
                            syncLayoverAutoFields({ arrDate: e.target.value });
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Ora arrivo</label>
                        <input
                          type="time"
                          value={layoverArrivalTime}
                          onChange={(e) => {
                            setLayoverArrivalTime(e.target.value);
                            syncLayoverAutoFields({ arrTime: e.target.value });
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Data ripartenza</label>
                        <input
                          type="date"
                          value={layoverDepartureDate}
                          onChange={(e) => {
                            setLayoverDepartureDate(e.target.value);
                            syncLayoverAutoFields({ depDate: e.target.value });
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Ora ripartenza</label>
                        <input
                          type="time"
                          value={layoverDepartureTime}
                          onChange={(e) => {
                            setLayoverDepartureTime(e.target.value);
                            syncLayoverAutoFields({ depTime: e.target.value });
                          }}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className={labelClass}>Volo successivo</label>
                        <input
                          type="text"
                          placeholder="es. CA783"
                          value={layoverCarrier}
                          onChange={(e) => setLayoverCarrier(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Terminal / Gate scalo</label>
                        <input
                          type="text"
                          placeholder="es. T3 Gate E05"
                          value={layoverTerminalGate}
                          onChange={(e) => setLayoverTerminalGate(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Durata scalo (auto)</label>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          placeholder="Calcolata auto"
                          value={layoverDuration}
                          className="w-full h-10 px-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-sm font-mono cursor-default"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Note dello scalo</label>
                      <FlightAdaptiveText data-testid="flight-layover-notes" aria-label="Note dello scalo" value={layoverNotes} onChange={(e) => setLayoverNotes(e.target.value)} className="w-full p-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm resize-y" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <section className="flight-section flight-section-technical" data-testid="flight-technical-section" aria-label="Dettagli operativi">
            {/* 6. Dettagli volo collassati */}
            <div className="flight-technical-item overflow-hidden">
              <button
                type="button"
                data-testid="toggle-flight-details"
                aria-expanded={isFlightDetailsOpen}
                onClick={() => setIsFlightDetailsOpen((prev) => !prev)}
                className="flight-technical-row w-full text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flight-technical-label shrink-0">
                    <List aria-hidden="true" className="flight-section-icon" /> Check-in e posti
                  </span>
                </div>
                <span className="flight-compact-status" aria-label={`${filledFlightDetails} di 3 campi compilati`}>{flightDetailsSummary}</span>
                {isFlightDetailsOpen ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
              </button>

              {isFlightDetailsOpen && (
                <div className="flight-technical-body p-2.5 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div data-testid="field-checkinOpen">
                      <label className={labelClass}>Apertura check-in</label>
                      <FlightAdaptiveText
                        aria-label="Apertura check-in"
                        placeholder="es. 24h prima / 16:00"
                        value={checkinOpen}
                        onChange={(e) => setCheckinOpen(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div data-testid="field-checkinCutoff">
                      <label className={labelClass}>Chiusura check-in</label>
                      <FlightAdaptiveText
                        aria-label="Chiusura check-in"
                        placeholder="es. 18:00"
                        value={checkinCutoff}
                        onChange={(e) => setCheckinCutoff(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div data-testid="field-posti">
                      <label className={labelClass}>Posti assegnati</label>
                      <FlightAdaptiveText
                        aria-label="Posti assegnati"
                        placeholder="es. 14A, 14B"
                        value={posti}
                        onChange={(e) => setPosti(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  {atypicalFlightFields.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      {atypicalFlightFields.map((f) => renderOperationalField(f))}
                    </div>
                  )}
                </div>
              )}
            </div>

            </section>

            {/* 9. Funzioni operative condivise con il fronte (PNR, Bagagli, Biglietti & Documenti) */}
            <div className="grid grid-cols-3 gap-1.5 pt-0.5" data-testid="flight-shared-actions">
              <button
                type="button"
                data-testid="flight-action-pnr"
                onClick={() => setIsPnrModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  bookingCode.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🎫</span>
                <span>PNR{bookingCode.trim() ? ' · ✓' : ''}</span>
              </button>

              <button
                type="button"
                data-testid="flight-action-bagagli"
                onClick={() => setIsBagagliModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  bagagli.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🧳</span>
                <span>Bagagli{bagagli.trim() ? ' · ✓' : ''}</span>
              </button>

              <button
                type="button"
                data-testid="flight-action-tickets"
                onClick={() => setIsTicketsModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  attachments.length > 0 || ticketUrl.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🎟️</span>
                <span>Biglietti{attachments.length > 0 || ticketUrl.trim() ? ' · ✓' : ''}</span>
              </button>
            </div>

            {/* 10. Note Copilota (collassate di default, contenuto preservato) */}
            <div className="flight-section flight-section-notes" data-testid="flight-notes">
              <button
                type="button"
                data-testid="toggle-flight-notes"
                aria-expanded={isFlightNotesOpen}
                aria-controls="flight-notes-content"
                className="flight-notes-toggle w-full text-left cursor-pointer"
                onClick={() => setIsFlightNotesOpen((prev) => !prev)}
              >
                <span className="flight-section-title"><MessageSquare aria-hidden="true" className="flight-section-icon" /> Note Copilota</span>
                <span className="flight-notes-status">{noteCopilota.trim() ? 'Presenti' : 'Nessuna nota'}</span>
                {isFlightNotesOpen ? <ChevronUp aria-hidden="true" className="w-4 h-4 shrink-0" /> : <ChevronDown aria-hidden="true" className="w-4 h-4 shrink-0" />}
              </button>
              <div id="flight-notes-content" hidden={!isFlightNotesOpen}>
                {isFlightNotesOpen && (
                  <FlightAdaptiveText
                    aria-label="Note Copilota"
                    placeholder="Istruzioni operative, gate, check-in..."
                    value={noteCopilota}
                    onChange={(e) => setNoteCopilota(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F] resize-none"
                  />
                )}
              </div>
            </div>
          </div>
        ) : isTrain ? (
          <div className="space-y-2 hounigo-flight-compact hounigo-train-compact" data-testid="train-back-layout">
            {/* 1. Operatore / N. treno, con selettore sottocategoria accanto */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.2rem,0.42fr)] gap-2 items-end">
              <div className="min-w-0" data-testid="field-carrier">
                <label className={labelClass}>Operatore / N. treno</label>
                <input
                  type="text"
                  placeholder="es. Frecciarossa 9612"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="min-w-0">
                <label className={labelClass}>Mezzo</label>
                <select
                  data-testid="train-subcategory-select"
                  aria-label="Sottocategoria trasporto"
                  value={type}
                  onChange={(e) => setType(e.target.value as TipoTrasporto)}
                  className={inputClass}
                >
                  {SUBCATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.pillLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <section className="flight-section flight-section-itinerary space-y-1.5" data-testid="train-itinerary-section">
              <h3 className="flight-section-title"><Route aria-hidden="true" className="flight-section-icon" /> Itinerario</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5"><div className="p-1.5 rounded-xl space-y-1 flight-airport-block">
                  <label className={labelClass}>Partenza</label>
                  <input type="text" aria-label="Stazione di partenza" placeholder="Stazione di partenza" value={departureLocation} onFocus={() => { departureAirportBeforeEdit.current = departureLocation; }} onChange={e => setDepartureLocation(e.target.value)} onBlur={() => {
                    const previous = resolveUnambiguousPlaceTimeZone(departureAirportBeforeEdit.current);
                    const next = resolveUnambiguousPlaceTimeZone(departureLocation);
                    if (!departureTimeZone.trim() || (departureTimeZone === previous && departureAirportBeforeEdit.current !== departureLocation)) setDepartureTimeZone(next || '');
                  }} className={whiteInputClass} required />
                  <DateTimePickerInput value={departureDate} onChange={setDepartureDate} required dateLabel="Data partenza" timeLabel="Orario" />
                </div>
<div className="p-1.5 rounded-xl space-y-1 flight-airport-block">
                  <label className={labelClass}>Arrivo</label>
                  <input type="text" aria-label="Stazione di arrivo" placeholder="Stazione di arrivo" value={arrivalLocation} onFocus={() => { arrivalAirportBeforeEdit.current = arrivalLocation; }} onChange={e => setArrivalLocation(e.target.value)} onBlur={() => {
                    const previous = resolveUnambiguousPlaceTimeZone(arrivalAirportBeforeEdit.current);
                    const next = resolveUnambiguousPlaceTimeZone(arrivalLocation);
                    if (!dropoffTimeZone.trim() || (dropoffTimeZone === previous && arrivalAirportBeforeEdit.current !== arrivalLocation)) setDropoffTimeZone(next || '');
                  }} className={whiteInputClass}  />
                  <DateTimePickerInput value={arrivalDate} onChange={setArrivalDate}  dateLabel="Data arrivo" timeLabel="Orario" />
                </div></div>
              <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,0.85fr)_minmax(0,1.45fr)] gap-1.5 train-seat-grid">
                <div data-testid="field-terminalGate" className="min-w-0"><label className={labelClass}>Binario</label><FlightAdaptiveText aria-label="Binario" value={terminalGate} onChange={e => setTerminalGate(e.target.value)} placeholder="4" className={inputClass} /></div>
                <div data-testid="field-carrozza" className="min-w-0"><label className={labelClass}>Carrozza</label><FlightAdaptiveText aria-label="Carrozza" value={trainSeats.coach} onChange={e => setPosti(joinTrainSeats(e.target.value, trainSeats.seats))} placeholder="5" className={inputClass} /></div>
                <div data-testid="field-posti" className="min-w-0"><label className={labelClass}>Posti</label><FlightAdaptiveText aria-label="Posti" value={trainSeats.seats} onChange={e => setPosti(joinTrainSeats(trainSeats.coach, e.target.value))} placeholder="12A, 12B" className={inputClass} /></div>
              </div>
            </section>
            <div className="flight-section flight-section-finance" data-testid="train-finance-always-open">{renderEconomicBody()}</div>
            {/* Scalo: blocco dedicato distinto dall'itinerario diretto */}
            {!hasLayover ? (
              <button
                type="button"
                data-testid="add-train-change"
                onClick={() => {
                  setHasLayover(true);
                  setIsLayoverExpanded(true);
                }}
                className="flight-section flight-section-layover flight-technical-row flight-add-layover w-full text-left cursor-pointer"
              >
                <span className="flight-technical-label"><Route className="flight-section-icon" aria-hidden="true" /> Aggiungi cambio treno</span>
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <div className="flight-section flight-section-layover overflow-hidden" data-testid="train-change">
                <div className="flight-technical-row gap-2">
                  <button
                    type="button"
                    data-testid="toggle-train-change"
                    onClick={() => setIsLayoverExpanded((prev) => !prev)}
                    className="flex-1 flex items-center justify-between text-left min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="flight-technical-label shrink-0">
                        <Route aria-hidden="true" className="flight-section-icon" /> Cambio treno
                      </span>
                      <span className="text-xs font-semibold text-slate-600 truncate">
                        · {layoverAirport || 'Da configurare'}
                        {layoverDuration ? ` · ${layoverDuration}` : ''}
                        {layoverCarrier ? ` · ${layoverCarrier}` : ''}
                      </span>
                    </div>
                    {isLayoverExpanded ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    data-testid="remove-train-change"
                    onClick={() => {
                      setHasLayover(false);
                      setLayoverAirport('');
                      setLayoverIata('');
                      setLayoverArrivalDate('');
                      setLayoverArrivalTime('');
                      setLayoverDepartureDate('');
                      setLayoverDepartureTime('');
                      setLayoverCarrier('');
                      setLayoverTerminalGate('');
                      setLayoverDuration('');
                      setLayoverNotes('');
                      setIsLayoverExpanded(false);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    title="Rimuovi cambio treno"
                    aria-label="Rimuovi cambio treno"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isLayoverExpanded && (
                  <div className="flight-technical-body p-2.5 space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      <div className="min-w-0">
                        <label className={labelClass}>Stazione di cambio</label>
                        <input
                          type="text"
                          placeholder="es. Bologna Centrale"
                          value={layoverAirport}
                          onChange={(e) => setLayoverAirport(e.target.value)}
                          onBlur={() => syncLayoverAutoFields({ airport: layoverAirport })}
                          className={inputClass}
                        />
                      </div>
                      
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className={labelClass}>Data arrivo al cambio</label>
                        <input
                          type="date"
                          value={layoverArrivalDate}
                          onChange={(e) => {
                            setLayoverArrivalDate(e.target.value);
                            syncLayoverAutoFields({ arrDate: e.target.value });
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Ora arrivo</label>
                        <input
                          type="time"
                          value={layoverArrivalTime}
                          onChange={(e) => {
                            setLayoverArrivalTime(e.target.value);
                            syncLayoverAutoFields({ arrTime: e.target.value });
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Data ripartenza</label>
                        <input
                          type="date"
                          value={layoverDepartureDate}
                          onChange={(e) => {
                            setLayoverDepartureDate(e.target.value);
                            syncLayoverAutoFields({ depDate: e.target.value });
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Ora ripartenza</label>
                        <input
                          type="time"
                          value={layoverDepartureTime}
                          onChange={(e) => {
                            setLayoverDepartureTime(e.target.value);
                            syncLayoverAutoFields({ depTime: e.target.value });
                          }}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className={labelClass}>Treno successivo</label>
                        <input
                          type="text"
                          placeholder="es. FR 9520"
                          value={layoverCarrier}
                          onChange={(e) => setLayoverCarrier(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Binario ripartenza</label>
                        <input
                          type="text"
                          placeholder="es. 7"
                          value={layoverTerminalGate}
                          onChange={(e) => setLayoverTerminalGate(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Attesa (auto)</label>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          placeholder="Calcolata auto"
                          value={layoverDuration}
                          className="w-full h-10 px-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-sm font-mono cursor-default"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Note del cambio</label>
                      <FlightAdaptiveText data-testid="train-change-notes" aria-label="Note del cambio" value={layoverNotes} onChange={(e) => setLayoverNotes(e.target.value)} className="w-full p-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm resize-y" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <section className="flight-section flight-section-technical">
              <button type="button" className="flight-technical-row w-full text-left cursor-pointer" data-testid="toggle-train-details" aria-expanded={isSecondaryOpen} onClick={() => setIsSecondaryOpen(v => !v)}>
                <span className="flight-technical-label"><List aria-hidden="true" className="flight-section-icon" /> Informazioni aggiuntive</span>
                {isSecondaryOpen ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </button>
              {isSecondaryOpen && <div className="flight-technical-body p-2.5 space-y-2">
                <div data-testid="field-checkinCutoff"><label className={labelClass}>Presentarsi entro (facoltativo)</label><FlightAdaptiveText value={checkinCutoff} onChange={e => setCheckinCutoff(e.target.value)} className={inputClass} /></div>
                {checkinOpen.trim() && <div><label className={labelClass}>Informazioni orario preesistenti</label><FlightAdaptiveText value={checkinOpen} onChange={e => setCheckinOpen(e.target.value)} className={inputClass} /></div>}
                {atypicalFlightFields.map(field => renderOperationalField(field))}
                {(departureIata.trim() || arrivalIata.trim()) && <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelClass}>Codice partenza preesistente</label><input value={departureIata} onChange={e => setDepartureIata(e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Codice arrivo preesistente</label><input value={arrivalIata} onChange={e => setArrivalIata(e.target.value)} className={inputClass} /></div>
                </div>}
                {layoverIata.trim() && <div><label className={labelClass}>Codice cambio preesistente</label><input value={layoverIata} onChange={e => setLayoverIata(e.target.value)} className={inputClass} /></div>}
                {(!resolveUnambiguousPlaceTimeZone(departureLocation) || !resolveUnambiguousPlaceTimeZone(arrivalLocation) ||
                  (departureTimeZone && departureTimeZone !== resolveUnambiguousPlaceTimeZone(departureLocation)) ||
                  (dropoffTimeZone && dropoffTimeZone !== resolveUnambiguousPlaceTimeZone(arrivalLocation))) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <TimeZoneInput value={departureTimeZone} onChange={setDepartureTimeZone} label="Fuso partenza (se non riconosciuto)" />
                  <TimeZoneInput value={dropoffTimeZone} onChange={setDropoffTimeZone} label="Fuso arrivo (se non riconosciuto)" />
                </div>}
              </div>}
            </section>
            {/* 9. Funzioni operative condivise con il fronte (PNR, Bagagli, Biglietti & Documenti) */}
            <div className="grid grid-cols-3 gap-1.5 pt-0.5" data-testid="train-shared-actions">
              <button
                type="button"
                data-testid="train-action-pnr"
                onClick={() => setIsPnrModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  bookingCode.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🎫</span>
                <span>Codice{bookingCode.trim() ? ' · ✓' : ''}</span>
              </button>

              <button
                type="button"
                data-testid="train-action-bagagli"
                onClick={() => setIsBagagliModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  bagagli.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🧳</span>
                <span>Bagagli{bagagli.trim() ? ' · ✓' : ''}</span>
              </button>

              <button
                type="button"
                data-testid="train-action-tickets"
                onClick={() => setIsTicketsModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  attachments.length > 0 || ticketUrl.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🎟️</span>
                <span>Biglietti{attachments.length > 0 || ticketUrl.trim() ? ' · ✓' : ''}</span>
              </button>
            </div>

            {/* 10. Note Copilota (collassate di default, contenuto preservato) */}
            <div className="flight-section flight-section-notes" data-testid="train-notes">
              <button
                type="button"
                data-testid="toggle-train-notes"
                aria-expanded={isFlightNotesOpen}
                aria-controls="train-notes-content"
                className="flight-notes-toggle w-full text-left cursor-pointer"
                onClick={() => setIsFlightNotesOpen((prev) => !prev)}
              >
                <span className="flight-section-title"><MessageSquare aria-hidden="true" className="flight-section-icon" /> Note Copilota</span>
                <span className="flight-notes-status">{noteCopilota.trim() ? 'Presenti' : 'Nessuna nota'}</span>
                {isFlightNotesOpen ? <ChevronUp aria-hidden="true" className="w-4 h-4 shrink-0" /> : <ChevronDown aria-hidden="true" className="w-4 h-4 shrink-0" />}
              </button>
              <div id="train-notes-content" hidden={!isFlightNotesOpen}>
                {isFlightNotesOpen && (
                  <FlightAdaptiveText
                    aria-label="Note Copilota"
                    placeholder="Istruzioni operative, accesso alla stazione..."
                    value={noteCopilota}
                    onChange={(e) => setNoteCopilota(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F] resize-none"
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 hounigo-flight-compact hounigo-generic-transport-compact" data-testid="transport-back-layout">
            {/* Identità e selettore della sottocategoria */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.2rem,0.42fr)] gap-2 items-end">
              <div className="min-w-0" data-testid="field-carrier">
                <label className={labelClass}>{cfg.carrierLabel}</label>
                <input
                  type="text"
                  placeholder={cfg.carrierPlaceholder}
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="min-w-0">
                <label className={labelClass}>Mezzo</label>
                <select
                  data-testid="transport-subcategory-select"
                  aria-label="Sottocategoria trasporto"
                  value={type}
                  onChange={(e) => setType(e.target.value as TipoTrasporto)}
                  className={inputClass}
                >
                  {SUBCATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.pillLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>


            <section className="flight-section flight-section-itinerary space-y-1.5" data-testid="transport-itinerary-section">
              <h3 className="flight-section-title"><Route aria-hidden="true" className="flight-section-icon" /> {isRental ? 'Ritiro e riconsegna' : 'Itinerario'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5"><div className="p-1.5 rounded-xl space-y-1 flight-airport-block">
                  <label className={labelClass}>{cfg.departureLabel}</label>
                  <input type="text" aria-label={cfg.departureLabel} placeholder={cfg.departurePlaceholder} value={departureLocation} onFocus={() => { departureAirportBeforeEdit.current = departureLocation; }} onChange={e => setDepartureLocation(e.target.value)} onBlur={() => {
                    const previous = resolveUnambiguousPlaceTimeZone(departureAirportBeforeEdit.current);
                    const next = resolveUnambiguousPlaceTimeZone(departureLocation);
                    if (!departureTimeZone.trim() || (departureTimeZone === previous && departureAirportBeforeEdit.current !== departureLocation)) setDepartureTimeZone(next || '');
                  }} className={whiteInputClass} required />
                  <DateTimePickerInput value={departureDate} onChange={setDepartureDate} required dateLabel={isRental ? 'Data ritiro' : 'Data partenza'} timeLabel="Orario" />
                </div>
<div className="p-1.5 rounded-xl space-y-1 flight-airport-block">
                  <label className={labelClass}>{cfg.arrivalLabel}</label>
                  <input type="text" aria-label={cfg.arrivalLabel} placeholder={cfg.arrivalPlaceholder} value={arrivalLocation} onFocus={() => { arrivalAirportBeforeEdit.current = arrivalLocation; }} onChange={e => setArrivalLocation(e.target.value)} onBlur={() => {
                    const previous = resolveUnambiguousPlaceTimeZone(arrivalAirportBeforeEdit.current);
                    const next = resolveUnambiguousPlaceTimeZone(arrivalLocation);
                    if (!dropoffTimeZone.trim() || (dropoffTimeZone === previous && arrivalAirportBeforeEdit.current !== arrivalLocation)) setDropoffTimeZone(next || '');
                  }} className={whiteInputClass}  />
                  <DateTimePickerInput value={arrivalDate} onChange={setArrivalDate}  dateLabel={isRental ? 'Data riconsegna' : 'Data arrivo'} timeLabel="Orario" />
                </div></div>
              {genericMainFields.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 generic-operational-grid" data-testid="transport-primary-fields">
                  {genericMainFields.map(field => renderOperationalField(field))}
                </div>
              )}
            </section>
            <div className="flight-section flight-section-finance" data-testid="transport-finance-always-open">{renderEconomicBody()}</div>

            {hasLayover && (
              <section className="flight-section flight-section-layover" data-testid="field-layover">
                <div className="flight-technical-row flex items-center gap-2">
                  <button type="button" className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer" data-testid="toggle-transport-stop" aria-expanded={isLayoverExpanded} onClick={() => setIsLayoverExpanded(v => !v)}>
                    <Route aria-hidden="true" className="flight-section-icon" />
                    <span className="flight-technical-label">Sosta / cambio</span>
                    <span className="truncate text-xs">{layoverAirport || 'Da completare'}</span>
                    {isLayoverExpanded ? <ChevronUp className="ml-auto w-4 h-4 shrink-0" /> : <ChevronDown className="ml-auto w-4 h-4 shrink-0" />}
                  </button>
                  <button type="button" aria-label="Rimuovi sosta" className="p-1.5 text-slate-500" onClick={() => {
                    setHasLayover(false); setLayoverAirport(''); setLayoverIata(''); setLayoverArrivalDate(''); setLayoverArrivalTime(''); setLayoverDepartureDate(''); setLayoverDepartureTime(''); setLayoverCarrier(''); setLayoverTerminalGate(''); setLayoverDuration(''); setLayoverNotes(''); setIsLayoverExpanded(false);
                  }}><Trash2 className="w-4 h-4" /></button>
                </div>
                {isLayoverExpanded && <div className="flight-technical-body p-2.5 grid grid-cols-2 gap-2"><div className="min-w-0"><label className={labelClass}>Località / punto intermedio</label><FlightAdaptiveText aria-label="Località / punto intermedio" value={layoverAirport} onChange={e => setLayoverAirport(e.target.value)} className={inputClass} /></div>
<div className="min-w-0"><label className={labelClass}>Codice località (se presente)</label><FlightAdaptiveText aria-label="Codice località (se presente)" value={layoverIata} onChange={e => setLayoverIata(e.target.value)} className={inputClass} /></div>
<div className="min-w-0"><label className={labelClass}>Data arrivo</label><input type="date" value={layoverArrivalDate} onChange={e => setLayoverArrivalDate(e.target.value)} className={inputClass} /></div>
<div className="min-w-0"><label className={labelClass}>Orario arrivo</label><input type="time" value={layoverArrivalTime} onChange={e => setLayoverArrivalTime(e.target.value)} className={inputClass} /></div>
<div className="min-w-0"><label className={labelClass}>Data ripartenza</label><input type="date" value={layoverDepartureDate} onChange={e => setLayoverDepartureDate(e.target.value)} className={inputClass} /></div>
<div className="min-w-0"><label className={labelClass}>Orario ripartenza</label><input type="time" value={layoverDepartureTime} onChange={e => setLayoverDepartureTime(e.target.value)} className={inputClass} /></div>
<div className="min-w-0"><label className={labelClass}>Mezzo successivo</label><FlightAdaptiveText aria-label="Mezzo successivo" value={layoverCarrier} onChange={e => setLayoverCarrier(e.target.value)} className={inputClass} /></div>
<div className="min-w-0"><label className={labelClass}>Punto di ripartenza</label><FlightAdaptiveText aria-label="Punto di ripartenza" value={layoverTerminalGate} onChange={e => setLayoverTerminalGate(e.target.value)} className={inputClass} /></div>
<div className="min-w-0"><label className={labelClass}>Durata / attesa</label><FlightAdaptiveText aria-label="Durata / attesa" value={layoverDuration} onChange={e => setLayoverDuration(e.target.value)} className={inputClass} /></div>
<div className="col-span-2"><label className={labelClass}>Note</label><FlightAdaptiveText aria-label="Note" value={layoverNotes} onChange={e => setLayoverNotes(e.target.value)} className={inputClass} /></div></div>}
              </section>
            )}

            <section className="flight-section flight-section-technical">
              <button type="button" data-testid="toggle-secondary-details" aria-expanded={isSecondaryOpen} onClick={() => setIsSecondaryOpen(v => !v)} className="flight-technical-row w-full text-left cursor-pointer">
                <span className="flight-technical-label"><List aria-hidden="true" className="flight-section-icon" /> Informazioni aggiuntive</span>
                {genericZoneReview && <span className="flight-compact-status flight-status-review">Verifica orari</span>}
                {isSecondaryOpen ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </button>
              {isSecondaryOpen && <div className="flight-technical-body p-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-2 generic-operational-grid">
                  {genericExtraFields.map(field => renderOperationalField(field))}
                  <div className="col-span-2"><label className={labelClass}>Link biglietto / voucher</label><input type="url" data-testid="transport-ticket-url" aria-label="Link biglietto / voucher" placeholder="https://..." value={ticketUrl} onChange={e => setTicketUrl(e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Informazioni orario aggiuntive</label><FlightAdaptiveText aria-label="Informazioni orario aggiuntive" value={checkinOpen} onChange={e => setCheckinOpen(e.target.value)} className={inputClass} /></div>
                  {(departureIata.trim() || arrivalIata.trim()) && <>
                    <div data-testid="field-departureIata"><label className={labelClass}>Codice partenza preesistente</label><input value={departureIata} onChange={e => setDepartureIata(e.target.value)} className={inputClass} /></div>
                    <div data-testid="field-arrivalIata"><label className={labelClass}>Codice arrivo preesistente</label><input value={arrivalIata} onChange={e => setArrivalIata(e.target.value)} className={inputClass} /></div>
                  </>}
                </div>
                {genericZoneReview && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <TimeZoneInput value={departureTimeZone || genericDepZone || ''} onChange={setDepartureTimeZone} label={isRental ? 'Fuso ritiro' : 'Fuso partenza'} />
                  <TimeZoneInput value={dropoffTimeZone || genericArrZone || ''} onChange={setDropoffTimeZone} label={isRental ? 'Fuso riconsegna' : 'Fuso arrivo'} />
                  {(genericDepZone || genericArrZone) && <button type="button" className="flight-use-auto" onClick={() => { if (genericDepZone) setDepartureTimeZone(genericDepZone); if (genericArrZone) setDropoffTimeZone(genericArrZone); }}>Usa orari rilevati</button>}
                </div>}
                {!hasLayover && <button type="button" className="flight-use-auto" data-testid="add-transport-stop" onClick={() => {setHasLayover(true);setIsLayoverExpanded(true);}}>Aggiungi sosta / cambio</button>}
              </div>}
            </section>
            {/* 9. Funzioni operative condivise con il fronte (PNR, Bagagli, Biglietti & Documenti) */}
            <div className="grid grid-cols-3 gap-1.5 pt-0.5" data-testid="transport-shared-actions">
              <button
                type="button"
                data-testid="transport-action-pnr"
                onClick={() => setIsPnrModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  bookingCode.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🎫</span>
                <span>Codice{bookingCode.trim() ? ' · ✓' : ''}</span>
              </button>

              <button
                type="button"
                data-testid="transport-action-bagagli"
                onClick={() => setIsBagagliModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  bagagli.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🧳</span>
                <span>Bagagli{bagagli.trim() ? ' · ✓' : ''}</span>
              </button>

              <button
                type="button"
                data-testid="transport-action-tickets"
                onClick={() => setIsTicketsModalOpen(true)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-h-11 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                  attachments.length > 0 || ticketUrl.trim()
                    ? 'flight-action-present'
                    : 'flight-action-empty'
                }`}
              >
                <span aria-hidden="true">🎟️</span>
                <span>Biglietti{attachments.length > 0 || ticketUrl.trim() ? ' · ✓' : ''}</span>
              </button>
            </div>

            {/* 10. Note Copilota (collassate di default, contenuto preservato) */}
            <div className="flight-section flight-section-notes" data-testid="transport-notes">
              <button
                type="button"
                data-testid="toggle-transport-notes"
                aria-expanded={isFlightNotesOpen}
                aria-controls="transport-notes-content"
                className="flight-notes-toggle w-full text-left cursor-pointer"
                onClick={() => setIsFlightNotesOpen((prev) => !prev)}
              >
                <span className="flight-section-title"><MessageSquare aria-hidden="true" className="flight-section-icon" /> Note Copilota</span>
                <span className="flight-notes-status">{noteCopilota.trim() ? 'Presenti' : 'Nessuna nota'}</span>
                {isFlightNotesOpen ? <ChevronUp aria-hidden="true" className="w-4 h-4 shrink-0" /> : <ChevronDown aria-hidden="true" className="w-4 h-4 shrink-0" />}
              </button>
              <div id="transport-notes-content" hidden={!isFlightNotesOpen}>
                {isFlightNotesOpen && (
                  <FlightAdaptiveText
                    aria-label="Note Copilota"
                    placeholder="Istruzioni operative, indicazioni di viaggio..."
                    value={noteCopilota}
                    onChange={(e) => setNoteCopilota(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F] resize-none"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Azioni finali */}
        <FormActionButtons
          isEditing={Boolean(initialData)}
          submitLabel={initialData ? 'Aggiorna' : 'Crea Trasporto'}
          itemName={carrier.trim() || (departureLocation && arrivalLocation ? `${departureLocation} → ${arrivalLocation}` : '') || initialData?.carrier || 'questo trasporto'}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </form>

      {/* Modali operativi condivisi con il fronte */}
      {isPnrModalOpen && (
        <Modal
          isOpen={isPnrModalOpen}
          onClose={() => setIsPnrModalOpen(false)}
          title={isFlight ? "Codice Prenotazione (PNR)" : cfg.bookingCodeLabel}
          centered
        >
          <div className="space-y-3">
            <div>
              <label className={labelClass}>{isFlight ? "Codice PNR / Riferimento" : cfg.bookingCodeLabel}</label>
              <textarea
                rows={5}
                aria-label={isFlight ? "Codice PNR / Riferimento" : cfg.bookingCodeLabel}
                data-testid="pnr-modal-input"
                placeholder="es. ABC123"
                value={bookingCode}
                onChange={(e) => setBookingCode(e.target.value)}
                className={`${inputClass} h-auto py-2 resize-y whitespace-pre-wrap break-words font-mono`}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              {bookingCode.trim() && (
                <button
                  type="button"
                  onClick={handleCopyPnr}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  {pnrCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{pnrCopied ? 'Copiato!' : 'Copia'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsPnrModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
              >
                Fatto
              </button>
            </div>
          </div>
        </Modal>
      )}

      {draftTransport ? (
        <TrasportoBagagliModal
          isOpen={isBagagliModalOpen}
          onClose={() => setIsBagagliModalOpen(false)}
          transport={draftTransport}
          onUpdateTransport={(updated) => setBagagli(updated.bagagli || '')}
        />
      ) : (
        isBagagliModalOpen && (
          <Modal
            isOpen={isBagagliModalOpen}
            onClose={() => setIsBagagliModalOpen(false)}
            title="Bagagli inclusi"
            centered
          >
            <div className="space-y-3">
              <input
                type="text"
                placeholder="es. 2x23kg stiva + 8kg mano"
                value={bagagli}
                onChange={(e) => setBagagli(e.target.value)}
                className={inputClass}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsBagagliModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white cursor-pointer"
                >
                  Fatto
                </button>
              </div>
            </div>
          </Modal>
        )
      )}

      {draftTransport ? (
        <TrasportoTicketsModal
          isOpen={isTicketsModalOpen}
          onClose={() => setIsTicketsModalOpen(false)}
          transport={draftTransport}
          onUpdateTransport={(updated) => {
            setAttachments(updated.attachments || []);
            if (updated.ticketUrl !== undefined) setTicketUrl(updated.ticketUrl || '');
          }}
        />
      ) : (
        isTicketsModalOpen && (
          <Modal
            isOpen={isTicketsModalOpen}
            onClose={() => setIsTicketsModalOpen(false)}
            title="Biglietti e Documenti"
            centered
          >
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Link Biglietto / Carta d'imbarco</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={ticketUrl}
                  onChange={(e) => setTicketUrl(e.target.value)}
                  className={inputClass}
                />
              </div>
              <p className="text-xs text-slate-500">
                Salva prima il trasporto per caricare file PDF o QR code offline.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsTicketsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white cursor-pointer"
                >
                  Fatto
                </button>
              </div>
            </div>
          </Modal>
        )
      )}
    </div>
  );
}
