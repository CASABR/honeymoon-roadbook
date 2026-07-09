import { useState } from "react";
import { parseBookingText } from "../services/bookingParser";
import { repository } from "../services/repository";
import type { DayData, Accommodation } from "../data/mockData";

// Genera i giorni vuoti del viaggio
export function generateDaysBetween(startDateStr: string, endDateStr: string): DayData[] {
  const days: DayData[] = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [];
  }

  const current = new Date(start);
  let dayNum = 1;
  const itLocale = "it-IT";

  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0];

    const dateLabel = current.toLocaleDateString(itLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const dateShort = current.toLocaleDateString(itLocale, { day: "numeric" });
    const monthShort = current.toLocaleDateString(itLocale, { month: "short" });
    const dayShort = current.toLocaleDateString(itLocale, { weekday: "short" });

    const formattedLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1).replace(/\./g, "");
    const formattedDayShort = dayShort.charAt(0).toUpperCase() + dayShort.slice(1).replace(/\./g, "");
    const formattedMonthShort = monthShort.replace(/\./g, "");

    days.push({
      id: `day-${dayNum}`,
      dayNumber: dayNum,
      date: dateStr,
      dateLabel: formattedLabel,
      dateShort,
      monthShort: formattedMonthShort,
      dayShort: formattedDayShort,
      location: "",
      activities: [],
    });

    current.setDate(current.getDate() + 1);
    dayNum++;
  }
  return days;
}

export default function TripOnboarding() {
  const [step, setStep] = useState<"welcome" | "dates" | "bookings" | "import">("welcome");
  const [tripName, setTripName] = useState("Il mio Viaggio di Nozze 💖");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Form dell'import Booking
  const [pasteText, setPasteText] = useState("");
  const [importForm, setImportForm] = useState({
    name: "",
    city: "",
    checkIn: "",
    checkOut: "",
    startDate: "",
    endDate: "",
    price: "",
    confirmationCode: "",
    note: "",
  });
  const [confidence, setConfidence] = useState<Record<string, boolean>>({});

  function handleDemoMode() {
    localStorage.setItem("hrb_trip_onboarding_done", "true");
    window.location.reload();
  }

  function handleWelcomeNext() {
    setStep("dates");
  }

  function handleDatesSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || startDate > endDate) {
      alert("Inserisci date valide (la data di fine deve essere uguale o successiva alla data d'inizio).");
      return;
    }
    setStep("bookings");
  }

  async function initializeBlankTrip(importedAcco?: Accommodation) {
    // Calcola durata in giorni
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diffMs = e.getTime() - s.getTime();
    const durationDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    // Genera calendario giorni vuoto
    const blankDays = generateDaysBetween(startDate, endDate);

    // Salva le info del viaggio nel localStorage
    localStorage.setItem("hrb_departure_date", startDate);
    localStorage.setItem("hrb_trip_name", tripName.trim() || "Viaggio di Nozze");
    localStorage.setItem("hrb_trip_duration", `${durationDays} giorni`);

    // Inizializza i dati vuoti offline
    await repository.saveTripDays(blankDays);
    await repository.saveAccommodations(importedAcco ? [importedAcco] : []);
    await repository.saveTransports([]);
    await repository.saveQRImages({});
    await repository.saveCompletedActivities([]);
    await repository.saveBudgetEntries([]);

    // Contrassegna onboarding come completato e ricarica per riavviare l'app
    localStorage.setItem("hrb_trip_onboarding_done", "true");
    window.location.reload();
  }

  function handleAddManually() {
    initializeBlankTrip();
  }

  function handleImportBooking() {
    setStep("import");
  }

  function handleTextPasteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setPasteText(text);
    if (!text.trim()) return;

    const parsed = parseBookingText(text);
    setImportForm({
      name: parsed.name || "",
      city: parsed.city || "",
      checkIn: parsed.checkIn || "",
      checkOut: parsed.checkOut || "",
      startDate: parsed.startDate || "",
      endDate: parsed.endDate || "",
      price: parsed.price ? String(parsed.price) : "",
      confirmationCode: parsed.confirmationCode || "",
      note: parsed.note || "",
    });
    setConfidence(parsed.confidence || {});
  }

  // Permette il caricamento di file di testo / fallbacks
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setPasteText(text);
      const parsed = parseBookingText(text);
      setImportForm({
        name: parsed.name || "",
        city: parsed.city || "",
        checkIn: parsed.checkIn || "",
        checkOut: parsed.checkOut || "",
        startDate: parsed.startDate || "",
        endDate: parsed.endDate || "",
        price: parsed.price ? String(parsed.price) : "",
        confirmationCode: parsed.confirmationCode || "",
        note: parsed.note || "",
      });
      setConfidence(parsed.confidence || {});
    };
    reader.readAsText(file);
  }

  function handleConfirmImport() {
    if (!importForm.name.trim() || !importForm.city.trim()) {
      alert("Il nome della struttura e la città sono obbligatori per importare.");
      return;
    }

    const priceVal = parseFloat(importForm.price.replace(",", "."));
    const finalStartDate = importForm.startDate || startDate;
    const finalEndDate = importForm.endDate || endDate;

    const newAcco: Accommodation = {
      id: `acc-booking-${Date.now()}`,
      name: importForm.name.trim(),
      city: importForm.city.trim(),
      checkIn: importForm.checkIn.trim() || finalStartDate,
      checkOut: importForm.checkOut.trim() || finalEndDate,
      dates: `${importForm.checkIn || finalStartDate} – ${importForm.checkOut || finalEndDate}`,
      note: importForm.note.trim() || undefined,
      price: isNaN(priceVal) ? undefined : priceVal,
      source: "booking",
      confirmationCode: importForm.confirmationCode.trim() || undefined,
      startDate: finalStartDate,
      endDate: finalEndDate,
      type: "hotel",
    };

    // Imposta le date del viaggio alle date dell'alloggio se l'utente non ha impostato date stabili
    if (!startDate) {
      setStartDate(finalStartDate);
    }
    if (!endDate) {
      setEndDate(finalEndDate);
    }

    // Inizializza il viaggio inserendo l'alloggio importato
    initializeBlankTrip(newAcco);
  }

  // ── Render Screens ──

  if (step === "welcome") {
    return (
      <div className="app-shell flex flex-col justify-between p-6 bg-[#0b0f19] text-white relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[50%] rounded-full bg-blue-600/10 blur-[80px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full bg-blue-500/10 blur-[80px]" />

        <div className="flex-1 flex flex-col justify-center items-center text-center space-y-6 z-10">
          <div className="w-20 h-20 bg-blue-600/10 text-blue-500 rounded-full flex items-center justify-center text-3xl shadow-lg border border-blue-500/20">
            ✈️
          </div>
          <div>
            <h1 className="text-[24px] font-black tracking-tight text-white leading-tight">
              Il tuo Roadbook di Nozze
            </h1>
            <p className="text-[13px] text-slate-400 mt-2 max-w-[280px]">
              Pianifica il vostro viaggio speciale, gestisci prenotazioni offline e rileva sovrapposizioni e vuoti.
            </p>
          </div>
        </div>

        <div className="space-y-3 pb-4 z-10">
          <button
            onClick={handleWelcomeNext}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[13.5px] rounded-xl transition-all active:scale-97 shadow-lg shadow-blue-500/20"
          >
            🚀 Organizza il tuo viaggio
          </button>
          <button
            onClick={handleDemoMode}
            className="w-full h-12 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-bold text-[13px] rounded-xl transition-all active:scale-97"
          >
            🌴 Esplora con Dati Demo
          </button>
        </div>
      </div>
    );
  }

  if (step === "dates") {
    return (
      <div className="app-shell flex flex-col justify-between p-6 bg-slate-900 text-white relative overflow-hidden">
        <button
          onClick={() => setStep("welcome")}
          className="absolute top-6 left-6 text-slate-400 hover:text-white font-bold text-[12px] flex items-center gap-1 z-10 active:scale-95 bg-white/5 px-3 py-1.5 rounded-lg"
        >
          &larr; Indietro
        </button>

        <form onSubmit={handleDatesSubmit} className="flex-1 flex flex-col justify-center space-y-5 mt-10 z-10">
          <div className="text-center mb-2">
            <h2 className="text-[20px] font-black text-white">Configura il Viaggio</h2>
            <p className="text-[12px] text-slate-400 mt-1">Definisci il nome e il periodo del vostro viaggio</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider font-extrabold text-blue-400 block mb-1">
                Nome del Viaggio
              </label>
              <input
                type="text"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                required
                placeholder="es. Luna di Miele in Giappone"
                className="w-full h-11 px-3 bg-white/5 border border-white/10 rounded-xl text-[13px] text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] uppercase tracking-wider font-extrabold text-blue-400 block mb-1">
                  Data Inizio
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full h-11 px-3 bg-white/5 border border-white/10 rounded-xl text-[13px] text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] uppercase tracking-wider font-extrabold text-blue-400 block mb-1">
                  Data Fine
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full h-11 px-3 bg-white/5 border border-white/10 rounded-xl text-[13px] text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[13.5px] rounded-xl transition-all active:scale-97 shadow-lg shadow-blue-500/20 mt-4"
          >
            Avanti &rarr;
          </button>
        </form>
      </div>
    );
  }

  if (step === "bookings") {
    return (
      <div className="app-shell flex flex-col justify-between p-6 bg-slate-900 text-white relative overflow-hidden">
        <button
          onClick={() => setStep("dates")}
          className="absolute top-6 left-6 text-slate-400 hover:text-white font-bold text-[12px] flex items-center gap-1 z-10 active:scale-95 bg-white/5 px-3 py-1.5 rounded-lg"
        >
          &larr; Indietro
        </button>

        <div className="flex-1 flex flex-col justify-center text-center space-y-6 z-10">
          <div className="w-16 h-16 bg-blue-600/10 text-blue-500 rounded-full flex items-center justify-center text-2xl mx-auto border border-blue-500/20">
            🏨
          </div>
          <div>
            <h2 className="text-[20px] font-black text-white">Prenotazioni Esistenti</h2>
            <p className="text-[12px] text-slate-400 mt-1.5 max-w-[260px] mx-auto">
              Hai già un alloggio o volo confermato per questo periodo?
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <button
              onClick={handleImportBooking}
              className="w-full h-13 bg-white text-slate-900 font-extrabold text-[14px] rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-gray-100 active:scale-98"
            >
              📥 Importa da Booking.com
            </button>
            <button
              onClick={handleAddManually}
              className="w-full h-12 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-semibold text-[13px] rounded-xl transition-all active:scale-98"
            >
              Aggiungi manualmente più tardi
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "import") {
    return (
      <div className="app-shell flex flex-col bg-slate-900 text-white relative overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <button
            onClick={() => setStep("bookings")}
            className="text-slate-400 hover:text-white font-bold text-[12px]"
          >
            &larr; Indietro
          </button>
          <span className="text-[13px] font-black text-white">Import Booking MVP</span>
          <div className="w-8" />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider font-extrabold text-blue-400 block mb-1">
              Testo conferma Booking o Mail
            </label>
            <textarea
              rows={4}
              value={pasteText}
              onChange={handleTextPasteChange}
              placeholder="Incolla qui la mail di conferma o il testo copiato da Booking..."
              className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-[12.5px] text-white focus:outline-none focus:border-blue-500 placeholder:text-slate-600 resize-none font-mono"
            />
          </div>

          <div className="flex items-center justify-between gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
            <div>
              <p className="text-[12px] font-bold text-slate-300">Carica da Documento/TXT</p>
              <p className="text-[10px] text-slate-500">Usa file di testo scaricato</p>
            </div>
            <label className="bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-colors shrink-0">
              Scegli file
              <input type="file" onChange={handleFileUpload} accept=".txt,.html,.pdf" className="hidden" />
            </label>
          </div>

          {pasteText.trim() && (
            <div className="space-y-3 pt-2">
              <h3 className="text-[13px] font-black text-blue-400 border-b border-white/5 pb-1">
                Anteprima dati estratti
              </h3>

              <div className="space-y-3">
                <OnboardingField
                  label="Nome Struttura *"
                  value={importForm.name}
                  onChange={(val) => setImportForm({ ...importForm, name: val })}
                  error={!confidence.name}
                />

                <OnboardingField
                  label="Città *"
                  value={importForm.city}
                  onChange={(val) => setImportForm({ ...importForm, city: val })}
                  error={!importForm.city}
                />

                <div className="flex gap-2">
                  <div className="flex-1">
                    <OnboardingField
                      label="Data Check-in (ISO) *"
                      value={importForm.startDate}
                      onChange={(val) => setImportForm({ ...importForm, startDate: val })}
                      placeholder="YYYY-MM-DD"
                      error={!importForm.startDate}
                    />
                  </div>
                  <div className="flex-1">
                    <OnboardingField
                      label="Data Check-out (ISO) *"
                      value={importForm.endDate}
                      onChange={(val) => setImportForm({ ...importForm, endDate: val })}
                      placeholder="YYYY-MM-DD"
                      error={!importForm.endDate}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <OnboardingField
                      label="Prezzo Totale (€)"
                      value={importForm.price}
                      onChange={(val) => setImportForm({ ...importForm, price: val })}
                      placeholder="es. 69.00"
                    />
                  </div>
                  <div className="flex-1">
                    <OnboardingField
                      label="Codice Prenotazione"
                      value={importForm.confirmationCode}
                      onChange={(val) => setImportForm({ ...importForm, confirmationCode: val })}
                      error={!confidence.confirmationCode}
                    />
                  </div>
                </div>

                <OnboardingField
                  label="Note / Ospiti"
                  value={importForm.note}
                  onChange={(val) => setImportForm({ ...importForm, note: val })}
                />
              </div>

              <div className="bg-amber-950/40 border border-amber-800/40 p-3 rounded-xl">
                <p className="text-[11px] text-amber-300 leading-normal">
                  ⚠️ <strong>Verifica i campi evidenziati.</strong> Il parsing potrebbe non essere accurato al 100%. Correggi eventuali errori prima di salvare.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-slate-950/50">
          <button
            onClick={handleConfirmImport}
            disabled={!importForm.name.trim() || !importForm.city.trim()}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[13.5px] rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-97 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-blue-500/20"
          >
            Conferma e Inizia Viaggio &rarr;
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// Sotto-componente di input per l'onboarding
function OnboardingField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>
        {error && <span className="text-[9px] text-amber-400 font-bold">⚠️ Non rilevato</span>}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-10 px-3 bg-white/5 border rounded-xl text-[12.5px] text-white focus:outline-none transition-colors ${
          error ? "border-amber-500/50 focus:border-amber-400" : "border-white/10 focus:border-blue-500"
        }`}
      />
    </div>
  );
}
