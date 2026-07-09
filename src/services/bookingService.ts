import type { Accommodation, Transport } from "../data/mockData";
import { tryParseDateToISO } from "./bookingParser";

export interface UnifiedBooking {
  id: string;
  type: "hotel" | "flight" | "car" | "transport" | "other";
  source: "booking" | "manual" | "gmail" | "google_calendar" | "imported";
  title: string;
  supplierName: string;
  location: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD
  confirmationCode?: string;
  notes?: string;
  price?: number;
  originalItem: any;
}

export interface VerificationIssue {
  id: string;
  type: "overlap" | "duplicate" | "gap";
  severity: "error" | "warning";
  title: string;
  description: string;
  items: UnifiedBooking[];
  dateLabel?: string;
  ignoredKey: string;
}

// Mappa elementi alloggio e trasporti in un unico modello
export function getUnifiedBookings(
  accommodations: Accommodation[],
  transports: Transport[]
): UnifiedBooking[] {
  const unified: UnifiedBooking[] = [];

  // Mappa Accommodations
  for (const acc of accommodations) {
    let sDate = acc.startDate;
    let eDate = acc.endDate;

    // Fallback: se mancano le date ISO, le proviamo a ricavare dal checkIn / checkOut testuale
    if (!sDate && acc.checkIn) {
      const parsedIn = tryParseDateToISO(acc.checkIn);
      if (parsedIn) sDate = parsedIn;
    }
    if (!eDate && acc.checkOut) {
      const parsedOut = tryParseDateToISO(acc.checkOut);
      if (parsedOut) eDate = parsedOut;
    }

    // Se proprio non le ricaviamo, usiamo fallback sicuro basato sulla data di partenza
    if (!sDate) {
      const depStr = localStorage.getItem("hrb_departure_date") || "2026-11-28";
      sDate = depStr;
    }
    if (!eDate) {
      eDate = sDate;
    }

    unified.push({
      id: acc.id,
      type: "hotel",
      source: acc.source === "booking" ? "booking" : "manual",
      title: acc.name,
      supplierName: acc.name,
      location: acc.area ? `${acc.area}, ${acc.city}` : acc.city,
      startDate: sDate,
      endDate: eDate,
      confirmationCode: acc.confirmationCode,
      notes: acc.note,
      price: acc.price,
      originalItem: acc,
    });
  }

  // Mappa Transports
  for (const tr of transports) {
    const sDate = tr.date; // è già ISO YYYY-MM-DD
    const eDate = tr.date; // per i trasporti ipotizziamo check-out lo stesso giorno

    const uType =
      tr.type === "plane"
        ? "flight"
        : tr.type === "car"
        ? "car"
        : tr.type === "train" || tr.type === "ferry" || tr.type === "transfer"
        ? "transport"
        : "other";

    unified.push({
      id: tr.id,
      type: uType,
      source: tr.source === "booking" ? "booking" : "manual",
      title: `${tr.from} → ${tr.to}`,
      supplierName: tr.detail || "",
      location: `${tr.from} a ${tr.to}`,
      startDate: sDate,
      endDate: eDate,
      confirmationCode: tr.confirmationCode || tr.bookingRef,
      notes: tr.note || tr.importantNote,
      price: tr.price,
      originalItem: tr,
    });
  }

  return unified;
}

// Rileva sovrapposizioni (Overlaps)
export function detectOverlaps(bookings: UnifiedBooking[]): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  // 1. Sovrapposizione hotel
  const hotels = bookings.filter((b) => b.type === "hotel");
  for (let i = 0; i < hotels.length; i++) {
    for (let j = i + 1; j < hotels.length; j++) {
      const h1 = hotels[i];
      const h2 = hotels[j];

      // Condizione di sovrapposizione intervalli
      if (h1.startDate < h2.endDate && h2.startDate < h1.endDate) {
        issues.push({
          id: `overlap-hotel-${h1.id}-${h2.id}`,
          type: "overlap",
          severity: "error",
          title: "Sovrapposizione Alloggi",
          description: `Hai prenotato sia "${h1.title}" sia "${h2.title}" per le stesse date (${h1.startDate} / ${h1.endDate}).`,
          items: [h1, h2],
          ignoredKey: `ignore_overlap_${h1.id}_${h2.id}`,
        });
      }
    }
  }

  // 2. Sovrapposizione noleggi auto (car)
  const cars = bookings.filter((b) => b.type === "car");
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const c1 = cars[i];
      const c2 = cars[j];

      if (c1.startDate === c2.startDate) {
        issues.push({
          id: `overlap-car-${c1.id}-${c2.id}`,
          type: "overlap",
          severity: "warning",
          title: "Noleggi Auto Multipli",
          description: `Hai due noleggi auto previsti per lo stesso giorno (${c1.startDate}).`,
          items: [c1, c2],
          ignoredKey: `ignore_overlap_${c1.id}_${c2.id}`,
        });
      }
    }
  }

  return issues;
}

// Rileva duplicati sospetti (Duplicates)
export function detectDuplicates(bookings: UnifiedBooking[]): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const b1 = bookings[i];
      const b2 = bookings[j];

      if (b1.type === b2.type) {
        const d1 = new Date(b1.startDate);
        const d2 = new Date(b2.startDate);
        const diffDays = Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

        // Se le date coincidono o distano massimo 1 giorno, e il nome è simile
        if (diffDays <= 1) {
          const name1 = b1.title.toLowerCase();
          const name2 = b2.title.toLowerCase();
          const isSimilar =
            name1.includes(name2) ||
            name2.includes(name1) ||
            (b1.confirmationCode && b2.confirmationCode && b1.confirmationCode === b2.confirmationCode);

          if (isSimilar) {
            issues.push({
              id: `duplicate-${b1.id}-${b2.id}`,
              type: "duplicate",
              severity: "warning",
              title: "Sospetto Duplicato",
              description: `Trovate due prenotazioni simili nello stesso periodo (${b1.startDate}): "${b1.title}" e "${b2.title}".`,
              items: [b1, b2],
              ignoredKey: `ignore_dup_${b1.id}_${b2.id}`,
            });
          }
        }
      }
    }
  }

  return issues;
}

// Rileva gap temporali sospetti (Gaps)
export function detectGaps(
  bookings: UnifiedBooking[],
  tripStartDateStr: string,
  tripEndDateStr: string
): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const start = new Date(tripStartDateStr);
  const end = new Date(tripEndDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return [];
  }

  const hotels = bookings.filter((b) => b.type === "hotel");

  let current = new Date(start);
  // Iteriamo notte per notte fino al giorno prima della fine del viaggio
  while (current < end) {
    const currentDateStr = current.toISOString().split("T")[0];

    // Verifica se questa notte è coperta da un alloggio
    const isCovered = hotels.some((h) => {
      return h.startDate <= currentDateStr && currentDateStr < h.endDate;
    });

    if (!isCovered) {
      // Formatta data per etichetta italiana
      const dateLabel = current.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

      issues.push({
        id: `gap-${currentDateStr}`,
        type: "gap",
        severity: "warning",
        title: "Notte non coperta",
        description: `Non risulta alcun alloggio prenotato per la notte di ${dateLabel} (${currentDateStr}).`,
        items: [],
        dateLabel: currentDateStr,
        ignoredKey: `ignore_gap_${currentDateStr}`,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return issues;
}
