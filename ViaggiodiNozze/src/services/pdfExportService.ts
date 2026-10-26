/**
 * pdfExportService.ts
 * Servizio client-side per la generazione e l'esportazione PDF del Roadbook di viaggio HOUNIGO.
 * 
 * Requisiti:
 * 1. 100% Client-side e funzionante offline (zero Cloud Functions o server esterni).
 * 2. Caricamento dinamico di jsPDF per non appesantire il bundle iniziale della PWA.
 * 3. Struttura A4 verticale professionale secondo la brand identity Instagram:
 *    - Navy: #172033
 *    - Coral: #FF6B5F
 *    - Cloud: #F8F7F3
 * 4. Fedele ai dati salvati in locale su IndexedDB con rispetto della priorità orari del recente hotfix.
 * 5. Protezione assoluta dei dati sensibili (nessun passaporto, password, token o link privato).
 * 6. Supporto specifico per iOS Safari e PWA con fallback di download e condivisione nativa.
 */

import { storageService } from '../storage/storageService';
import { getTripConfig } from '../utils/tripConfig';
import { formatDateIT } from '../utils/tripDates';
import type { Attivita, Trasporto, Tappa, Alloggio, Ristorante, Shopping, NotaViaggio, Spesa } from '../types';

export interface PdfExportOptions {
  // Contenuti
  includeTappe: boolean;
  includeActivities: boolean;
  includeTransports: boolean;
  includeAccommodations: boolean;
  includeBookingRefs: boolean; // Riferimenti non-sensibili (es. PNR, codice conferma)
  includeNotes: boolean;       // Note di viaggio personali
  includeSpese: boolean;       // Spese e budget previsti

  // Periodo
  periodType: 'all' | 'range' | 'single';
  startDate?: string;
  endDate?: string;
  singleDate?: string;

  // Livello di dettaglio
  detailLevel: 'compact' | 'detailed';
}

export interface PdfDayGroup {
  date: string;
  dayNum: number;
  tappaTitle?: string;
  accommodation?: Alloggio | null;
  timedEvents: PdfEventItem[];
  untimedEvents: PdfEventItem[];
  notes: string[];
  spese: Spesa[];
}

export interface PdfEventItem {
  id: string;
  type: 'attivita' | 'trasporto' | 'tappa' | 'ristorante' | 'shopping';
  time: string; // HH:mm se presente, altrimenti stringa vuota
  title: string;
  categoryOrType: string;
  location?: string;
  address?: string;
  departureLocation?: string;
  arrivalLocation?: string;
  bookingRef?: string;
  note?: string;
}

/**
 * Pulisce il testo da caratteri speciali o emoji che potrebbero generare
 * caratteri errati (tofu/quadrati) con i font standard di jsPDF.
 */
export function sanitizePdfText(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/[—–]/g, '-')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[•·]/g, '*')
    .replace(/[➔➜➝→]/g, '->')
    .replace(/[📍📌🧭🗺️⏰📅✈️🏨🍽️🛍️💍✨⏳🎉👑🤝💡🔒]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcola l'orario effettivo di una entità rispettando rigorosamente
 * la normalizzazione del recente hotfix HOUNIGO.
 */
function extractEventTime(item: any, type: string): string {
  if (!item) return '';
  let raw = '';
  if (type === 'attivita') {
    raw = item.time || item.orarioInizio || item.orario || item.orarioRitrovo || '';
  } else if (type === 'tappa') {
    raw = item.orario || item.time || '';
  } else if (type === 'trasporto') {
    raw = item.departureTime || item.time || item.orario || '';
  } else if (type === 'alloggio') {
    raw = item.checkInTime || item.time || '';
  } else if (type === 'ristorante' || type === 'shopping') {
    raw = item.orario || item.time || '';
  }
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Recupera e organizza tutti i dati del roadbook pronti per la generazione PDF.
 */
export async function preparePdfData(options: PdfExportOptions): Promise<{
  tripTitle: string;
  tripDates: string;
  destinationsSummary: string;
  days: PdfDayGroup[];
  totalEventsCount: number;
  hasUnsyncedChanges: boolean;
}> {
  const config = getTripConfig();
  const tripTitle = config?.title || 'Il nostro Viaggio';
  const tripDates = config?.startDate && config?.endDate
    ? `${formatDateIT(config.startDate)} - ${formatDateIT(config.endDate)}`
    : 'Roadbook di Viaggio';

  // Lettura dati locali persistenti (offline-first da IndexedDB)
  const [
    allActivities,
    allTransports,
    allAccommodations,
    allTappe,
    allRistoranti,
    allShopping,
    allNotes,
    allSpese
  ] = await Promise.all([
    storageService.getActivities().catch(() => [] as Attivita[]),
    storageService.getTransports().catch(() => [] as Trasporto[]),
    storageService.getAccommodations().catch(() => [] as Alloggio[]),
    storageService.getTappe().catch(() => [] as Tappa[]),
    storageService.getRistoranti().catch(() => [] as Ristorante[]),
    storageService.getShopping().catch(() => [] as Shopping[]),
    options.includeNotes ? storageService.getNote().catch(() => [] as NotaViaggio[]) : Promise.resolve([]),
    options.includeSpese ? storageService.getSpese().catch(() => [] as Spesa[]) : Promise.resolve([])
  ]);

  // Raccogli tutte le date uniche del viaggio
  const allDatesSet = new Set<string>();

  if (config?.startDate && config?.endDate) {
    const cur = new Date(config.startDate);
    const end = new Date(config.endDate);
    while (cur <= end) {
      allDatesSet.add(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Aggiungi date associate alle entità esistenti
  allActivities.forEach(a => { if (a.date) allDatesSet.add(a.date); });
  allTransports.forEach(t => { if (t.date) allDatesSet.add(t.date); });
  allAccommodations.forEach(a => {
    if (a.checkIn) allDatesSet.add(a.checkIn);
    if (a.checkOut) allDatesSet.add(a.checkOut);
  });
  allTappe.forEach(tp => {
    const d = tp.data || (tp as any).date;
    if (d) allDatesSet.add(d);
  });
  allRistoranti.forEach(r => {
    const d = r.data || (r as any).date;
    if (d) allDatesSet.add(d);
  });
  allShopping.forEach(s => {
    const d = s.data || (s as any).date;
    if (d) allDatesSet.add(d);
  });

  // Ordina le date cronologicamente
  let sortedDates = Array.from(allDatesSet).sort();

  // Filtro periodo
  if (options.periodType === 'single' && options.singleDate) {
    sortedDates = sortedDates.filter(d => d === options.singleDate);
  } else if (options.periodType === 'range' && options.startDate && options.endDate) {
    sortedDates = sortedDates.filter(d => d >= options.startDate! && d <= options.endDate!);
  }

  // Costruzione tappe e destinazioni uniche per il sommario di copertina
  const destinationsSet = new Set<string>();
  allTappe.forEach(t => {
    if (t.titolo) destinationsSet.add(sanitizePdfText(t.titolo));
  });
  allAccommodations.forEach(a => {
    if (a.location) destinationsSet.add(sanitizePdfText(a.location));
  });
  const destinationsSummary = Array.from(destinationsSet).slice(0, 8).join(', ');

  let totalEventsCount = 0;
  const days: PdfDayGroup[] = [];

  sortedDates.forEach((dateStr, index) => {
    const dayNum = index + 1;

    // Tappa principale del giorno
    const dayTappa = allTappe.find(t => (t.data === dateStr || (t as any).date === dateStr));
    const tappaTitle = dayTappa?.titolo ? sanitizePdfText(dayTappa.titolo) : undefined;

    // Alloggio associato a questa data (check-in o soggiorno in corso)
    const dayAcc = allAccommodations.find(a => {
      if (!a.checkIn) return false;
      if (a.checkIn === dateStr) return true;
      if (a.checkOut && dateStr > a.checkIn && dateStr < a.checkOut) return true;
      return false;
    });

    const dayEvents: PdfEventItem[] = [];

    // 1. Attività
    if (options.includeActivities) {
      allActivities
        .filter(a => a.date === dateStr)
        .forEach(a => {
          const t = extractEventTime(a, 'attivita');
          dayEvents.push({
            id: a.id,
            type: 'attivita',
            time: t,
            title: sanitizePdfText(a.title),
            categoryOrType: sanitizePdfText(a.category || 'Attività'),
            location: sanitizePdfText(a.location),
            address: sanitizePdfText(a.location),
            note: options.includeNotes ? sanitizePdfText((a as any).notes || (a as any).description) : undefined
          });
        });
    }

    // 2. Trasporti
    if (options.includeTransports) {
      allTransports
        .filter(t => t.date === dateStr)
        .forEach(t => {
          const time = extractEventTime(t, 'trasporto');
          const typeLabel = t.type ? (t.type.charAt(0).toUpperCase() + t.type.slice(1)) : 'Trasporto';
          const title = t.carrier
            ? `${typeLabel}: ${sanitizePdfText(t.carrier)}`
            : typeLabel;

          dayEvents.push({
            id: t.id,
            type: 'trasporto',
            time,
            title,
            categoryOrType: typeLabel,
            departureLocation: sanitizePdfText(t.departureLocation),
            arrivalLocation: sanitizePdfText(t.arrivalLocation || t.dropoffLocation),
            bookingRef: options.includeBookingRefs ? sanitizePdfText(t.bookingCode || (t as any).pnr || (t as any).ticketNumber) : undefined,
            note: options.includeNotes ? sanitizePdfText((t as any).notes) : undefined
          });
        });
    }

    // 3. Ristoranti
    if (options.includeActivities) {
      allRistoranti
        .filter(r => (r.data === dateStr || (r as any).date === dateStr))
        .forEach(r => {
          const time = extractEventTime(r, 'ristorante');
          dayEvents.push({
            id: r.id,
            type: 'ristorante',
            time,
            title: sanitizePdfText(r.nome),
            categoryOrType: 'Ristorante',
            location: sanitizePdfText(r.indirizzo || (r as any).citta),
            note: options.includeNotes ? sanitizePdfText(r.nota) : undefined
          });
        });
    }

    // 4. Shopping
    if (options.includeActivities) {
      allShopping
        .filter(s => (s.data === dateStr || (s as any).date === dateStr))
        .forEach(s => {
          const time = extractEventTime(s, 'shopping');
          dayEvents.push({
            id: s.id,
            type: 'shopping',
            time,
            title: sanitizePdfText(s.nome),
            categoryOrType: 'Shopping',
            location: sanitizePdfText(s.indirizzo),
            note: options.includeNotes ? sanitizePdfText(s.nota) : undefined
          });
        });
    }

    // Separa tra eventi con orario programmato ed eventi senza orario
    const timedEvents: PdfEventItem[] = [];
    const untimedEvents: PdfEventItem[] = [];

    dayEvents.forEach(item => {
      if (item.time && /^\d{1,2}:\d{2}/.test(item.time)) {
        timedEvents.push(item);
      } else {
        untimedEvents.push(item);
      }
    });

    // Ordina gli eventi con orario in ordine cronologico crescente
    timedEvents.sort((a, b) => a.time.localeCompare(b.time));

    // Note personali della giornata
    const dayNotes: string[] = [];
    if (options.includeNotes) {
      allNotes
        .filter(n => (n as any).data === dateStr || (n as any).date === dateStr)
        .forEach(n => {
          const txt = (n as any).testo || n.content || n.title;
          if (txt) dayNotes.push(sanitizePdfText(txt));
        });
    }

    // Spese della giornata
    const daySpese: Spesa[] = [];
    if (options.includeSpese) {
      allSpese
        .filter(s => s.date === dateStr || (s as any).data === dateStr)
        .forEach(s => daySpese.push(s));
    }

    totalEventsCount += timedEvents.length + untimedEvents.length;

    days.push({
      date: dateStr,
      dayNum,
      tappaTitle,
      accommodation: options.includeAccommodations ? dayAcc : null,
      timedEvents,
      untimedEvents,
      notes: dayNotes,
      spese: daySpese
    });
  });

  // Controllo stato modifiche locali / offline
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const hasUnsyncedChanges = !isOnline;

  return {
    tripTitle: sanitizePdfText(tripTitle),
    tripDates,
    destinationsSummary,
    days,
    totalEventsCount,
    hasUnsyncedChanges
  };
}

/**
 * Anteprima sintetica rapida senza dover generare il documento PDF completo.
 */
export async function getPdfPreviewStats(options: PdfExportOptions): Promise<{
  daysCount: number;
  totalEventsCount: number;
  estimatedPages: number;
  dateRangeStr: string;
}> {
  const prepared = await preparePdfData(options);
  const daysCount = prepared.days.length;
  const eventsCount = prepared.totalEventsCount;

  // Stima pagine: ~4 giorni compatti o ~2.5 giorni dettagliati per pagina A4
  const daysPerPage = options.detailLevel === 'detailed' ? 2.5 : 4.0;
  const estimatedPages = Math.max(1, Math.ceil(daysCount / daysPerPage));

  let dateRangeStr = prepared.tripDates;
  if (options.periodType === 'single' && options.singleDate) {
    dateRangeStr = formatDateIT(options.singleDate);
  } else if (options.periodType === 'range' && options.startDate && options.endDate) {
    dateRangeStr = `${formatDateIT(options.startDate)} - ${formatDateIT(options.endDate)}`;
  }

  return {
    daysCount,
    totalEventsCount: eventsCount,
    estimatedPages,
    dateRangeStr
  };
}

/**
 * Genera il file PDF del Roadbook e lo restituisce come Blob e URL.
 */
export async function generateRoadbookPdf(options: PdfExportOptions): Promise<{
  blob: Blob;
  fileName: string;
  pageCount: number;
}> {
  // 1. Import dinamico di jsPDF (nessun impatto sul bundle iniziale)
  const { jsPDF } = await import('jspdf');

  // 2. Preparazione dati locali
  const data = await preparePdfData(options);

  // 3. Inizializzazione documento A4 verticale
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    putOnlyUsedFonts: true
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - (marginX * 2);
  const bottomMargin = 18;

  let currentY = 14;

  // Palette Brand Instagram
  const NAVY = [23, 32, 51] as const;       // #172033
  const CORAL = [255, 107, 95] as const;    // #FF6B5F
  const CLOUD = [248, 247, 243] as const;   // #F8F7F3
  const SLATE_DARK = [51, 65, 85] as const; // #334155
  const SLATE_MUTED = [100, 116, 139] as const; // #64748B
  const BORDER_LIGHT = [226, 232, 240] as const; // #E2E8F0

  const ensureSpace = (neededHeightMm: number) => {
    if (currentY + neededHeightMm > pageHeight - bottomMargin) {
      doc.addPage();
      currentY = 16;
      drawRunningHeader();
    }
  };

  const drawRunningHeader = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
    doc.text(`HOUNIGO ROADBOOK  |  ${data.tripTitle}`, marginX, 10);
    doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
    doc.setLineWidth(0.2);
    doc.line(marginX, 12, pageWidth - marginX, 12);
  };

  // ─── 1. MASTHEAD COPERTINA EDITORIALE (Compattato per non sprecare una pagina intera) ───
  // Banner superiore Navy con bordo arrotondato
  const bannerHeight = data.destinationsSummary ? 36 : 30;
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.roundedRect(marginX, currentY, contentWidth, bannerHeight, 3, 3, 'F');

  // Accento Coral sul bordo sinistro
  doc.setFillColor(CORAL[0], CORAL[1], CORAL[2]);
  doc.rect(marginX, currentY, 3.5, bannerHeight, 'F');

  // Scritta Brand Logo HOUNIGO
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HOUNIGO', marginX + 8, currentY + 9);

  // Kicker sottotitolo
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(CORAL[0], CORAL[1], CORAL[2]);
  doc.text('DIGITAL EXPEDITION & HONEYMOON ROADBOOK', marginX + 44, currentY + 9);

  // Titolo Viaggio
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(data.tripTitle, contentWidth - 14);
  doc.text(titleLines[0], marginX + 8, currentY + 18);

  // Date e Dettaglio
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(CLOUD[0], CLOUD[1], CLOUD[2]);
  doc.text(`Periodo: ${data.tripDates}  |  Dettaglio: ${options.detailLevel === 'detailed' ? 'Completo' : 'Compatto'}`, marginX + 8, currentY + 24);

  // Sintesi destinazioni (se presenti)
  if (data.destinationsSummary) {
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    const destText = doc.splitTextToSize(`Tappe: ${data.destinationsSummary}`, contentWidth - 14);
    doc.text(destText[0], marginX + 8, currentY + 30);
  }

  currentY += bannerHeight + 5;

  // Avviso sincronizzazione locale (se presente)
  if (data.hasUnsyncedChanges) {
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(245, 158, 11);  // amber-500
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, currentY, contentWidth, 8, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(146, 64, 14);
    doc.text('Nota: Il PDF include i dati salvati su questo dispositivo. Alcune modifiche potrebbero non essere ancora sincronizzate.', marginX + 3, currentY + 5.5);
    currentY += 11;
  }

  // ─── 2. PROGRAMMA GIORNALIERO (CRONOLOGICO) ───
  if (data.days.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
    doc.text('Nessun giorno o evento programmato nell\'intervallo selezionato.', marginX, currentY + 10);
  }

  for (const day of data.days) {
    // Spazio stimato minimo per intestazione giornata
    ensureSpace(24);

    // Header Day Band
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.roundedRect(marginX, currentY, contentWidth, 7.5, 1.5, 1.5, 'F');

    // Indicatore Coral sulla riga della giornata
    doc.setFillColor(CORAL[0], CORAL[1], CORAL[2]);
    doc.circle(marginX + 4, currentY + 3.75, 1.5, 'F');

    // Titolo della giornata (Giorno X • Data Formattata)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const dayLabel = `GIORNO ${day.dayNum}  -  ${formatDateIT(day.date).toUpperCase()}`;
    doc.text(dayLabel, marginX + 8, currentY + 5.2);

    // Tappa / Località a destra nell'header
    if (day.tappaTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(CORAL[0], CORAL[1], CORAL[2]);
      const tappaStr = `Tappa: ${day.tappaTitle}`;
      const tappaWidth = doc.getTextWidth(tappaStr);
      doc.text(tappaStr, pageWidth - marginX - tappaWidth - 3, currentY + 5.2);
    }

    currentY += 9.5;

    // Pernottamento previsto
    if (day.accommodation) {
      ensureSpace(10);
      doc.setFillColor(CLOUD[0], CLOUD[1], CLOUD[2]);
      doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
      doc.setLineWidth(0.2);
      doc.roundedRect(marginX, currentY, contentWidth, 6.5, 1, 1, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text('Alloggio:', marginX + 3, currentY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      const hotelInfo = `${sanitizePdfText(day.accommodation.name)}${day.accommodation.location ? ` (${sanitizePdfText(day.accommodation.location)})` : ''}${day.accommodation.checkInTime ? ` - Check-in: ${day.accommodation.checkInTime}` : ''}`;
      const cutHotel = doc.splitTextToSize(hotelInfo, contentWidth - 32);
      doc.text(cutHotel[0], marginX + 17, currentY + 4.5);

      if (options.includeBookingRefs && day.accommodation.bookingCode) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
        const refStr = `Ref: ${sanitizePdfText(day.accommodation.bookingCode)}`;
        const refW = doc.getTextWidth(refStr);
        doc.text(refStr, pageWidth - marginX - refW - 3, currentY + 4.5);
      }

      currentY += 8;
    }

    // Se la giornata non ha eventi
    if (day.timedEvents.length === 0 && day.untimedEvents.length === 0) {
      ensureSpace(8);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
      doc.text('Nessuna attivita registrata a orario fisso per questa giornata.', marginX + 4, currentY + 4);
      currentY += 7;
    } else {
      // 1. Eventi con orario (Cronologici)
      for (const ev of day.timedEvents) {
        const isDetailed = options.detailLevel === 'detailed';
        const hasExtra = isDetailed && Boolean(ev.departureLocation || ev.arrivalLocation || ev.address || ev.note || ev.bookingRef);
        const itemHeight = hasExtra ? 12 : 7.5;
        ensureSpace(itemHeight);

        // Orario badge in Coral
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(CORAL[0], CORAL[1], CORAL[2]);
        doc.text(ev.time, marginX + 2, currentY + 4.5);

        // Tipo evento in parentesi quadre
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
        const typeTag = `[${ev.categoryOrType}]`;
        doc.text(typeTag, marginX + 16, currentY + 4.5);

        // Titolo evento in Navy
        const typeTagWidth = doc.getTextWidth(typeTag);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        const titleX = marginX + 17 + typeTagWidth + 2;
        const maxTitleW = contentWidth - (titleX - marginX) - 30;
        const splitTitle = doc.splitTextToSize(ev.title, maxTitleW);
        doc.text(splitTitle[0], titleX, currentY + 4.5);

        // Luogo essenziale a destra
        if (ev.location) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
          const locStr = ev.location.length > 28 ? ev.location.substring(0, 26) + '..' : ev.location;
          const locW = doc.getTextWidth(locStr);
          doc.text(locStr, pageWidth - marginX - locW - 2, currentY + 4.5);
        }

        currentY += 5.5;

        // Informazioni dettagliate (se richieste)
        if (hasExtra) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);

          const details: string[] = [];
          if (ev.departureLocation && ev.arrivalLocation && ev.departureLocation !== ev.arrivalLocation) {
            details.push(`Tratta: ${ev.departureLocation} -> ${ev.arrivalLocation}`);
          } else if (ev.address && ev.address !== ev.location) {
            details.push(`Indirizzo: ${ev.address}`);
          }
          if (ev.bookingRef) {
            details.push(`Conferma: ${ev.bookingRef}`);
          }
          if (ev.note) {
            details.push(`Nota: ${ev.note}`);
          }

          if (details.length > 0) {
            const detailStr = details.join('  |  ');
            const splitDetail = doc.splitTextToSize(detailStr, contentWidth - 20);
            doc.text(splitDetail[0], marginX + 16, currentY + 3.5);
            currentY += 5;
          }
        }

        // Linea separatrice sottile tra eventi
        doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
        doc.setLineWidth(0.15);
        doc.line(marginX + 16, currentY + 1, pageWidth - marginX, currentY + 1);
        currentY += 2.5;
      }

      // 2. Eventi senza orario prefissato
      if (day.untimedEvents.length > 0) {
        ensureSpace(12);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
        doc.text('Senza orario fisso:', marginX + 2, currentY + 3.5);
        currentY += 5;

        for (const un of day.untimedEvents) {
          ensureSpace(6);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
          const lineStr = `* [${un.categoryOrType}] ${un.title}${un.location ? ` - ${un.location}` : ''}`;
          const split = doc.splitTextToSize(lineStr, contentWidth - 10);
          doc.text(split[0], marginX + 6, currentY + 3);
          currentY += 4.5;
        }
      }
    }

    // Note della giornata (se selezionate)
    if (day.notes.length > 0) {
      ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text('Note giornata:', marginX + 2, currentY + 3);
      currentY += 4.5;

      day.notes.forEach(noteText => {
        ensureSpace(6);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
        const split = doc.splitTextToSize(`- ${noteText}`, contentWidth - 10);
        doc.text(split[0], marginX + 6, currentY + 2.5);
        currentY += 4;
      });
    }

    // Spese della giornata (se selezionate)
    if (day.spese.length > 0) {
      ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text('Spese previste:', marginX + 2, currentY + 3);
      currentY += 4.5;

      day.spese.forEach(sp => {
        ensureSpace(6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
        const costStr = sp.amount !== undefined ? `${sp.amount} EUR` : ((sp as any).importo ? `${(sp as any).importo} ${(sp as any).valuta || 'EUR'}` : '');
        const spLine = `* ${sanitizePdfText(sp.title || (sp as any).descrizione || 'Spesa')} ${costStr ? `(${costStr})` : ''}`;
        const split = doc.splitTextToSize(spLine, contentWidth - 10);
        doc.text(split[0], marginX + 6, currentY + 2.5);
        currentY += 4;
      });
    }

    // Spaziatura tra giornate
    currentY += 3.5;
  }

  // ─── 3. PIÈ DI PAGINA SU TUTTE LE PAGINE ───
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
    doc.text(`HOUNIGO Roadbook  -  Generato per uso offline e stampa`, marginX, pageHeight - 7.5);

    const pageStr = `Pagina ${i} di ${totalPages}`;
    const pageW = doc.getTextWidth(pageStr);
    doc.text(pageStr, pageWidth - marginX - pageW, pageHeight - 7.5);
  }

  // ─── 4. GENERAZIONE FILE BLOB ───
  const cleanTitleForFile = data.tripTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const dateTag = new Date().toISOString().split('T')[0];
  const fileName = `HOUNIGO_Itinerario_${cleanTitleForFile}_${dateTag}.pdf`;

  const blob = doc.output('blob');

  return {
    blob,
    fileName,
    pageCount: totalPages
  };
}

/**
 * Gestisce il download o la condivisione nativa su mobile (iOS Safari / PWA).
 */
export async function downloadOrSharePdf(blob: Blob, fileName: string): Promise<{
  shared: boolean;
  downloaded: boolean;
}> {
  if (typeof window === 'undefined') {
    return { shared: false, downloaded: false };
  }

  // 1. Tenta Web Share API nativa con file (ottimale per iPhone / iPad / Android)
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: 'Ecco il roadbook del nostro itinerario generato con HOUNIGO.'
        });
        return { shared: true, downloaded: false };
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        // L'utente ha annullato lo share sheet volontariamente
        return { shared: false, downloaded: false };
      }
      console.warn('[PdfExport] Web Share API non completata, passaggio a download standard:', shareErr);
    }
  }

  // 2. Fallback standard tramite creazione link blob download
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
    return { shared: false, downloaded: true };
  } catch (downloadErr) {
    console.error('[PdfExport] Errore trigger download blob:', downloadErr);
    // 3. Fallback estremo per Safari iOS in standalone: apri in nuova scheda
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return { shared: false, downloaded: true };
  }
}
