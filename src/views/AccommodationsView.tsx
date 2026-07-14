import { useState, useEffect, useRef } from "react";
import { ACCOMMODATIONS } from "../data/mockData";
import type { Accommodation, Transport } from "../data/mockData";
import { IcMapPin, IcChevronRight, IcPlus } from "../components/Icons";
import { repository } from "../services/repository";
import BookingVerificationView from "../components/BookingVerificationView";
import {
  getUnifiedBookings,
  detectOverlaps,
  detectDuplicates,
  detectGaps,
} from "../services/bookingService";
import { parseBookingText } from "../services/bookingParser";

// ── Form vuoto ────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: "",
  city: "",
  area: "",
  checkIn: "",
  checkOut: "",
  dates: "",
  note: "",
  mapsUrl: "",
  price: "",
};

// ── Bottom sheet per aggiungere alloggio ──────────────────────────────────────
function AddAccoSheet({
  onSave,
  onClose,
}: {
  onSave: (acc: Accommodation) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  function handleChange(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.city.trim()) return;
    const parsedPrice = parseFloat(form.price.replace(",", "."));
    const newAcc: Accommodation = {
      id: `acc-user-${Date.now()}`,
      name: form.name.trim(),
      city: form.city.trim(),
      area: form.area.trim() || undefined,
      checkIn: form.checkIn.trim(),
      checkOut: form.checkOut.trim(),
      dates: form.dates.trim() || `${form.checkIn} – ${form.checkOut}`,
      note: form.note.trim() || undefined,
      mapsUrl: form.mapsUrl.trim() || undefined,
      price: isNaN(parsedPrice) ? undefined : parsedPrice,
    };
    onSave(newAcc);
    onClose();
  }

  return (
    <div
      className="bottom-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-extrabold text-gray-900 mb-4">Nuovo alloggio</h2>

        <div className="space-y-3">
          <Field
            label="Nome struttura *"
            value={form.name}
            placeholder="es. Hotel Romolo"
            onChange={(v) => handleChange("name", v)}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <Field
                label="Città *"
                value={form.city}
                placeholder="es. Roma"
                onChange={(v) => handleChange("city", v)}
              />
            </div>
            <div className="flex-1">
              <Field
                label="Area / Quartiere"
                value={form.area}
                placeholder="es. Trastevere"
                onChange={(v) => handleChange("area", v)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field
                label="Check-in"
                value={form.checkIn}
                placeholder="es. 25 nov · 15:00"
                onChange={(v) => handleChange("checkIn", v)}
              />
            </div>
            <div className="flex-1">
              <Field
                label="Check-out"
                value={form.checkOut}
                placeholder="es. 27 nov · 11:00"
                onChange={(v) => handleChange("checkOut", v)}
              />
            </div>
          </div>
          <Field
            label="Date (etichetta)"
            value={form.dates}
            placeholder="es. 25 – 27 novembre"
            onChange={(v) => handleChange("dates", v)}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <Field
                label="Nota"
                value={form.note}
                placeholder="es. Colazione inclusa"
                onChange={(v) => handleChange("note", v)}
              />
            </div>
            <div className="flex-1">
              <Field
                label="Prezzo (€)"
                value={form.price}
                placeholder="es. 69.00"
                onChange={(v) => handleChange("price", v)}
              />
            </div>
          </div>
          <Field
            label="Link Maps"
            value={form.mapsUrl}
            placeholder="https://maps.google.com/..."
            onChange={(v) => handleChange("mapsUrl", v)}
          />
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-[14px]"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-semibold text-[14px]"
            onClick={handleSubmit}
            disabled={!form.name.trim() || !form.city.trim()}
            style={{ opacity: !form.name.trim() || !form.city.trim() ? 0.5 : 1 }}
          >
            Aggiungi
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Campo form ────────────────────────────────────────────────────────────────
function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-blue-400"
      />
    </div>
  );
}

// ── Card alloggio ─────────────────────────────────────────────────────────────
function AccoCard({ acc, onOpenDetail }: { acc: Accommodation; onOpenDetail: () => void }) {
  const mapsUrl = acc.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${acc.name}, ${acc.city}`)}`;
  
  return (
    <div 
      className="card overflow-hidden cursor-pointer hover:border-blue-300 transition-colors"
      onClick={onOpenDetail}
    >
      <div className="flex relative">
        {acc.imageUrl && (
          <img
            src={acc.imageUrl}
            alt={acc.name}
            className="w-[88px] h-[88px] object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1 p-3 min-w-0 pr-12">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-bold text-[14px] text-gray-900 leading-snug truncate">{acc.name}</p>
            {acc.status && (
              <span className={`text-[8.5px] px-1.5 py-0.2 rounded font-extrabold uppercase shrink-0 ${
                acc.status === "confermata" || acc.status === "confermato"
                  ? "bg-green-50 text-green-600 border border-green-100"
                  : "bg-amber-50 text-amber-600 border border-amber-100"
              }`}>
                {acc.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 mt-0.5 mb-1">
            <IcMapPin size={11} className="text-gray-400" />
            <p className="text-[12px] text-gray-400 truncate">
              {acc.area ? `${acc.area}, ${acc.city}` : acc.city}
            </p>
          </div>
          <p className="text-[12px] font-semibold text-gray-500">{acc.dates}</p>
          
          <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
            <div className="flex gap-1.5 flex-wrap">
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                In: {acc.checkIn}
              </span>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                Out: {acc.checkOut}
              </span>
            </div>
            {acc.price !== undefined && (
              <span className="text-[13px] font-extrabold text-blue-600 shrink-0">
                € {typeof acc.price === 'number' ? acc.price.toFixed(2) : acc.price}
              </span>
            )}
          </div>
        </div>

        {/* Right side buttons container */}
        <div className="absolute right-2 top-0 bottom-0 flex flex-col justify-center gap-2 items-center z-10">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Apri posizione su Google Maps"
            onClick={(e) => e.stopPropagation()}
            className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 active:scale-95 transition-all shadow-sm border border-blue-100"
          >
            <IcMapPin size={14} className="text-blue-600" />
          </a>
          <IcChevronRight size={15} className="text-gray-300 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

// ── Bottom sheet per i dettagli dell'alloggio ────────────────────────────────
function DetailAccoSheet({
  acc,
  onClose,
}: {
  acc: Accommodation;
  onClose: () => void;
}) {
  const mapsUrl = acc.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${acc.name}, ${acc.city}`)}`;
  
  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet-container" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        
        <div className="flex justify-between items-start gap-4 mb-3">
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-wider text-blue-500">Prenotazione Alloggio</span>
            <h2 className="text-[17px] font-extrabold text-gray-900 leading-snug truncate">{acc.name}</h2>
          </div>
          {acc.status && (
            <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase shrink-0 ${
              acc.status === "confermata" || acc.status === "confermato"
                ? "bg-green-50 text-green-600 border border-green-100"
                : "bg-amber-50 text-amber-600 border border-amber-100"
            }`}>
              {acc.status}
            </span>
          )}
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {acc.imageUrl && (
            <img 
              src={acc.imageUrl} 
              alt={acc.name} 
              className="w-full h-32 object-cover rounded-2xl border border-gray-100" 
            />
          )}

          <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-100 text-[12.5px]">
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase">Check-in</p>
              <p className="font-semibold text-gray-800">{acc.checkIn}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase">Check-out</p>
              <p className="font-semibold text-gray-800">{acc.checkOut}</p>
            </div>
            <div className="col-span-2 border-t border-gray-200/60 pt-2 mt-1">
              <p className="text-[9px] font-bold text-gray-400 uppercase">Date Soggiorno</p>
              <p className="font-semibold text-gray-800">{acc.dates}</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {acc.price !== undefined && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-[11px] text-gray-400 font-bold uppercase">Prezzo</span>
                <span className="text-[14px] font-black text-blue-600">
                  € {typeof acc.price === 'number' ? acc.price.toFixed(2) : acc.price}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-[11px] text-gray-400 font-bold uppercase">Colazione</span>
              <span className="text-[12px] font-semibold text-gray-700 text-right">
                {acc.breakfast || "Non specificata"}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-[11px] text-gray-400 font-bold uppercase">Città / Località</span>
              <span className="text-[12px] font-semibold text-gray-700">
                {acc.city}
              </span>
            </div>

            {acc.note && (
              <div className="py-2">
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Note aggiuntive</p>
                <div className="bg-blue-50/40 border border-blue-100/50 rounded-xl p-3 text-[12px] text-gray-600 leading-relaxed font-semibold">
                  {acc.note}
                </div>
              </div>
            )}
          </div>

          {/* Action button for Google Maps */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[13.5px] rounded-2xl shadow-lg shadow-blue-500/10 active:scale-98 transition-all"
          >
            <IcMapPin size={14} />
            Apri posizione su Google Maps
          </a>
        </div>

        <button
          className="w-full mt-3 py-2.5 rounded-2xl bg-gray-100 text-gray-500 font-bold text-[13px] border border-gray-200/50"
          onClick={onClose}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

// ── Main AccommodationsView ───────────────────────────────────────────────────
export default function AccommodationsView() {
  const [accos, setAccos] = useState<Accommodation[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [activeIssues, setActiveIssues] = useState<any[]>([]);
  const [selectedAcco, setSelectedAcco] = useState<Accommodation | null>(null);
  const [activeTab, setActiveTab] = useState<"tutti" | "nz" | "au_ph">("tutti");

  useEffect(() => {
    repository.getAccommodations(ACCOMMODATIONS)
      .then((data) => {
        if (data.length < ACCOMMODATIONS.length) {
          setAccos(ACCOMMODATIONS);
          repository.saveAccommodations(ACCOMMODATIONS);
        } else {
          setAccos(data);
        }
        isLoadedRef.current = true;
      })
      .catch((e) => console.error("Errore caricamento alloggi:", e))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    repository.getTransports([]).then((data) => setTransports(data));
  }, [accos]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setAccos(detail);
    };
    window.addEventListener("hrb_accommodations_change", handler as EventListener);
    return () => window.removeEventListener("hrb_accommodations_change", handler as EventListener);
  }, []);

  useEffect(() => {
    if (isLoadedRef.current) {
      repository.saveAccommodations(accos);
    }
  }, [accos]);

  // Rileva problemi per il banner
  useEffect(() => {
    async function checkIssues() {
      const tripStartDateStr = localStorage.getItem("hrb_departure_date") || "2026-11-28";
      const defaultDays = await repository.getTripDays([]);
      let tripEndDateStr = "2027-01-10";
      if (defaultDays.length > 0) {
        tripEndDateStr = defaultDays[defaultDays.length - 1].date;
      }

      const unified = getUnifiedBookings(accos, transports);
      const overlaps = detectOverlaps(unified);
      const duplicates = detectDuplicates(unified);
      const gaps = detectGaps(unified, tripStartDateStr, tripEndDateStr);

      const allIssues = [...overlaps, ...duplicates, ...gaps];
      const ignored = localStorage.getItem("hrb_ignored_issues");
      const ignoredKeys = ignored ? JSON.parse(ignored) : [];
      const active = allIssues.filter((iss) => !ignoredKeys.includes(iss.ignoredKey));
      setActiveIssues(active);
    }
    checkIssues();
  }, [accos, transports, showVerification]);

  function handleSave(acc: Accommodation) {
    setAccos((prev) => [...prev, acc]);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60dvh] gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-[12px] text-slate-500 font-semibold">Caricamento alloggi...</span>
      </div>
    );
  }

  const totalCost = accos.reduce((sum, acc) => sum + (acc.price || 0), 0);
  const totalNights = accos.length;

  const filteredAccos = accos.filter((acc) => {
    if (activeTab === "nz") return acc.area === "Europa & Nuova Zelanda";
    if (activeTab === "au_ph") return acc.area === "Australia & Filippine";
    return true;
  });

  return (
    <>
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-[24px] font-extrabold text-gray-900">Alloggi</h1>
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1 bg-blue-50 text-blue-600 text-[12.5px] font-bold px-2.5 py-2 rounded-xl"
              onClick={() => setShowImportSheet(true)}
            >
              📥 Importa
            </button>
            <button
              className="flex items-center gap-1.5 bg-blue-600 text-white text-[12.5px] font-semibold px-2.5 py-2 rounded-xl"
              onClick={() => setShowForm(true)}
            >
              <IcPlus size={15} />
              Aggiungi
            </button>
          </div>
        </div>

        <p className="text-[13px] text-gray-400 mb-4">
          {accos.length} strutture · tutto il viaggio ·{" "}
          <span
            className="text-blue-600 font-bold cursor-pointer"
            onClick={() => setShowVerification(true)}
          >
            Verifica coerenza
          </span>
        </p>

        {/* Statistiche alloggi */}
        <div className="grid grid-cols-2 gap-3 mb-4 bg-blue-50/50 border border-blue-100/50 p-3 rounded-2xl animate-fade-in">
          <div className="text-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase block animate-pulse">Spesa Totale</span>
            <span className="text-[15px] font-black text-blue-600">€ {totalCost.toFixed(2)}</span>
          </div>
          <div className="text-center border-l border-blue-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Strutture</span>
            <span className="text-[15px] font-black text-gray-705">{totalNights} alloggi</span>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-gray-100 p-1 rounded-xl mb-4 text-[12.5px] font-bold">
          <button
            onClick={() => setActiveTab("tutti")}
            className={`flex-1 py-1.5 text-center rounded-lg transition-all ${
              activeTab === "tutti" ? "bg-white text-gray-900 shadow-xs" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            Tutti
          </button>
          <button
            onClick={() => setActiveTab("nz")}
            className={`flex-1 py-1.5 text-center rounded-lg transition-all ${
              activeTab === "nz" ? "bg-white text-gray-900 shadow-xs" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            Europa & NZ
          </button>
          <button
            onClick={() => setActiveTab("au_ph")}
            className={`flex-1 py-1.5 text-center rounded-lg transition-all ${
              activeTab === "au_ph" ? "bg-white text-gray-900 shadow-xs" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            AU & Filippine
          </button>
        </div>

        {activeIssues.length > 0 && (
          <div
            onClick={() => setShowVerification(true)}
            className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between cursor-pointer animate-fade-in"
          >
            <div className="flex items-center gap-2">
              <span className="text-[18px]">⚠️</span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-extrabold text-amber-800">Verifica Prenotazioni</p>
                <p className="text-[11px] text-amber-600 truncate">
                  Rilevati {activeIssues.length} potenziali conflitti o notti vuote
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg shrink-0">
              Vedi
            </span>
          </div>
        )}

        <div className="space-y-3">
          {filteredAccos.map((acc) => (
            <AccoCard 
              key={acc.id} 
              acc={acc} 
              onOpenDetail={() => setSelectedAcco(acc)} 
            />
          ))}
        </div>
      </div>

      {selectedAcco && (
        <DetailAccoSheet acc={selectedAcco} onClose={() => setSelectedAcco(null)} />
      )}

      {showForm && (
        <AddAccoSheet onSave={handleSave} onClose={() => setShowForm(false)} />
      )}

      {showImportSheet && (
        <ImportBookingSheet onSave={handleSave} onClose={() => setShowImportSheet(false)} />
      )}

      {showVerification && (
        <BookingVerificationView onClose={() => setShowVerification(false)} />
      )}
    </>
  );
}

// ── Bottom sheet per importazione da Booking ──────────────────────────────────
function ImportBookingSheet({
  onSave,
  onClose,
}: {
  onSave: (acc: Accommodation) => void;
  onClose: () => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [form, setForm] = useState({
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

  function handleTextPasteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setPasteText(text);
    if (!text.trim()) return;

    const parsed = parseBookingText(text);
    setForm({
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

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setPasteText(text);
      const parsed = parseBookingText(text);
      setForm({
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

  function handleSubmit() {
    if (!form.name.trim() || !form.city.trim()) return;
    const priceVal = parseFloat(form.price.replace(",", "."));
    const sDate = form.startDate || form.checkIn;
    const eDate = form.endDate || form.checkOut;

    const newAcc: Accommodation = {
      id: `acc-booking-${Date.now()}`,
      name: form.name.trim(),
      city: form.city.trim(),
      checkIn: form.checkIn.trim(),
      checkOut: form.checkOut.trim(),
      dates: form.checkIn && form.checkOut ? `${form.checkIn} – ${form.checkOut}` : "Date da definire",
      note: form.note.trim() || undefined,
      price: isNaN(priceVal) ? undefined : priceVal,
      source: "booking",
      confirmationCode: form.confirmationCode.trim() || undefined,
      startDate: sDate,
      endDate: eDate,
      type: "hotel",
    };
    onSave(newAcc);
    onClose();
  }

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet-container" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-extrabold text-gray-900 mb-3">Importa da Booking.com</h2>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">
              Incolla il testo della mail o della conferma
            </label>
            <textarea
              rows={4}
              value={pasteText}
              onChange={handleTextPasteChange}
              placeholder="Incolla qui il testo copiato..."
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[12.5px] text-gray-905 placeholder:text-gray-300 outline-none focus:border-blue-400 font-mono resize-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <p className="text-[12px] font-bold text-gray-700">Carica file TXT/HTML/PDF</p>
              <p className="text-[10px] text-gray-400">Analizza testo da file</p>
            </div>
            <label className="bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-colors shrink-0">
              Scegli file
              <input type="file" onChange={handleFileUpload} accept=".txt,.html,.pdf" className="hidden" />
            </label>
          </div>

          {pasteText.trim() && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <p className="text-[12px] font-extrabold text-blue-600 uppercase tracking-wide">
                Verifica dati estratti
              </p>

              <div className="space-y-3">
                <FieldWithWarning
                  label="Nome Struttura *"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  warning={!confidence.name}
                />
                <FieldWithWarning
                  label="Città *"
                  value={form.city}
                  onChange={(v) => setForm({ ...form, city: v })}
                  warning={!form.city}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <FieldWithWarning
                      label="Check-in"
                      value={form.checkIn}
                      onChange={(v) => setForm({ ...form, checkIn: v })}
                      warning={!confidence.checkIn}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldWithWarning
                      label="Check-out"
                      value={form.checkOut}
                      onChange={(v) => setForm({ ...form, checkOut: v })}
                      warning={!confidence.checkOut}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <FieldWithWarning
                      label="Prezzo Totale (€)"
                      value={form.price}
                      onChange={(v) => setForm({ ...form, price: v })}
                      placeholder="es. 120.00"
                    />
                  </div>
                  <div className="flex-1">
                    <FieldWithWarning
                      label="Codice Conferma"
                      value={form.confirmationCode}
                      onChange={(v) => setForm({ ...form, confirmationCode: v })}
                      warning={!confidence.confirmationCode}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <FieldWithWarning
                      label="Data ISO Inizio (YYYY-MM-DD)"
                      value={form.startDate}
                      onChange={(v) => setForm({ ...form, startDate: v })}
                      placeholder="es. 2026-12-02"
                      warning={!form.startDate}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldWithWarning
                      label="Data ISO Fine (YYYY-MM-DD)"
                      value={form.endDate}
                      onChange={(v) => setForm({ ...form, endDate: v })}
                      placeholder="es. 2026-12-03"
                      warning={!form.endDate}
                    />
                  </div>
                </div>

                <FieldWithWarning
                  label="Note / Ospite"
                  value={form.note}
                  onChange={(v) => setForm({ ...form, note: v })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-[14px]"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-semibold text-[14px]"
            onClick={handleSubmit}
            disabled={!form.name.trim() || !form.city.trim()}
            style={{ opacity: !form.name.trim() || !form.city.trim() ? 0.5 : 1 }}
          >
            Importa
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Campo input con warning per Booking ───────────────────────────────────────
function FieldWithWarning({
  label,
  value,
  placeholder = "",
  onChange,
  warning,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  warning?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-semibold text-gray-500">{label}</label>
        {warning && <span className="text-[9px] text-amber-500 font-extrabold">⚠️ Controlla</span>}
      </div>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-gray-50 border rounded-xl px-3 py-2 text-[12.5px] text-gray-900 outline-none focus:border-blue-400 ${
          warning ? "border-amber-400/80" : "border-gray-200"
        }`}
      />
    </div>
  );
}
