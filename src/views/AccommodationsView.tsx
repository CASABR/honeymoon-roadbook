import { useState, useEffect, useRef } from "react";
import { ACCOMMODATIONS } from "../data/mockData";
import type { Accommodation } from "../data/mockData";
import { IcMapPin, IcChevronRight, IcPlus } from "../components/Icons";
import { repository } from "../services/repository";

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
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 pb-8 max-h-[90dvh] overflow-y-auto"
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
function AccoCard({ acc }: { acc: Accommodation }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex">
        {acc.imageUrl && (
          <img
            src={acc.imageUrl}
            alt={acc.name}
            className="w-[88px] h-[88px] object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1 p-3 min-w-0">
          <p className="font-bold text-[14px] text-gray-900 leading-snug">{acc.name}</p>
          <div className="flex items-center gap-0.5 mt-0.5 mb-1">
            <IcMapPin size={11} className="text-gray-400" />
            <p className="text-[12px] text-gray-400">
              {acc.area ? `${acc.area}, ${acc.city}` : acc.city}
            </p>
          </div>
          <p className="text-[12px] font-semibold text-gray-500">{acc.dates}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            <span className="text-[10.5px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
              In: {acc.checkIn}
            </span>
            <span className="text-[10.5px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
              Out: {acc.checkOut}
            </span>
          </div>
          {acc.note && (
            <p className="text-[11px] text-blue-500 mt-1.5 font-medium">{acc.note}</p>
          )}
        </div>
        <div className="flex items-center pr-3">
          <IcChevronRight size={15} className="text-gray-300" />
        </div>
      </div>
      {acc.mapsUrl && (
        <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-center gap-1.5">
          <IcMapPin size={13} className="text-blue-600" />
          <a
            href={acc.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-semibold text-blue-600"
          >
            Apri su Maps
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main AccommodationsView ───────────────────────────────────────────────────
export default function AccommodationsView() {
  const [accos, setAccos] = useState<Accommodation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    repository.getAccommodations(ACCOMMODATIONS).then((data) => {
      setAccos(data);
      isLoadedRef.current = true;
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (isLoadedRef.current) {
      repository.saveAccommodations(accos);
    }
  }, [accos]);

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

  return (
    <>
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[24px] font-extrabold text-gray-900">Alloggi</h1>
          <button
            className="flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold px-3 py-2 rounded-xl"
            onClick={() => setShowForm(true)}
          >
            <IcPlus size={15} />
            Aggiungi
          </button>
        </div>
        <p className="text-[13px] text-gray-400 mb-5">
          {accos.length} strutture · tutto il viaggio
        </p>

        <div className="space-y-3">
          {accos.map((acc) => (
            <AccoCard key={acc.id} acc={acc} />
          ))}
        </div>
      </div>

      {showForm && (
        <AddAccoSheet onSave={handleSave} onClose={() => setShowForm(false)} />
      )}
    </>
  );
}
