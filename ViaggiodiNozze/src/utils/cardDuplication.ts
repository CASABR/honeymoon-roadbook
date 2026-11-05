/**
 * cardDuplication.ts
 *
 * Logica sicura e riutilizzabile per la duplicazione delle card HOUNIGO.
 * Regole non negoziabili:
 * 1. Genera un identificativo univoco (nuovo ID).
 * 2. Pre-compila il titolo con prefisso "Copia di ...".
 * 3. Conserva informazioni utili e riutilizzabili (luogo, orari, indirizzo, coordinate, note, sottocategoria).
 * 4. ESCLUDE categoricamente ID tecnici, stati di sync e dati sensibili di prenotazione:
 *    - bookingCode / PNR azzerati
 *    - qrCode / ticketUrl azzerati
 *    - allegati / carte d'imbarco rimosse
 * 5. La copia viene aperta in modalità modifica e salvata solo dopo conferma esplicita dell'utente.
 */

import type { TimelineItem, Tappa, Attivita, Alloggio, Trasporto, Ristorante, Shopping } from '../types';

function generateUniqueId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export interface PreparedDuplicate {
  type: TimelineItem['type'];
  modalTitle: string;
  data: any;
}

export function prepareDuplicateItem(item: TimelineItem): PreparedDuplicate {
  const original = item.originalData;

  switch (item.type) {
    case 'tappa': {
      const orig = original as Tappa;
      const copyTitle = orig.titolo?.startsWith('Copia di ') ? orig.titolo : `Copia di ${orig.titolo || 'Tappa'}`;
      const duplicatedTappa: Tappa = {
        ...orig,
        id: generateUniqueId('tappa'),
        titolo: copyTitle,
        data: orig.data,
        date: orig.date || orig.data,
        orario: orig.orario,
        time: orig.time || orig.orario,
        timeStatus: orig.timeStatus,
        indirizzo: orig.indirizzo,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        mapsUrl: orig.mapsUrl,
        sottocategoria: orig.sottocategoria === 'Sosta fotografica' ? 'Spot fotografico' : (orig.sottocategoria || 'Tappa'),
        lightWindow: orig.lightWindow,
        photoSubject: orig.photoSubject,
        nota: orig.nota,
        noteCopilota: orig.noteCopilota,
        openingHours: orig.openingHours,
        // ESCLUSIONE PRENOTAZIONE / BIGLIETTI / ALLEGATI
        bookingCode: undefined,
        qrCode: undefined,
        ticketUrl: undefined,
        linkedBookingId: undefined,
        linkedDocumentId: undefined,
        linkedDocumentIds: undefined,
        attachments: undefined
      };
      return {
        type: 'tappa',
        modalTitle: 'Nuova Tappa (Copia)',
        data: duplicatedTappa
      };
    }

    case 'attivita': {
      const orig = original as Attivita;
      const copyTitle = orig.title?.startsWith('Copia di ') ? orig.title : `Copia di ${orig.title || 'Attività'}`;
      const duplicatedAttivita: Attivita = {
        ...orig,
        id: generateUniqueId('act'),
        title: copyTitle,
        location: orig.location,
        address: orig.address,
        date: orig.date,
        time: orig.time,
        timeStatus: orig.timeStatus,
        duration: orig.duration,
        sottocategoria: orig.sottocategoria || 'Trekking',
        lightWindow: orig.lightWindow, // Preservato per Spot fotografico
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        notes: orig.notes
      };
      return {
        type: 'attivita',
        modalTitle: 'Nuova Attività (Copia)',
        data: duplicatedAttivita
      };
    }

    case 'alloggio': {
      const orig = original as Alloggio;
      const copyName = orig.name?.startsWith('Copia di ') ? orig.name : `Copia di ${orig.name || 'Alloggio'}`;
      const duplicatedAlloggio: Alloggio = {
        ...orig,
        id: generateUniqueId('acc'),
        name: copyName,
        location: orig.location,
        address: orig.address,
        checkIn: orig.checkIn,
        checkOut: orig.checkOut,
        checkInTime: orig.checkInTime,
        checkOutTime: orig.checkOutTime,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        sottocategoria: orig.sottocategoria,
        notes: orig.notes,
        // ESCLUSIONE PRENOTAZIONI E ALLEGATI
        bookingCode: undefined,
        bookingUrl: undefined,
        attachments: undefined
      };
      return {
        type: 'alloggio',
        modalTitle: 'Nuovo Alloggio (Copia)',
        data: duplicatedAlloggio
      };
    }

    case 'trasporto': {
      const orig = original as Trasporto;
      const copyCarrier = orig.carrier ? (orig.carrier.startsWith('Copia di ') ? orig.carrier : `Copia di ${orig.carrier}`) : undefined;
      const duplicatedTrasporto: Trasporto = {
        ...orig,
        id: generateUniqueId('tr'),
        type: orig.type,
        carrier: copyCarrier,
        departureLocation: orig.departureLocation,
        arrivalLocation: orig.arrivalLocation,
        date: orig.date,
        departureTime: orig.departureTime,
        arrivalDate: orig.arrivalDate,
        arrivalTime: orig.arrivalTime,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        // ESCLUSIONE PNR, CODICI PRENOTAZIONE, POSTI E ALLEGATI
        bookingCode: undefined,
        posti: undefined,
        ticketUrl: undefined,
        attachments: undefined
      };
      delete (duplicatedTrasporto as any).pnr;
      return {
        type: 'trasporto',
        modalTitle: 'Nuovo Trasporto (Copia)',
        data: duplicatedTrasporto
      };
    }

    case 'ristorante': {
      const orig = original as Ristorante;
      const copyNome = orig.nome?.startsWith('Copia di ') ? orig.nome : `Copia di ${orig.nome || 'Ristorante'}`;
      const duplicatedRistorante: Ristorante = {
        ...orig,
        id: generateUniqueId('rist'),
        nome: copyNome,
        data: orig.data,
        date: orig.date || orig.data,
        orario: orig.orario,
        indirizzo: orig.indirizzo,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        sottocategoria: orig.sottocategoria,
        nota: orig.nota
      };
      return {
        type: 'ristorante',
        modalTitle: 'Nuovo Ristorante (Copia)',
        data: duplicatedRistorante
      };
    }

    case 'shopping': {
      const orig = original as Shopping;
      const copyNome = orig.nome?.startsWith('Copia di ') ? orig.nome : `Copia di ${orig.nome || 'Shopping'}`;
      const duplicatedShopping: Shopping = {
        ...orig,
        id: generateUniqueId('shop'),
        nome: copyNome,
        data: orig.data,
        date: orig.date || orig.data,
        orario: orig.orario,
        indirizzo: orig.indirizzo,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        sottocategoria: orig.sottocategoria,
        budget: orig.budget,
        nota: orig.nota
      };
      return {
        type: 'shopping',
        modalTitle: 'Nuovo Shopping (Copia)',
        data: duplicatedShopping
      };
    }

    default:
      throw new Error(`Tipologia '${item.type}' non supportata per la duplicazione.`);
  }
}
