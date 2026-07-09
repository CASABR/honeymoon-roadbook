export interface ParsedBooking {
  name: string;
  city: string;
  checkIn: string;
  checkOut: string;
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string; // ISO date YYYY-MM-DD
  price?: number;
  confirmationCode: string;
  note?: string;
  confidence: {
    name: boolean;
    checkIn: boolean;
    checkOut: boolean;
    confirmationCode: boolean;
  };
}

export function parseBookingText(text: string): Partial<ParsedBooking> {
  const result: Partial<ParsedBooking> = {};
  const confidence = {
    name: false,
    checkIn: false,
    checkOut: false,
    confirmationCode: false,
  };

  // 1. Estrazione del nome della struttura / Hotel
  const nameRegexes = [
    /(?:Struttura|Struttura ospitante|Nome struttura|Hotel|Property|Property Name|Alloggio)\s*:\s*([^\n\r]+)/i,
    /(?:Prenotazione presso|Confermata a|Confermato a)\s+([^\n\r,]+)/i,
    /(?:Grazie\s*,\s*[a-zA-Z\s]+!\s*La tua prenotazione è confermata a)\s+([^\n\r\.]+)/i
  ];

  for (const regex of nameRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      result.name = match[1].trim();
      confidence.name = true;
      break;
    }
  }

  // Fallback per il nome: prima riga se ha senso
  if (!result.name) {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0 && lines[0].length < 100 && !lines[0].toLowerCase().includes("booking")) {
      result.name = lines[0];
    }
  }

  // 2. Estrazione Codice di conferma
  const codeRegexes = [
    /(?:Numero prenotazione|Numero di prenotazione|Codice di conferma|Codice conferma|Booking number|Confirmation number|Confirmation code)\s*[:\-]?\s*([0-9\s\.\-]{8,20})/i,
    /(?:Codice PIN)\s*[:\-]?\s*([0-9]{4})/i
  ];

  for (const regex of codeRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      result.confirmationCode = match[1].replace(/[\s\.\-]/g, "").trim();
      confidence.confirmationCode = true;
      break;
    }
  }

  // 3. Estrazione Indirizzo / Città
  const addressRegexes = [
    /(?:Indirizzo|Indirizzo struttura|Indirizzo dell'alloggio|Address|Location)\s*:\s*([^\n\r]+)/i
  ];

  for (const regex of addressRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const address = match[1].trim();
      result.city = address;
      const parts = address.split(",");
      if (parts.length > 1) {
        const cityPart = parts[parts.length - 2]?.trim();
        if (cityPart) {
          result.city = cityPart;
        }
      }
      break;
    }
  }

  // 4. Estrazione Check-in e Check-out
  const checkInRegexes = [
    /(?:Check-in|Entrata|Arrivo|Arrival|Check in)\s*[:\-]?\s*([^\n\r\(]+)/i
  ];
  const checkOutRegexes = [
    /(?:Check-out|Uscita|Partenza|Departure|Check out)\s*[:\-]?\s*([^\n\r\(]+)/i
  ];

  for (const regex of checkInRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      result.checkIn = match[1].trim();
      confidence.checkIn = true;
      break;
    }
  }

  for (const regex of checkOutRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      result.checkOut = match[1].trim();
      confidence.checkOut = true;
      break;
    }
  }

  // Conversione date ISO
  if (result.checkIn) {
    const isoIn = tryParseDateToISO(result.checkIn);
    if (isoIn) {
      result.startDate = isoIn;
    }
  }
  if (result.checkOut) {
    const isoOut = tryParseDateToISO(result.checkOut);
    if (isoOut) {
      result.endDate = isoOut;
    }
  }

  // 5. Estrazione Prezzo
  const priceRegexes = [
    /(?:Prezzo|Prezzo totale|Totale|Total|Price|Cost|Tariffa)\s*[:\-]?\s*(?:EUR|USD|€|\$)?\s*([0-9\.,\s]+)/i,
    /([0-9\.,\s]+)\s*(?:EUR|USD|€|\$|euro|NZD|AUD)/i
  ];

  for (const regex of priceRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const priceStr = match[1].replace(/\s/g, "").replace(",", ".");
      const val = parseFloat(priceStr);
      if (!isNaN(val)) {
        result.price = val;
        break;
      }
    }
  }

  // 6. Ospiti / Note
  const guestRegexes = [
    /(?:Nome ospite|Ospite|Guest Name|Guest)\s*:\s*([^\n\r]+)/i
  ];
  for (const regex of guestRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      result.note = `Ospite: ${match[1].trim()}`;
      break;
    }
  }

  result.confidence = confidence;
  return result;
}

// Mappa mesi testuali
const months: Record<string, string> = {
  gen: "01", gennaio: "01", jan: "01", january: "01",
  feb: "02", febbraio: "02", febr: "02", february: "02",
  mar: "03", marzo: "03", march: "03",
  apr: "04", aprile: "04", april: "04",
  mag: "05", maggio: "05", may: "05",
  giu: "06", giugno: "06", jun: "06", june: "06",
  lug: "07", luglio: "07", jul: "07", july: "07",
  ago: "08", agosto: "08", aug: "08", august: "08",
  set: "09", settembre: "09", sep: "09", september: "09",
  ott: "10", ottobre: "10", oct: "10", october: "10",
  nov: "11", novembre: "11", november: "11",
  dic: "12", dicembre: "12", dec: "12", december: "12",
};

export function tryParseDateToISO(dateStr: string): string | null {
  const cleanStr = dateStr.toLowerCase().replace(/[\.,]/g, "").trim();
  
  // 1. Caso YYYY-MM-DD standard
  const isoMatch = cleanStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  // 2. Caso DD/MM/YYYY o DD-MM-YYYY
  const slashMatch = cleanStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  // 3. Caso testuale in italiano con giorno mese anno
  const textMatch = cleanStr.match(/(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})/);
  if (textMatch) {
    const day = textMatch[1].padStart(2, "0");
    const monthText = textMatch[2];
    const year = textMatch[3];
    const monthNum = months[monthText];
    if (monthNum) {
      return `${year}-${monthNum}-${day}`;
    }
  }

  // 4. Fallback giorno e mese testuale (es. "2 dic" o "2 dicembre")
  const textNoYearMatch = cleanStr.match(/(\d{1,2})\s+([a-z]{3,9})/);
  if (textNoYearMatch) {
    const day = textNoYearMatch[1].padStart(2, "0");
    const monthText = textNoYearMatch[2];
    const monthNum = months[monthText];
    if (monthNum) {
      // Prova a recuperare l'anno di partenza dal localStorage o usa il 2026 come default
      const departure = localStorage.getItem("hrb_departure_date");
      const year = departure ? departure.split("-")[0] : "2026";
      return `${year}-${monthNum}-${day}`;
    }
  }

  return null;
}
