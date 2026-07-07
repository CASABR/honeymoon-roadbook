import { useState, useEffect } from "react";
import { TRANSPORTS } from "../data/mockData";
import type { Transport } from "../data/mockData";
import { IcPlane, IcTrain, IcFerry, IcCar, IcChevronRight, IcPlus, IcQR } from "../components/Icons";

// ── localStorage persistence ──────────────────────────────────────────────────
const LS_KEY = "hrb_transports_v3";

function loadTransports(): Transport[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Transport[];
  } catch { /* ignore */ }
  return TRANSPORTS;
}

function saveTransports(list: Transport[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// ── Calcolo dettagli scalo (layover) ──────────────────────────────────────────
function getLayoverDetails(tr: Transport) {
  if (!tr.segments || tr.segments.length < 2) return null;
  
  const seg1 = tr.segments[0];
  const seg2 = tr.segments[1];
  
  try {
    const end = new Date(seg1.arrival.replace(" ", "T"));
    const start = new Date(seg2.departure.replace(" ", "T"));
    const diffMs = start.getTime() - end.getTime();
    
    if (diffMs > 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      
      const durationStr = `${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
      const isLong = hours >= 6; // utile per uscire se >= 6 ore
      
      return {
        city: tr.layoverCity || seg1.to,
        duration: durationStr,
        isLong,
        hours,
      };
    }
  } catch (e) { /* ignore */ }

  // Fallback statici basati sui dati reali
  if (tr.id === "tr-flight-mxp-akl") {
    return { city: "Pechino", duration: "18h 35m", isLong: true, hours: 18 };
  }
  if (tr.id === "tr-flight-syd-mnl") {
    return { city: "Manila", duration: "14h 40m", isLong: true, hours: 14 };
  }
  if (tr.id === "tr-flight-ceb-fco") {
    return { city: "Taipei", duration: "8h 30m", isLong: true, hours: 8 };
  }

  return null;
}

// ── Icons & labels ────────────────────────────────────────────────────────────
function TransportIcon({ type }: { type: Transport["type"] }) {
  const base = "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm";
  const map: Record<Transport["type"], { bg: string; el: React.ReactElement }> = {
    plane:    { bg: "bg-blue-50 border border-blue-100",   el: <IcPlane size={20} className="text-blue-600" /> },
    train:    { bg: "bg-indigo-50 border border-indigo-100", el: <IcTrain size={20} className="text-indigo-600" /> },
    ferry:    { bg: "bg-cyan-50 border border-cyan-100",   el: <IcFerry size={20} className="text-cyan-600" /> },
    car:      { bg: "bg-green-50 border border-green-100",  el: <IcCar size={20} className="text-green-600" /> },
    transfer: { bg: "bg-orange-50 border border-orange-100", el: <IcCar size={20} className="text-orange-600" /> },
    other:    { bg: "bg-gray-100 border border-gray-200",  el: <span className="text-lg">🚌</span> },
  };
  const { bg, el } = map[type] ?? map.other;
  return <div className={`${base} ${bg}`}>{el}</div>;
}

const TYPE_LABEL: Record<Transport["type"], string> = {
  plane: "Aereo", train: "Treno", ferry: "Traghetto", car: "Auto", transfer: "Transfer", other: "Altro",
};
const TYPE_OPTIONS: Transport["type"][] = ["plane", "train", "ferry", "car", "transfer", "other"];

// ── Dettaglio trasporto (bottom sheet) ────────────────────────────────────────
function TransportDetailSheet({
  tr,
  onClose,
  onEdit,
  onDelete,
  onSave,
}: {
  tr: Transport;
  onClose: () => void;
  onEdit: (tr: Transport) => void;
  onDelete: (id: string) => void;
  onSave: (tr: Transport) => void;
}) {
  // Gestione QR multipli
  const initialQrList = tr.qrCodes && tr.qrCodes.length > 0
    ? tr.qrCodes
    : tr.qrCodeData
    ? [tr.qrCodeData]
    : [];

  const [qrList, setQrList] = useState<string[]>(initialQrList);
  const [activeQrIdx, setActiveQrIdx] = useState(0);
  const [newQrText, setNewQrText] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);

  function handleAddQRDirect() {
    if (!newQrText.trim()) return;
    const updatedList = [...qrList, newQrText.trim()];
    setQrList(updatedList);
    setNewQrText("");
    setShowAddInput(false);
    setActiveQrIdx(updatedList.length - 1);

    const updatedTr = {
      ...tr,
      qrCodes: updatedList,
      qrCodeData: updatedList[0], // mantieni allineato per retrocompatibilità
    };
    onSave(updatedTr);
  }

  function handleDeleteQRDirect(idxToRemove: number) {
    const updatedList = qrList.filter((_, i) => i !== idxToRemove);
    setQrList(updatedList);
    setActiveQrIdx(Math.max(0, updatedList.length - 1));

    const updatedTr = {
      ...tr,
      qrCodes: updatedList.length > 0 ? updatedList : undefined,
      qrCodeData: updatedList.length > 0 ? updatedList[0] : undefined,
    };
    onSave(updatedTr);
  }

  function handleFileAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3.5 * 1024 * 1024) {
      alert("File troppo grande (max 3.5 MB). Gli allegati sono salvati nel browser locale.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const updatedList = [...qrList, dataUrl];
      setQrList(updatedList);
      setShowAddInput(false);
      setActiveQrIdx(updatedList.length - 1);

      const updatedTr = {
        ...tr,
        qrCodes: updatedList,
        qrCodeData: updatedList[0],
      };
      onSave(updatedTr);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-[2px]"
      style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-white/95 rounded-t-[32px] p-5 pb-8 max-h-[88dvh] overflow-y-auto shadow-2xl border-t border-gray-100 backdrop-blur-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <TransportIcon type={tr.type} />
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold tracking-widest text-blue-600/80 uppercase mb-0.5">
                {TYPE_LABEL[tr.type]} · {tr.dateLabel}
              </p>
              <h2 className="text-[17px] font-black text-gray-900 leading-snug">
                {tr.from} → {tr.to}
              </h2>
              {tr.status && (
                <span className="badge-in-corso mt-1 inline-block bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold px-2 py-0.5 rounded-full text-[10px]">
                  {tr.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Informazioni principali */}
        <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-4 space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-2.5">
            <DetailRow label="Data" value={tr.date} />
            <DetailRow label="Orario" value={`${tr.time}${tr.arrivalTime ? ` → ${tr.arrivalTime}` : ""}`} />
          </div>

          {tr.carrierCode && <DetailRow label="N° Volo / Tratta" value={tr.carrierCode} mono />}
          {tr.airline && <DetailRow label="Compagnia / Operatore" value={tr.airline} />}
          {tr.bookingRef && <DetailRow label="Codice Prenotazione (PIR / Ref)" value={tr.bookingRef} mono />}
          {tr.confirmationCode && <DetailRow label="Codice Biglietto" value={tr.confirmationCode} mono />}
          {tr.duration && <DetailRow label="Durata" value={tr.duration} />}
        </div>

        {/* Terminal / Gate / Posto */}
        {(tr.terminal || tr.gate || tr.seat) && (
          <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-4 space-y-3 mb-4">
            <div className="grid grid-cols-3 gap-2.5">
              {tr.terminal && <DetailRow label="Terminal" value={tr.terminal} />}
              {tr.gate && <DetailRow label="Gate" value={tr.gate} />}
              {tr.seat && <DetailRow label="Posto" value={tr.seat} mono />}
            </div>
          </div>
        )}

        {/* Info Bagaglio */}
        {(tr.baggageHand || tr.baggageCabin || tr.baggageExtra || tr.baggageNote) && (
          <div className="bg-blue-50/30 border border-blue-100/60 rounded-2xl p-4 space-y-2.5 mb-4">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Franchigia Bagagli</p>
            {tr.baggageHand && <DetailRow label="Bagaglio a mano" value={tr.baggageHand} />}
            {tr.baggageCabin && <DetailRow label="Bagaglio in stiva" value={tr.baggageCabin} />}
            {tr.baggageExtra && <DetailRow label="Bagaglio extra" value={tr.baggageExtra} />}
            {tr.baggageNote && <DetailRow label="Note bagaglio" value={tr.baggageNote} />}
          </div>
        )}

        {/* Note e Dettagli */}
        {(tr.detail || tr.note || tr.importantNote) && (
          <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-4 space-y-2.5 mb-4">
            {tr.detail && <DetailRow label="Info Tratta" value={tr.detail} />}
            {tr.note && <DetailRow label="Note" value={tr.note} />}
            {tr.importantNote && (
              <div className="pt-2 border-t border-gray-200">
                <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Importante</p>
                <p className="text-[13px] text-amber-800 font-medium">{tr.importantNote}</p>
              </div>
            )}
          </div>
        )}

        {/* Segmenti volo con scalo */}
        {tr.segments && tr.segments.length > 1 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">Dettaglio Segmenti e Scali</p>
            
            {/* Box scalo in evidenza */}
            {(() => {
              const layover = getLayoverDetails(tr);
              if (!layover) return null;
              return (
                <div className={`mb-3 p-3.5 rounded-2xl border text-[12px] ${
                  layover.isLong
                    ? "bg-amber-50 border-amber-200 text-amber-900 shadow-sm"
                    : "bg-gray-50 border-gray-200 text-gray-800"
                }`}>
                  <p className={`text-[9px] font-black uppercase tracking-wider mb-1 ${layover.isLong ? "text-amber-700" : "text-gray-500"}`}>
                    {layover.isLong ? "⚠️ Scalo Lungo Rilevato" : "✈️ Info Scalo"}
                  </p>
                  <p className="font-extrabold text-[13px] leading-snug">
                    Scalo a {layover.city} &middot; Durata: {layover.duration}
                  </p>
                  {layover.isLong ? (
                    <p className="text-[11px] text-amber-800/90 mt-1 font-medium leading-relaxed">
                      Con uno scalo di <strong>{layover.duration}</strong> a {layover.city}, puoi uscire dall'aeroporto sfruttando il transito senza visto! Ideale per fare un giro veloce in città.
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 mt-1 font-medium">
                      Scalo breve ({layover.duration}). Rimani nell'area partenze per il volo successivo.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="space-y-2">
              {tr.segments.map((seg, i) => (
                <div key={i} className="bg-blue-50/80 border border-blue-100/60 rounded-xl px-3 py-2.5">
                  <p className="text-[13px] font-bold text-gray-900">{seg.from} → {seg.to}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {seg.operator}{seg.flightNumber ? ` · ${seg.flightNumber}` : ""}
                    {" · "}{seg.departure.split(" ")[1]} → {seg.arrival.split(" ")[1]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Riferimenti QR / Biglietti Gestibili */}
        <div className="bg-gray-50/80 border border-gray-100 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <IcQR size={20} className="text-gray-500" />
              <span className="text-[12px] font-bold text-gray-800">Biglietti / QR Code</span>
            </div>
            <button
              onClick={() => setShowAddInput(!showAddInput)}
              className="text-[11px] bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded-lg transition-transform hover:scale-105 active:scale-95"
            >
              {showAddInput ? "Annulla" : "+ Aggiungi"}
            </button>
          </div>

          {showAddInput && (
            <div className="space-y-3 mb-3 bg-white p-3 rounded-xl border border-gray-200">
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">Codice / Testo QR</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newQrText}
                    placeholder="Codice, link o PNR"
                    onChange={(e) => setNewQrText(e.target.value)}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-900 outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={handleAddQRDirect}
                    disabled={!newQrText.trim()}
                    className="bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-lg text-[12px] shrink-0"
                    style={{ opacity: newQrText.trim() ? 1 : 0.5 }}
                  >
                    Salva
                  </button>
                </div>
              </div>
              
              <div className="border-t border-gray-100 pt-2 flex flex-col items-center">
                <span className="text-[9px] font-bold text-gray-400 mb-2">— OPPURE —</span>
                <label className="w-full cursor-pointer bg-gray-100 text-gray-700 text-[12px] font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors">
                  📎 Carica Foto / PDF
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileAttachmentUpload}
                  />
                </label>
              </div>
            </div>
          )}

          {qrList.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-150 p-3 flex flex-col items-center shadow-inner">
              {/* Stepper di scorrimento */}
              {qrList.length > 1 && (
                <div className="flex items-center justify-between w-full mb-3 text-[12px] font-semibold text-gray-500">
                  <button
                    onClick={() => setActiveQrIdx((prev) => (prev > 0 ? prev - 1 : qrList.length - 1))}
                    className="p-1 text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    ◀
                  </button>
                  <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">
                    Biglietto {activeQrIdx + 1} di {qrList.length}
                  </span>
                  <button
                    onClick={() => setActiveQrIdx((prev) => (prev < qrList.length - 1 ? prev + 1 : 0))}
                    className="p-1 text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    ▶
                  </button>
                </div>
              )}

              {/* QR visualizzato */}
              <div className="w-full text-center py-3 bg-gray-50 rounded-lg border border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden">
                {qrList[activeQrIdx].startsWith("data:image/") ? (
                  <img
                    src={qrList[activeQrIdx]}
                    alt={`Biglietto ${activeQrIdx + 1}`}
                    className="w-full max-h-48 object-contain rounded-lg"
                  />
                ) : qrList[activeQrIdx].startsWith("data:application/pdf") ? (
                  <a
                    href={qrList[activeQrIdx]}
                    download={`biglietto-${activeQrIdx + 1}.pdf`}
                    className="flex flex-col items-center justify-center p-4 bg-red-50 border border-red-150 rounded-xl hover:bg-red-100 transition-colors w-11/12"
                  >
                    <span className="text-[28px]">📄</span>
                    <span className="text-[11px] text-red-600 font-bold mt-1">Scarica PDF Allegato</span>
                  </a>
                ) : (
                  <>
                    <IcQR size={40} className="text-blue-500 opacity-95 mb-1.5" />
                    <p className="text-[12px] font-mono break-all px-4 text-gray-700 font-semibold">{qrList[activeQrIdx]}</p>
                  </>
                )}
              </div>

              {/* Azioni sul QR attivo */}
              <button
                onClick={() => {
                  if (window.confirm("Rimuovere questo QR code?")) {
                    handleDeleteQRDirect(activeQrIdx);
                  }
                }}
                className="text-[10px] text-red-500 font-bold mt-2 hover:underline"
              >
                Rimuovi questo biglietto
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic text-center py-2 bg-white rounded-xl border border-dashed border-gray-200">
              Nessun biglietto o QR code ancora associato. Aggiungilo per averlo offline.
            </p>
          )}
        </div>

        {/* Info Fonte */}
        <p className="text-[10px] text-gray-400 text-center mb-5 italic">
          Fonte dati: {tr.source === "gmail" ? "Gmail (Importazione)" : tr.source === "google_calendar" ? "Google Calendar" : tr.source === "imported" ? "Vecchio roadbook" : "Inserimento manuale"}
        </p>

        {/* Azioni */}
        <div className="flex gap-2">
          <button
            className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px]"
            onClick={onClose}
          >
            Chiudi
          </button>
          <button
            className="flex-1 py-3.5 rounded-2xl bg-blue-50 text-blue-600 font-semibold text-[14px]"
            onClick={() => {
              onEdit(tr);
              onClose();
            }}
          >
            Modifica
          </button>
          <button
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-red-50 text-red-500 font-semibold transition-transform hover:scale-105 active:scale-95"
            onClick={() => {
              if (window.confirm("Eliminare questa tratta?")) {
                onDelete(tr.id);
                onClose();
              }
            }}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">{label}</p>
      <p className={`text-[13px] text-gray-800 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ── Campo form ────────────────────────────────────────────────────────────────
function Field({ label, value, placeholder, onChange }: {
  label: string; value: string; placeholder: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 block mb-1">{label}</label>
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-blue-400 transition-colors focus:bg-white"
      />
    </div>
  );
}

// ── Form unico Aggiunta/Modifica Trasporto ────────────────────────────────────
function TransportFormSheet({
  tr,
  onSave,
  onClose,
}: {
  tr?: Transport | null;
  onSave: (tr: Transport) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<Transport["type"]>(tr?.type || "plane");
  const [date, setDate] = useState(tr?.date || "");
  const [dateLabel, setDateLabel] = useState(tr?.dateLabel || "");
  const [time, setTime] = useState(tr?.time || "");
  const [arrivalTime, setArrivalTime] = useState(tr?.arrivalTime || "");
  const [from, setFrom] = useState(tr?.from || "");
  const [to, setTo] = useState(tr?.to || "");
  const [detail, setDetail] = useState(tr?.detail || "");
  const [note, setNote] = useState(tr?.note || "");
  const [importantNote, setImportantNote] = useState(tr?.importantNote || "");

  // Campi extra
  const [bookingRef, setBookingRef] = useState(tr?.bookingRef || "");
  const [confirmationCode, setConfirmationCode] = useState(tr?.confirmationCode || "");
  const [carrierCode, setCarrierCode] = useState(tr?.carrierCode || "");
  const [airline, setAirline] = useState(tr?.airline || "");
  const [duration, setDuration] = useState(tr?.duration || "");
  const [terminal, setTerminal] = useState(tr?.terminal || "");
  const [gate, setGate] = useState(tr?.gate || "");
  const [seat, setSeat] = useState(tr?.seat || "");
  const [baggageHand, setBaggageHand] = useState(tr?.baggageHand || "");
  const [baggageCabin, setBaggageCabin] = useState(tr?.baggageCabin || "");
  const [baggageExtra, setBaggageExtra] = useState(tr?.baggageExtra || "");
  const [price, setPrice] = useState(tr?.price ? String(tr.price) : "");
  
  // Per più QR separati da virgole
  const initialQrText = tr?.qrCodes && tr.qrCodes.length > 0
    ? tr.qrCodes.join(", ")
    : tr?.qrCodeData || "";
  const [qrCodeData, setQrCodeData] = useState(initialQrText);
  
  const [status, setStatus] = useState(tr?.status || "Confermato");

  function handleSubmit() {
    if (!from.trim() || !to.trim() || !date.trim()) return;

    // Elabora QR multipli separati da virgole
    const qrCodesArray = qrCodeData.trim()
      ? qrCodeData.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const parsedPrice = parseFloat(price.replace(",", "."));
    
    const updatedTr: Transport = {
      id: tr?.id || `tr-user-${Date.now()}`,
      date: date.trim(),
      dateLabel: dateLabel.trim() || date,
      time: time.trim(),
      arrivalTime: arrivalTime.trim() || undefined,
      from: from.trim(),
      to: to.trim(),
      type,
      detail: detail.trim() || undefined,
      note: note.trim() || undefined,
      importantNote: importantNote.trim() || undefined,
      bookingRef: bookingRef.trim() || undefined,
      confirmationCode: confirmationCode.trim() || undefined,
      carrierCode: carrierCode.trim() || undefined,
      airline: airline.trim() || undefined,
      duration: duration.trim() || undefined,
      terminal: terminal.trim() || undefined,
      gate: gate.trim() || undefined,
      seat: seat.trim() || undefined,
      baggageHand: baggageHand.trim() || undefined,
      baggageCabin: baggageCabin.trim() || undefined,
      baggageExtra: baggageExtra.trim() || undefined,
      qrCodeData: qrCodesArray.length > 0 ? qrCodesArray[0] : undefined,
      qrCodes: qrCodesArray.length > 0 ? qrCodesArray : undefined,
      price: isNaN(parsedPrice) ? undefined : parsedPrice,
      status: status.trim() || undefined,
      segments: tr?.segments, 
      layoverCity: tr?.layoverCity,
      source: tr?.source || "manual",
    };
    onSave(updatedTr);
    onClose();
  }

  const valid = from.trim() && to.trim() && date.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-[2px]"
      style={{ background: "rgba(0,0,0,0.3)" }} onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-[32px] p-5 pb-8 max-h-[90dvh] overflow-y-auto shadow-2xl border-t border-gray-100"
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-black text-gray-900 mb-4">
          {tr ? "Modifica trasporto" : "Nuovo trasporto"}
        </h2>

        {/* Tipo mezzo */}
        <div className="mb-3">
          <label className="text-[11px] font-semibold text-gray-500 block mb-1.5">Tipo mezzo</label>
          <div className="flex gap-2 flex-wrap">
            {TYPE_OPTIONS.map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
                  type === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                }`}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Sezione 1: Principali */}
          <div className="bg-gray-50/70 border border-gray-100 p-3 rounded-2xl space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Dati principali</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label="Data (YYYY-MM-DD) *" value={date} placeholder="2026-11-28" onChange={setDate} />
              </div>
              <div className="flex-1">
                <Field label="Orario partenza" value={time} placeholder="11:05" onChange={setTime} />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label="Etichetta data" value={dateLabel} placeholder="es. Sab 28 nov" onChange={setDateLabel} />
              </div>
              <div className="flex-1">
                <Field label="Orario arrivo" value={arrivalTime} placeholder="14:15" onChange={setArrivalTime} />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label="Da *" value={from} placeholder="es. Roma Termini" onChange={setFrom} />
              </div>
              <div className="flex-1">
                <Field label="A *" value={to} placeholder="es. Milano" onChange={setTo} />
              </div>
            </div>
            <Field label="Dettaglio tratta veloce" value={detail} placeholder="es. Treno Frecciarossa" onChange={setDetail} />
          </div>

          {/* Sezione 2: Info Volo / Compagnia */}
          <div className="bg-gray-50/70 border border-gray-100 p-3 rounded-2xl space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Compagnia e codici</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label="Compagnia / Airline" value={airline} placeholder="es. Air China" onChange={setAirline} />
              </div>
              <div className="flex-1">
                <Field label="N° Volo / Tratta" value={carrierCode} placeholder="es. CA950" onChange={setCarrierCode} />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label="Cod. Prenotazione" value={bookingRef} placeholder="es. HEY2101" onChange={setBookingRef} />
              </div>
              <div className="flex-1">
                <Field label="Codice Biglietto" value={confirmationCode} placeholder="es. 16888..." onChange={setConfirmationCode} />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label="Durata" value={duration} placeholder="es. 1h 55m" onChange={setDuration} />
              </div>
              <div className="flex-1">
                <Field label="Prezzo (€)" value={price} placeholder="es. 355.96" onChange={setPrice} />
              </div>
            </div>
            <div>
              <Field label="Stato Tratta" value={status} placeholder="es. Confermato" onChange={setStatus} />
            </div>
          </div>

          {/* Sezione 3: Terminal / Gate / Posto */}
          <div className="bg-gray-50/70 border border-gray-100 p-3 rounded-2xl space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Terminal & Posto</p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Terminal" value={terminal} placeholder="es. T1" onChange={setTerminal} />
              <Field label="Gate" value={gate} placeholder="es. A12" onChange={setGate} />
              <Field label="Posto" value={seat} placeholder="es. 06C" onChange={setSeat} />
            </div>
          </div>

          {/* Sezione 4: Bagagli */}
          <div className="bg-blue-50/30 border border-blue-100 p-3 rounded-2xl space-y-3">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Franchigia bagagli</p>
            <Field label="Bagaglio a mano" value={baggageHand} placeholder="es. 1 zaino max 8kg" onChange={setBaggageHand} />
            <Field label="Bagaglio stiva" value={baggageCabin} placeholder="es. 1 valigia max 23kg" onChange={setBaggageCabin} />
            <Field label="Bagaglio extra" value={baggageExtra} placeholder="es. Attrezzatura sportiva" onChange={setBaggageExtra} />
          </div>

          {/* Sezione 5: Note e QR */}
          <div className="bg-gray-50/70 border border-gray-100 p-3 rounded-2xl space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Note e Documenti</p>
            <Field label="Nota generale" value={note} placeholder="es. Bagaglio a mano incluso" onChange={setNote} />
            <Field label="Nota importante (evidenziata)" value={importantNote} placeholder="es. Check-in 1 ora prima!" onChange={setImportantNote} />
            <Field label="QR Code (separati da virgola)" value={qrCodeData} placeholder="es. Biglietto 1, Biglietto 2" onChange={setQrCodeData} />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-[14px]" onClick={onClose}>Annulla</button>
          <button className="flex-1 py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-[14px]"
            onClick={handleSubmit} disabled={!valid} style={{ opacity: valid ? 1 : 0.5 }}>
            {tr ? "Salva modifiche" : "Aggiungi"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Card trasporto ────────────────────────────────────────────────────────────
function TransportCard({ tr, onSelect }: { tr: Transport; onSelect: (t: Transport) => void }) {
  const layover = getLayoverDetails(tr);

  return (
    <button className="card p-3.5 w-full text-left transition-all hover:scale-[1.01] active:scale-[0.99] border border-gray-100 shadow-sm" onClick={() => onSelect(tr)}>
      <div className="flex items-start gap-3">
        <TransportIcon type={tr.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold tracking-widest text-blue-600 uppercase">{TYPE_LABEL[tr.type]}</span>
            <span className="text-[10px] text-gray-300">·</span>
            <span className="text-[11px] text-gray-400 font-medium">{tr.dateLabel}</span>
            {tr.status && (
              <span className="badge-in-corso ml-auto bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full text-[9px] border border-emerald-100">
                {tr.status}
              </span>
            )}
          </div>
          <p className="font-black text-[15px] text-gray-900 leading-snug">
            {tr.from}<span className="text-gray-300 font-normal mx-1">→</span>{tr.to}
          </p>
          <p className="text-[12px] text-gray-500 mt-0.5 font-medium">
            {tr.time && `${tr.time} · `}{tr.detail || (tr.airline ? `${tr.airline} ${tr.carrierCode || ""}` : "")}
          </p>
          {tr.importantNote && (
            <p className="text-[11px] text-amber-600 mt-1 truncate font-semibold">⚠️ {tr.importantNote}</p>
          )}

          {layover && (
            <div className={`mt-2 px-2 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 ${
              layover.isLong
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-gray-50 border-gray-200 text-gray-650"
            }`}>
              <span>✈️</span>
              <span>
                Scalo a <strong className="font-bold">{layover.city}</strong> ({layover.duration})
                {layover.isLong && " · 🚶‍♂️ Consigliato per uscire!"}
              </span>
            </div>
          )}
        </div>
        <IcChevronRight size={16} className="text-gray-300 mt-1 flex-shrink-0" />
      </div>
    </button>
  );
}

// ── Main TransportsView ───────────────────────────────────────────────────────
export default function TransportsView() {
  const [transports, setTransports] = useState<Transport[]>(loadTransports);
  const [formState, setFormState] = useState<{ show: boolean; tr: Transport | null }>({ show: false, tr: null });
  const [selected, setSelected] = useState<Transport | null>(null);

  useEffect(() => { saveTransports(transports); }, [transports]);

  function handleSave(tr: Transport) {
    setTransports((prev) => {
      const exists = prev.some((item) => item.id === tr.id);
      let next: Transport[];
      if (exists) {
        next = prev.map((item) => (item.id === tr.id ? tr : item));
      } else {
        next = [...prev, tr];
      }
      next.sort((a, b) => `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`));
      return next;
    });
    // Se la scheda dettaglio è aperta, la aggiorniamo per riflettere le modifiche (QR compresi)
    if (selected && selected.id === tr.id) {
      setSelected(tr);
    }
    setFormState({ show: false, tr: null });
  }

  function handleDelete(id: string) {
    setTransports((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <>
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[24px] font-extrabold text-gray-900">Trasporti</h1>
          <button
            className="flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold px-3 py-2 rounded-xl transition-all hover:bg-blue-700 hover:scale-105 active:scale-95 shadow-md shadow-blue-200"
            onClick={() => setFormState({ show: true, tr: null })}
          >
            <IcPlus size={15} />
            Aggiungi
          </button>
        </div>
        <p className="text-[13px] text-gray-400 mb-5 font-medium">{transports.length} tratte · ordine cronologico</p>
        <div className="space-y-3">
          {transports.map((tr) => (
            <TransportCard key={tr.id} tr={tr} onSelect={setSelected} />
          ))}
        </div>
      </div>

      {selected && (
        <TransportDetailSheet
          tr={selected}
          onClose={() => setSelected(null)}
          onEdit={(trToEdit) => setFormState({ show: true, tr: trToEdit })}
          onDelete={handleDelete}
          onSave={handleSave}
        />
      )}

      {formState.show && (
        <TransportFormSheet
          tr={formState.tr}
          onSave={handleSave}
          onClose={() => setFormState({ show: false, tr: null })}
        />
      )}
    </>
  );
}
