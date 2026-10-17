import { storageService, notifyDataChanged } from '../storage/storageService';
import type {
  Trasporto,
  Alloggio,
  Attivita,
  Ristorante,
  Shopping,
  TravelDocument,
  TransportAttachment
} from '../types';
import { parseEuro, resolvePaymentInfo } from '../utils/priceHelper';

export type BookingCategory = 'volo' | 'treno' | 'alloggio' | 'auto_camper' | 'traghetto' | 'attivita' | 'ristorante' | 'shopping' | 'documento';

export interface UnifiedBookingItem {
  id: string;
  category: BookingCategory;
  title: string;
  subtitle?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  endDate?: string; // YYYY-MM-DD (check-out, arrival, dropoff)
  endTime?: string; // HH:mm
  location?: string;
  locationDetails?: string;
  bookingCode?: string;
  cost?: number;
  costFormatted?: string;
  isPaid?: boolean;
  paidAmount?: number;
  status?: string;
  notes?: string;
  noteCopilota?: string;
  hasAttachments: boolean;
  attachmentsCount: number;
  attachments?: TransportAttachment[];
  carrierOrProvider?: string;
  rawType: 'trasporto' | 'alloggio' | 'attivita' | 'ristorante' | 'shopping' | 'documento';
  rawItem: any;
  updatedAt?: number | string;
}

export const BOOKING_CATEGORY_META: Record<BookingCategory, {
  label: string;
  icon: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}> = {
  volo: {
    label: 'Voli & Aerei',
    icon: '✈️',
    badgeBg: 'bg-sky-50 dark:bg-sky-950/40',
    badgeText: 'text-sky-700 dark:text-sky-300',
    badgeBorder: 'border-sky-200 dark:border-sky-800/40'
  },
  treno: {
    label: 'Treni',
    icon: '🚆',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'border-blue-200 dark:border-blue-800/40'
  },
  alloggio: {
    label: 'Hotel & Alloggi',
    icon: '🏨',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    badgeBorder: 'border-indigo-200 dark:border-indigo-800/40'
  },
  auto_camper: {
    label: 'Auto & Camper',
    icon: '🚗',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'border-emerald-200 dark:border-emerald-800/40'
  },
  traghetto: {
    label: 'Traghetti & Navi',
    icon: '⛴️',
    badgeBg: 'bg-cyan-50 dark:bg-cyan-950/40',
    badgeText: 'text-cyan-700 dark:text-cyan-300',
    badgeBorder: 'border-cyan-200 dark:border-cyan-800/40'
  },
  attivita: {
    label: 'Tour & Attività',
    icon: '🎟️',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'border-amber-200 dark:border-amber-800/40'
  },
  ristorante: {
    label: 'Ristoranti & Tavoli',
    icon: '🍽️',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/40',
    badgeText: 'text-rose-700 dark:text-rose-300',
    badgeBorder: 'border-rose-200 dark:border-rose-800/40'
  },
  shopping: {
    label: 'Shopping & Acquisti',
    icon: '🛍️',
    badgeBg: 'bg-pink-50 dark:bg-pink-950/40',
    badgeText: 'text-pink-700 dark:text-pink-300',
    badgeBorder: 'border-pink-200 dark:border-pink-800/40'
  },
  documento: {
    label: 'Passaporti & Visti',
    icon: '🛂',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/40',
    badgeText: 'text-purple-700 dark:text-purple-300',
    badgeBorder: 'border-purple-200 dark:border-purple-800/40'
  }
};

/**
 * Legge tutte le collezioni del viaggio e restituisce un elenco unificato di prenotazioni.
 */
export async function getAllUnifiedBookings(): Promise<UnifiedBookingItem[]> {
  const [transports, accommodations, activities, restaurants, shoppingItems, travelDocuments] = await Promise.all([
    storageService.getTransports().catch(() => [] as Trasporto[]),
    storageService.getAccommodations().catch(() => [] as Alloggio[]),
    storageService.getActivities().catch(() => [] as Attivita[]),
    storageService.getRistoranti ? storageService.getRistoranti().catch(() => [] as Ristorante[]) : Promise.resolve([] as Ristorante[]),
    (storageService as any).getShoppingItems ? (storageService as any).getShoppingItems().catch(() => [] as Shopping[]) : Promise.resolve([] as Shopping[]),
    storageService.getDocuments().catch(() => [] as TravelDocument[])
  ]);

  const items: UnifiedBookingItem[] = [];

  // 1. TRASPORTI
  transports.forEach((t) => {
    let category: BookingCategory = 'volo';
    if (t.type === 'treno') category = 'treno';
    else if (t.type === 'traghetto') category = 'traghetto';
    else if (t.type === 'auto' || t.type === 'camper') category = 'auto_camper';
    else if (t.type === 'transfer') category = 'volo';

    const paymentInfo = resolvePaymentInfo({
      cost: t.cost,
      depositPaid: t.depositPaid || t.acconto || t.amountPaid,
      paymentStatus: t.paymentStatus,
      status: t.status,
      completed: t.completed,
      packageIncluded: t.packageIncluded
    });

    const costNum = paymentInfo.costNum;
    const paidNum = paymentInfo.paidNum;
    const isPaid = paymentInfo.isPaid || (costNum > 0 && paidNum >= costNum);

    const attachments = t.attachments || [];

    items.push({
      id: t.id,
      category,
      title: t.carrier || `${t.departureLocation} → ${t.arrivalLocation}`,
      subtitle: `${t.departureLocation} → ${t.arrivalLocation}`,
      date: t.date,
      time: t.departureTime,
      endDate: t.arrivalDate || t.dropoffDate,
      endTime: t.arrivalTime || t.dropoffTime,
      location: `${t.departureLocation} → ${t.arrivalLocation}`,
      locationDetails: t.departureIata || t.arrivalIata ? `${t.departureIata || ''} → ${t.arrivalIata || ''}` : undefined,
      bookingCode: t.bookingCode,
      cost: costNum,
      costFormatted: paymentInfo.displayText || t.cost,
      isPaid,
      paidAmount: paidNum,
      status: t.status,
      notes: t.posti || t.bagagli ? `Posti: ${t.posti || '-'} • Bagagli: ${t.bagagli || '-'}` : undefined,
      noteCopilota: t.noteCopilota,
      hasAttachments: attachments.length > 0,
      attachmentsCount: attachments.length,
      attachments,
      carrierOrProvider: t.carrier,
      rawType: 'trasporto',
      rawItem: t,
      updatedAt: t.updatedAt
    });
  });

  // 2. ALLOGGI
  accommodations.forEach((a) => {
    const paymentInfo = resolvePaymentInfo({
      cost: a.cost,
      depositPaid: a.depositPaid || a.acconto,
      paymentStatus: a.paymentStatus,
      status: a.status,
      completed: a.completed
    });

    const costNum = paymentInfo.costNum;
    const paidNum = paymentInfo.paidNum;
    const isPaid = paymentInfo.isPaid || (costNum > 0 && paidNum >= costNum);
    const attachments = a.attachments || [];

    items.push({
      id: a.id,
      category: 'alloggio',
      title: a.name,
      subtitle: a.sottocategoria || 'Struttura ricettiva',
      date: a.checkIn,
      time: a.checkInTime ? `In: ${a.checkInTime}` : undefined,
      endDate: a.checkOut,
      endTime: a.checkOutTime ? `Out: ${a.checkOutTime}` : undefined,
      location: a.location || a.address,
      locationDetails: a.address,
      bookingCode: a.bookingCode || a.pinCode,
      cost: costNum,
      costFormatted: paymentInfo.displayText || a.cost,
      isPaid,
      paidAmount: paidNum,
      status: a.status,
      notes: a.notes || (a.phone ? `Tel: ${a.phone}` : undefined),
      noteCopilota: a.noteCopilota,
      hasAttachments: attachments.length > 0,
      attachmentsCount: attachments.length,
      attachments,
      carrierOrProvider: a.name,
      rawType: 'alloggio',
      rawItem: a,
      updatedAt: a.updatedAt
    });
  });

  // 3. ATTIVITÀ
  activities.forEach((act) => {
    const paymentInfo = resolvePaymentInfo({
      cost: act.cost,
      depositPaid: act.acconto,
      paymentStatus: act.paymentStatus,
      status: act.status,
      completed: act.completed
    });

    const costNum = paymentInfo.costNum;
    const paidNum = paymentInfo.paidNum;
    const isPaid = paymentInfo.isPaid || (costNum > 0 && paidNum >= costNum);
    const attachments = act.attachments || [];

    items.push({
      id: act.id,
      category: 'attivita',
      title: act.title,
      subtitle: act.sottocategoria || act.category,
      date: act.date,
      time: act.time || act.orarioInizio,
      location: act.location || act.address,
      locationDetails: act.address,
      bookingCode: act.qrCode,
      cost: costNum,
      costFormatted: paymentInfo.displayText || act.cost,
      isPaid,
      paidAmount: paidNum,
      status: act.status,
      notes: act.notes,
      noteCopilota: act.noteCopilota,
      hasAttachments: attachments.length > 0,
      attachmentsCount: attachments.length,
      attachments,
      carrierOrProvider: act.platform || act.title,
      rawType: 'attivita',
      rawItem: act,
      updatedAt: act.updatedAt
    });
  });

  // 4. RISTORANTI (solo se hanno orario, data o prenotazione esplicita)
  restaurants.forEach((r) => {
    const costNum = parseEuro(r.budget);
    const attachments = r.attachments || [];

    items.push({
      id: r.id,
      category: 'ristorante',
      title: r.nome,
      subtitle: r.sottocategoria ? `Ristorante (${r.sottocategoria})` : 'Ristorante',
      date: r.data || r.date,
      time: r.orario,
      location: r.indirizzo,
      locationDetails: r.telefono ? `Tel: ${r.telefono}` : undefined,
      cost: costNum,
      costFormatted: r.budget,
      isPaid: r.status === 'saldato',
      status: r.status || 'prenotato',
      notes: r.nota,
      noteCopilota: r.noteCopilota,
      hasAttachments: attachments.length > 0,
      attachmentsCount: attachments.length,
      attachments,
      carrierOrProvider: r.nome,
      rawType: 'ristorante',
      rawItem: r,
      updatedAt: r.updatedAt
    });
  });

  // 5. SHOPPING & ACQUISTI PROGRAMMATI
  shoppingItems.forEach((s: Shopping) => {
    const costNum = parseEuro(s.budget || s.cost);
    const paidNum = parseEuro(s.depositPaid || s.acconto || s.amountPaid);
    const isPaid = s.paymentStatus === 'saldato' || (costNum > 0 && paidNum >= costNum);
    const attachments = s.attachments || [];

    items.push({
      id: s.id,
      category: 'shopping',
      title: s.nome,
      subtitle: s.sottocategoria ? `Acquisto (${s.sottocategoria})` : 'Shopping programmato',
      date: s.data || s.date,
      time: s.orario,
      location: s.indirizzo,
      cost: costNum,
      costFormatted: s.budget || s.cost,
      isPaid,
      paidAmount: paidNum,
      status: s.paymentStatus || 'da_saldare',
      notes: s.nota,
      noteCopilota: s.noteCopilota,
      hasAttachments: attachments.length > 0,
      attachmentsCount: attachments.length,
      attachments,
      carrierOrProvider: s.nome,
      rawType: 'shopping',
      rawItem: s,
      updatedAt: s.updatedAt
    });
  });

  // 6. DOCUMENTI DI VIAGGIO (Passaporti, Visti, Polizze con allegati)
  travelDocuments.forEach((d) => {
    const attachments = d.attachments || [];
    items.push({
      id: d.id,
      category: 'documento',
      title: d.title,
      subtitle: `Documento (${d.category})`,
      date: d.validity || (d.updatedAt ? d.updatedAt.split('T')[0] : undefined),
      location: d.category,
      locationDetails: d.expiresAt ? `Scadenza: ${d.expiresAt}` : undefined,
      status: d.status || 'Valido',
      notes: d.description,
      hasAttachments: attachments.length > 0,
      attachmentsCount: attachments.length,
      attachments,
      carrierOrProvider: d.title,
      rawType: 'documento',
      rawItem: d,
      updatedAt: d.updatedAt
    });
  });

  // Deduplicazione deterministica per ID
  const mapById = new Map<string, UnifiedBookingItem>();
  for (const item of items) {
    if (item.id) {
      mapById.set(item.id, item);
    }
  }

  const result = Array.from(mapById.values());

  // Ordinamento cronologico per data e orario (le date vuote vanno in coda)
  result.sort((a, b) => {
    if (!a.date && !b.date) return (a.title || '').localeCompare(b.title || '');
    if (!a.date) return 1;
    if (!b.date) return -1;
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    const timeA = a.time || '00:00';
    const timeB = b.time || '00:00';
    return timeA.localeCompare(timeB);
  });

  return result;
}

/**
 * Salva gli allegati aggiornati sulla prenotazione corretta (qualsiasi sia l'entità).
 */
export async function updateBookingAttachments(
  booking: UnifiedBookingItem,
  newAttachments: TransportAttachment[]
): Promise<void> {
  const raw = booking.rawItem;
  const updated = {
    ...raw,
    attachments: newAttachments,
    updatedAt: Date.now()
  };

  switch (booking.rawType) {
    case 'trasporto':
      await storageService.saveTransport(updated);
      notifyDataChanged('trasporti', 'save', updated);
      break;
    case 'alloggio':
      await storageService.saveAccommodation(updated);
      notifyDataChanged('alloggi', 'save', updated);
      break;
    case 'attivita':
      await storageService.saveActivity(updated);
      notifyDataChanged('attivita', 'save', updated);
      break;
    case 'ristorante':
      await storageService.saveRistorante(updated);
      notifyDataChanged('ristoranti', 'save', updated);
      break;
    case 'shopping':
      await storageService.saveShopping(updated);
      notifyDataChanged('shopping', 'save', updated);
      break;
    case 'documento':
      await storageService.saveDocument(updated);
      notifyDataChanged('documenti', 'save', updated);
      break;
  }

  window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
    detail: { entityType: booking.rawType, action: 'save', data: updated }
  }));
}

/**
 * Elimina la prenotazione dalla sua tabella e notifica il cloud.
 */
export async function deleteBookingItem(booking: UnifiedBookingItem): Promise<void> {
  switch (booking.rawType) {
    case 'trasporto':
      await storageService.deleteTransport(booking.id);
      notifyDataChanged('trasporti', 'delete', { id: booking.id });
      break;
    case 'alloggio':
      await storageService.deleteAccommodation(booking.id);
      notifyDataChanged('alloggi', 'delete', { id: booking.id });
      break;
    case 'attivita':
      await storageService.deleteActivity(booking.id);
      notifyDataChanged('attivita', 'delete', { id: booking.id });
      break;
    case 'ristorante':
      await storageService.deleteRistorante(booking.id);
      notifyDataChanged('ristoranti', 'delete', { id: booking.id });
      break;
    case 'shopping':
      await storageService.deleteShopping(booking.id);
      notifyDataChanged('shopping', 'delete', { id: booking.id });
      break;
    case 'documento':
      await storageService.deleteDocument(booking.id);
      notifyDataChanged('documenti', 'delete', { id: booking.id });
      break;
  }

  window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
    detail: { entityType: booking.rawType, action: 'delete', data: { id: booking.id } }
  }));
}
