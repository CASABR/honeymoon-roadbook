/**
 * cardDuplication.ts
 *
 * Logica sicura e riutilizzabile per la duplicazione delle card HOUNIGO.
 * Regole non negoziabili:
 * 1. Genera un identificativo univoco (nuovo ID primario).
 * 2. Non altera mai il record originale né i suoi allegati.
 * 3. Pre-compila il titolo con prefisso "Copia di ...".
 * 4. Conserva informazioni utili e riutilizzabili (luogo, orari, indirizzo, coordinate, note, sottocategoria, stima budget).
 * 5. ESCLUDE categoricamente e azzera:
 *    - PNR e codici prenotazione (bookingCode, pnr)
 *    - PIN e credenziali di accesso (pinCode keybox)
 *    - Biglietti, carte d'imbarco, voucher e QR (ticketUrl, voucherUrl, qrCode, attachments)
 *    - Relazioni persistenti univoche (linkedBookingId, linkedDocumentId, passeggiataId)
 *    - Stato di pagamento (mai ereditare 'saldato', acconto o spesa già effettuata costo)
 *    - Assegnazioni specifiche (posti a sedere, terminal/gate, tavolo riservato)
 * 6. La copia viene aperta in modalità bozza/modifica e salvata solo dopo conferma esplicita dell'utente.
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
  if (!original) {
    throw new Error('Impossibile duplicare: dati originali non disponibili.');
  }

  const now = Date.now();

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
        dayId: orig.dayId,
        orario: orig.orario,
        time: orig.time || orig.orario,
        timeStatus: orig.timeStatus || 'indicativo',
        indirizzo: orig.indirizzo,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        mapsUrl: orig.mapsUrl,
        sottocategoria: orig.sottocategoria === 'Sosta fotografica' ? 'Spot fotografico' : (orig.sottocategoria || 'Tappa'),
        lightWindow: orig.lightWindow,
        photoSubject: orig.photoSubject,
        nota: orig.nota,
        notes: orig.notes,
        noteCopilota: orig.noteCopilota,
        copilota: orig.copilota,
        openingHours: orig.openingHours ? JSON.parse(JSON.stringify(orig.openingHours)) : undefined,
        createdAt: now,
        updatedAt: now,

        // --- AZZERAMENTO RIGOROSO PRENOTAZIONI, RELAZIONI E ALLEGATI ---
        bookingCode: undefined,
        qrCode: undefined,
        ticketUrl: undefined,
        linkedBookingId: undefined,
        linkedDocumentId: undefined,
        linkedDocumentIds: undefined,
        passeggiataId: undefined, // Non aggancia la copia al contenitore originale
        completed: undefined,
        attachments: undefined // Gli allegati dell'originale rimangono intatti e NON condivisi per riferimento
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
        dayId: orig.dayId,
        location: orig.location,
        address: orig.address,
        date: orig.date,
        time: orig.time,
        timeStatus: orig.timeStatus || 'indicativo',
        duration: orig.duration,
        category: orig.category || 'visita',
        sottocategoria: orig.sottocategoria,
        lightWindow: orig.lightWindow,
        photoSubject: orig.photoSubject,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        notes: orig.notes,
        noteCopilota: orig.noteCopilota,
        copilota: orig.copilota,
        cost: orig.cost, // Stima prezzo utile come riferimento
        createdAt: now,
        updatedAt: now,

        // --- AZZERAMENTO STATO DI PRENOTAZIONE, CREDENZIALI E PAGAMENTO ---
        status: 'da_valutare', // Mai ereditare 'prenotato' o 'completato'
        completed: undefined,
        paymentStatus: 'da_saldare',
        acconto: undefined,
        qrCode: undefined,
        attachments: undefined,
        childTappe: undefined
      };
      delete (duplicatedAttivita as any).bookingCode;
      delete (duplicatedAttivita as any).ticketUrl;
      delete (duplicatedAttivita as any).voucherUrl;
      delete (duplicatedAttivita as any).depositPaid;
      delete (duplicatedAttivita as any).pnr;
      delete (duplicatedAttivita as any).linkedDocumentId;
      delete (duplicatedAttivita as any).linkedBookingId;
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
        arrivalTime: orig.arrivalTime,
        timeStatus: orig.timeStatus || 'indicativo',
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        sottocategoria: orig.sottocategoria,
        phone: orig.phone,
        notes: orig.notes,
        noteCopilota: orig.noteCopilota,
        copilota: orig.copilota,
        cost: orig.cost, // Tariffa camera utile come stima
        deposit: orig.deposit, // Cauzione prevista della struttura mantenuta come info
        cauzione: orig.cauzione,
        createdAt: now,
        updatedAt: now,

        // --- AZZERAMENTO RIGOROSO CREDENZIALI ACCESSO, PIN E PAGAMENTO ---
        pinCode: undefined, // MAI ereditare codici cassaforte o chiavi
        bookingCode: undefined,
        bookingUrl: undefined,
        status: 'da_prenotare',
        completed: undefined,
        paymentStatus: 'da_saldare',
        depositPaid: undefined,
        acconto: undefined,
        cancellazioneGratuitaEntro: undefined, // Termini della specifica prenotazione azzerati
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
        cost: orig.cost, // Costo base utile come preventivo
        bagagli: orig.bagagli, // Franchigia bagaglio utile come riferimento
        layover: orig.type === 'volo' && orig.layover ? { ...orig.layover } : undefined,
        notes: orig.notes,
        noteCopilota: orig.noteCopilota,
        copilota: orig.copilota,
        createdAt: now,
        updatedAt: now,

        // --- AZZERAMENTO RIGOROSO PNR, POSTI ASSEGNATI E STATO PAGAMENTO ---
        bookingCode: undefined,
        posti: undefined, // Posti a sedere della prenotazione azzerati
        terminalGate: undefined, // Gate e binario giornalieri azzerati
        ticketUrl: undefined,
        status: 'pianificato',
        completed: undefined,
        paymentStatus: 'da_saldare' as any,
        depositPaid: undefined,
        acconto: undefined,
        attachments: undefined
      };
      delete (duplicatedTrasporto as any).pnr;
      delete (duplicatedTrasporto as any).checkinOnlineUrl;
      delete (duplicatedTrasporto as any).checkinCutoff;
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
        dayId: orig.dayId,
        orario: orig.orario,
        time: orig.time || orig.orario,
        timeStatus: orig.timeStatus || 'indicativo',
        indirizzo: orig.indirizzo,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        sottocategoria: orig.sottocategoria,
        budget: orig.budget,
        telefono: orig.telefono,
        linkPrenotazione: orig.linkPrenotazione,
        nota: orig.nota,
        notes: orig.notes,
        noteCopilota: orig.noteCopilota,
        copilota: orig.copilota,
        createdAt: now,
        updatedAt: now,

        // --- AZZERAMENTO TAVOLO, CODICE PRENOTAZIONE E STATO SALDATO ---
        status: 'da_saldare',
        completed: undefined,
        attachments: undefined
      };
      delete (duplicatedRistorante as any).bookingCode;
      delete (duplicatedRistorante as any).tavolo;
      delete (duplicatedRistorante as any).qrCode;
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
        dayId: orig.dayId,
        orario: orig.orario,
        time: orig.time || orig.orario,
        timeStatus: orig.timeStatus || 'indicativo',
        indirizzo: orig.indirizzo,
        coordinate: orig.coordinate ? { ...orig.coordinate } : undefined,
        sottocategoria: orig.sottocategoria,
        scopo: orig.scopo,
        budget: orig.budget, // Budget stimato PRESERVATO
        link: orig.link,
        nota: orig.nota,
        notes: orig.notes,
        noteCopilota: orig.noteCopilota,
        copilota: orig.copilota,
        createdAt: now,
        updatedAt: now,

        // --- AZZERAMENTO SPESA EFFETTIVAMENTE EFFETTUATA E STATO ---
        cost: undefined, // La spesa NON è stata ancora effettuata!
        depositPaid: undefined,
        acconto: undefined,
        paymentStatus: 'da_saldare',
        completed: undefined,
        attachments: undefined
      };
      delete (duplicatedShopping as any).costo;
      delete (duplicatedShopping as any).qrCode;
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
