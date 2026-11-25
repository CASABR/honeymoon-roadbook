import { formatDraftBalance } from '../../utils/budgetDisplay';
import CurrencyAmountInput from '../common/CurrencyAmountInput';
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';
import type { Trasporto, TipoTrasporto, StatoTrasporto } from '../../types';
import TimeZoneInput from '../common/TimeZoneInput';
import { DateTimePickerInput } from '../common/TimePickerInput';
import FormActionButtons from './FormActionButtons';
import { buildEurSavePatch } from '../../services/currencyService';
import { parseCostToNumber } from '../../utils/priceHelper';

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
    primaryFields: ['bookingCode', 'terminalGate', 'bagagli'],
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
    primaryFields: [],
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
  const [checkinCutoff, setCheckinCutoff] = useState('');
  const [veicolo, setVeicolo] = useState('');
  const [assicurazione, setAssicurazione] = useState('');
  const [cauzione, setCauzione] = useState('');
  const [hasLayover, setHasLayover] = useState(false);
  const [layoverAirport, setLayoverAirport] = useState('');
  const [layoverDuration, setLayoverDuration] = useState('');

  // Economico
  const [cost, setCost] = useState('');
  const [depositPaid, setDepositPaid] = useState('');
  const [isSaldato, setIsSaldato] = useState(false);
  const [packageIncluded, setPackageIncluded] = useState(false);

  // Documenti & Note
  const [ticketUrl, setTicketUrl] = useState('');
  const [noteCopilota, setNoteCopilota] = useState('');
  const [copilota, setCopilota] = useState(false);

  // Sezioni espandibili (per ridurre altezza retro)
  const [isTimeZoneOpen, setIsTimeZoneOpen] = useState(false);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [isFinanceOpen, setIsFinanceOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  const [error, setError] = useState('');

  const cfg = SUBCATEGORY_MAP[type] || SUBCATEGORY_MAP.volo;
  const isRental = type === 'auto' || type === 'camper';
  const isFlight = type === 'volo';

  const formatForInput = (d?: string, t?: string) => {
    if (!d) return '';
    return t ? `${d}T${t}` : `${d}T00:00`;
  };

  const initializedIdRef = useRef<string | null | undefined>(undefined);

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
      setCheckinCutoff(initialData.checkinCutoff || '');
      setVeicolo(initialData.veicolo || '');
      setAssicurazione(initialData.assicurazione || '');
      setCauzione(initialData.cauzione || '');

      const hasExistingLayover = Boolean(initialData.layover?.airport);
      setHasLayover(hasExistingLayover);
      setLayoverAirport(initialData.layover?.airport || '');
      setLayoverDuration(initialData.layover?.duration || '');

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
      const existingNotes = [initialData.noteCopilota, (initialData as any).notes, (initialData as any).nota]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join('\n\n');
      setNoteCopilota(existingNotes);
      setCopilota(Boolean(existingNotes.trim()) || initialData.copilota || false);

      setIsTimeZoneOpen(Boolean(initialData.departureTimeZone?.trim() || initialData.dropoffTimeZone?.trim()));
      setIsFinanceOpen(false);
      setIsDocsOpen(Boolean(tUrl.trim() || existingNotes.trim()));
      setIsSecondaryOpen(false);
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
      setCheckinCutoff('');
      setVeicolo('');
      setAssicurazione('');
      setCauzione('');
      setHasLayover(false);
      setLayoverAirport('');
      setLayoverDuration('');
      setCost('');
      setPackageIncluded(false);
      setDepositPaid('');
      setIsSaldato(false);
      setTicketUrl('');
      setNoteCopilota('');
      setCopilota(false);
      setIsTimeZoneOpen(false);
      setIsFinanceOpen(false);
      setIsDocsOpen(false);
      setIsSecondaryOpen(false);
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
      hasLayover && layoverAirport.trim()
        ? {
            ...(initialData?.layover || {}),
            airport: layoverAirport.trim(),
            duration: layoverDuration.trim() || undefined,
          }
        : undefined;

    const baseData = {
      id: initialData?.id,
      type,
      carrier: carrier.trim() || undefined,
      bookingCode: bookingCode.trim() || undefined,

      date: parsedDepDate,
      departureTime: parsedDepTime || undefined,
      departureTimeZone: departureTimeZone.trim() || undefined,
      departureLocation: departureLocation.trim(),
      departureIata: departureIata.trim() || undefined,
      arrivalIata: arrivalIata.trim() || undefined,

      ...normMeta,
      cost: packageIncluded ? 'Incluso nel pacchetto' : (normCost ?? (cost.trim() || undefined)),
      packageIncluded,
      depositPaid: packageIncluded ? '0' : (normDep ?? (depositPaid.trim() || undefined)),
      acconto: packageIncluded ? '0' : (normAcc ?? (depositPaid.trim() || undefined)),

      ticketUrl: ticketUrl.trim() || undefined,
      noteCopilota: noteCopilota.trim() || undefined,
      notes: noteCopilota.trim() || undefined,
      terminalGate: terminalGate.trim() || undefined,
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
        dropoffTimeZone: dropoffTimeZone.trim() || undefined,
      });
    } else {
      onSave({
        ...baseData,
        arrivalLocation: arrivalLocation.trim() || departureLocation.trim(),
        arrivalDate: parsedArrDate || parsedDepDate || undefined,
        arrivalTime: parsedArrTime || undefined,
        dropoffTimeZone: dropoffTimeZone.trim() || undefined,
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

  const secondaryFields: OperationalFieldKey[] = (
    ['bookingCode', 'terminalGate', 'checkinCutoff', 'posti', 'bagagli', 'veicolo', 'assicurazione', 'cauzione', 'layover'] as OperationalFieldKey[]
  ).filter((f) => !isVisibleField(f));

  const financeSummary = packageIncluded
    ? 'Incluso nel pacchetto'
    : cost.trim()
      ? `${cost.trim()} · ${isSaldato ? 'Saldato' : 'Da saldare'}`
      : 'Non impostato';

  const docsSummaryParts: string[] = [];
  if (ticketUrl.trim()) docsSummaryParts.push('Link allegato');
  if (noteCopilota.trim()) docsSummaryParts.push('Note presenti');
  const docsSummary = docsSummaryParts.length > 0 ? docsSummaryParts.join(' · ') : 'Facoltativo';

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

  const visibleGridFields: OperationalFieldKey[] = (
    ['terminalGate', 'checkinCutoff', 'posti', 'bagagli', 'veicolo', 'assicurazione', 'cauzione', 'layover'] as OperationalFieldKey[]
  ).filter((f) => isVisibleField(f));

  const showIataFields = isFlight || Boolean(departureIata.trim() || arrivalIata.trim());

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

        {/* 1. Sottocategoria */}
        <div>
          <label className={labelClass}>Sottocategoria</label>
          <div className="flex flex-wrap gap-1.5">
            {SUBCATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                data-testid={`transport-subcategory-${cat.id}`}
                onClick={() => setType(cat.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                  type === cat.id
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat.pillLabel}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Identità del mezzo (Compagnia + Codice se primario o compilato) */}
        <div className={`grid grid-cols-1 ${isVisibleField('bookingCode') ? 'sm:grid-cols-2' : ''} gap-2.5`}>
          <div data-testid="field-carrier">
            <label className={labelClass}>{cfg.carrierLabel}</label>
            <input
              type="text"
              placeholder={cfg.carrierPlaceholder}
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className={inputClass}
            />
          </div>
          {isVisibleField('bookingCode') && renderOperationalField('bookingCode')}
        </div>

        {/* 3. Partenza / Ritiro & Arrivo / Riconsegna */}
        <div className="grid grid-cols-1 gap-2.5">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
              {cfg.departureLabel}
            </label>
            <div className={`grid grid-cols-1 ${showIataFields ? 'sm:grid-cols-12' : ''} gap-2`}>
              <div className={showIataFields ? 'sm:col-span-8' : ''}>
                <input
                  type="text"
                  placeholder={cfg.departurePlaceholder}
                  value={departureLocation}
                  onChange={(e) => setDepartureLocation(e.target.value)}
                  className={whiteInputClass}
                  required
                />
              </div>
              {showIataFields && (
                <div className="sm:col-span-4" data-testid="field-departureIata">
                  <input
                    type="text"
                    placeholder="IATA (es. FCO)"
                    value={departureIata}
                    onChange={(e) => setDepartureIata(e.target.value)}
                    className={whiteInputClass}
                  />
                </div>
              )}
            </div>
            <DateTimePickerInput
              value={departureDate}
              onChange={setDepartureDate}
              required
              dateLabel={isRental ? 'Data ritiro' : 'Data partenza'}
              timeLabel={isRental ? 'Orario ritiro' : 'Orario partenza'}
            />
          </div>

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
              {cfg.arrivalLabel}
            </label>
            <div className={`grid grid-cols-1 ${showIataFields ? 'sm:grid-cols-12' : ''} gap-2`}>
              <div className={showIataFields ? 'sm:col-span-8' : ''}>
                <input
                  type="text"
                  placeholder={cfg.arrivalPlaceholder}
                  value={arrivalLocation}
                  onChange={(e) => setArrivalLocation(e.target.value)}
                  className={whiteInputClass}
                />
              </div>
              {showIataFields && (
                <div className="sm:col-span-4" data-testid="field-arrivalIata">
                  <input
                    type="text"
                    placeholder="IATA (es. AKL)"
                    value={arrivalIata}
                    onChange={(e) => setArrivalIata(e.target.value)}
                    className={whiteInputClass}
                  />
                </div>
              )}
            </div>
            <DateTimePickerInput
              value={arrivalDate}
              onChange={setArrivalDate}
              dateLabel={isRental ? 'Data riconsegna' : 'Data arrivo'}
              timeLabel={isRental ? 'Orario riconsegna' : 'Orario arrivo'}
            />
          </div>
        </div>

        {/* 4. Campi Operativi Pertinenti (e campi già compilati anche se atipici) */}
        {visibleGridFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-testid="transport-primary-fields">
            {visibleGridFields.map((field) => renderOperationalField(field))}
          </div>
        )}

        {/* 5. Sezione espandibile: Dettagli secondari & Fusi orari */}
        <div className="border border-slate-200 rounded-2xl bg-slate-50/70 overflow-hidden">
          <button
            type="button"
            data-testid="toggle-secondary-details"
            onClick={() => setIsSecondaryOpen((prev) => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-100/80 transition-colors"
          >
            <div>
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                Dettagli secondari & Fusi orari
              </span>
              <span className="block text-[11px] text-slate-500">
                {departureTimeZone || dropoffTimeZone
                  ? `Fuso: ${departureTimeZone || dropoffTimeZone}`
                  : secondaryFields.length > 0
                    ? `${secondaryFields.length} campi facoltativi disponibili`
                    : 'Fusi orari e opzioni avanzate'}
              </span>
            </div>
            {isSecondaryOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>

          {(isSecondaryOpen || isTimeZoneOpen) && (
            <div className="px-3 pb-3 pt-2 border-t border-slate-200/80 space-y-2.5 bg-white">
              {secondaryFields.length > 0 && isSecondaryOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {secondaryFields.map((field) => renderOperationalField(field))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <TimeZoneInput
                  value={departureTimeZone}
                  onChange={setDepartureTimeZone}
                  label={isRental ? 'Fuso orario ritiro' : 'Fuso orario partenza'}
                />
                {(isRental || Boolean(dropoffTimeZone.trim())) && (
                  <TimeZoneInput
                    value={dropoffTimeZone}
                    onChange={setDropoffTimeZone}
                    label="Fuso orario riconsegna"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* 6. Sezione espandibile: Quadro Economico */}
        <div className="border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden">
          <button
            type="button"
            data-testid="toggle-finance-details"
            onClick={() => setIsFinanceOpen((prev) => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-100/80 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider shrink-0">
                Quadro Economico
              </span>
              <span className="text-xs font-semibold text-slate-600 truncate">
                · {financeSummary}
              </span>
            </div>
            {isFinanceOpen ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
          </button>

          {isFinanceOpen && (
            <div className="p-3 border-t border-slate-200 space-y-2.5">
              <div className="flex justify-end">
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
                      <label className={labelClass}>Costo totale</label>
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

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
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
                <div className="p-2.5 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800 font-medium">
                  ℹ️ Servizio coperto dal pacchetto di viaggio. Non genera costi autonomi nel bilancio.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 7. Sezione espandibile: Documenti, Link & Note Copilota */}
        <div className="border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden">
          <button
            type="button"
            data-testid="toggle-docs-notes"
            onClick={() => setIsDocsOpen((prev) => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-100/80 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider shrink-0">
                Biglietto & Note Copilota
              </span>
              <span className="text-xs text-slate-500 truncate">· {docsSummary}</span>
            </div>
            {isDocsOpen ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
          </button>

          {isDocsOpen && (
            <div className="p-3 border-t border-slate-200 space-y-2.5 bg-white">
              <div>
                <label className={labelClass}>Link Biglietto / Voucher / Carta d'imbarco</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={ticketUrl}
                  onChange={(e) => setTicketUrl(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Note Copilota (Istruzioni Operative)</label>
                <textarea
                  rows={2}
                  placeholder="..."
                  value={noteCopilota}
                  onChange={(e) => setNoteCopilota(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F] resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Azioni finali */}
        <FormActionButtons
          isEditing={Boolean(initialData)}
          submitLabel={initialData ? 'Aggiorna' : 'Crea Trasporto'}
          itemName={carrier.trim() || (departureLocation && arrivalLocation ? `${departureLocation} → ${arrivalLocation}` : '') || initialData?.carrier || 'questo trasporto'}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </form>
    </div>
  );
}
