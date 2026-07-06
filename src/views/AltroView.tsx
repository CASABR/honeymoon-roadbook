import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { INSURANCE, EMERGENCY_CONTACTS } from "../data/mockData";
import {
  IcNote, IcCheck, IcSettings, IcWallet,
  IcChevronRight, IcChevronDown, IcPlus,
} from "../components/Icons";

// ── Categorie Documento ───────────────────────────────────────────────────────
type DocumentCategory = "Passaporti" | "Visto Australia" | "Visto / eTravel Filippine" | "Patente internazionale" | "Assicurazione" | "Altri documenti";

const CATEGORIES: { name: DocumentCategory; icon: string }[] = [
  { name: "Passaporti", icon: "📄" },
  { name: "Visto Australia", icon: "🌏" },
  { name: "Visto / eTravel Filippine", icon: "🌴" },
  { name: "Patente internazionale", icon: "🚗" },
  { name: "Assicurazione", icon: "🛡️" },
  { name: "Altri documenti", icon: "📁" },
];

// ── Interfaccia documento ─────────────────────────────────────────────────────
interface DocumentItem {
  id: string;
  category: DocumentCategory;
  title: string;
  owner: string; // "Nunzio" | "Giusy" | "Entrambi"
  number: string;
  notes?: string;
  isMockDefault?: boolean; // Se vero, indica che è un reminder pre-caricato
}

const DEFAULT_DOCUMENTS: DocumentItem[] = [
  { id: "def-pass-n", category: "Passaporti", title: "Passaporto Nunzio", owner: "Nunzio", number: "Non compilato ⚠️", notes: "Verificare scadenza (valido almeno 6 mesi)", isMockDefault: true },
  { id: "def-pass-g", category: "Passaporti", title: "Passaporto Giusy", owner: "Giusy", number: "Non compilato ⚠️", notes: "Verificare scadenza (valido almeno 6 mesi)", isMockDefault: true },
  { id: "def-visa-au-n", category: "Visto Australia", title: "Visto Australia (eVisitor) Nunzio", owner: "Nunzio", number: "Non compilato ⚠️", notes: "Richiedere online prima di partire", isMockDefault: true },
  { id: "def-visa-au-g", category: "Visto Australia", title: "Visto Australia (eVisitor) Giusy", owner: "Giusy", number: "Non compilato ⚠️", notes: "Richiedere online prima di partire", isMockDefault: true },
  { id: "def-visa-ph-n", category: "Visto / eTravel Filippine", title: "Dichiarazione eTravel Filippine Nunzio", owner: "Nunzio", number: "Non compilato ⚠️", notes: "Da compilare nei 3 giorni precedenti l'arrivo", isMockDefault: true },
  { id: "def-visa-ph-g", category: "Visto / eTravel Filippine", title: "Dichiarazione eTravel Filippine Giusy", owner: "Giusy", number: "Non compilato ⚠️", notes: "Da compilare nei 3 giorni precedenti l'arrivo", isMockDefault: true },
  { id: "def-licence", category: "Patente internazionale", title: "Patente Internazionale Nunzio", owner: "Nunzio", number: "Non compilato ⚠️", notes: "Modello Convenzione di Ginevra 1949", isMockDefault: true },
  { id: "def-ins", category: "Assicurazione", title: "Polizza Heymondo", owner: "Entrambi", number: "HEY2101185", notes: "IMA Italia Assistance S.p.A.", isMockDefault: true }
];

const LS_DOCS_KEY = "hrb_documents_v2";

function loadDocuments(): DocumentItem[] {
  try {
    const raw = localStorage.getItem(LS_DOCS_KEY);
    if (raw) {
      let list = JSON.parse(raw) as DocumentItem[];
      
      // Sincronizzazione/Migrazione delle categorie per i vecchi dati privi di campo "category"
      list = list.map((doc) => {
        if (!doc.category) {
          const titleLower = doc.title.toLowerCase();
          const idLower = doc.id.toLowerCase();
          if (idLower.includes("pass") || titleLower.includes("passaporto")) {
            return { ...doc, category: "Passaporti" };
          } else if (idLower.includes("visa-au") || idLower.includes("au") || titleLower.includes("australia")) {
            return { ...doc, category: "Visto Australia" };
          } else if (idLower.includes("visa-ph") || idLower.includes("ph") || titleLower.includes("filippine") || titleLower.includes("etravel")) {
            return { ...doc, category: "Visto / eTravel Filippine" };
          } else if (idLower.includes("licence") || titleLower.includes("patente")) {
            return { ...doc, category: "Patente internazionale" };
          } else if (idLower.includes("ins") || titleLower.includes("assicurazione") || titleLower.includes("polizza")) {
            return { ...doc, category: "Assicurazione" };
          } else {
            return { ...doc, category: "Altri documenti" };
          }
        }
        return doc;
      });

      if (list.length === 0) {
        return DEFAULT_DOCUMENTS;
      }
      
      const merged = [...list];
      DEFAULT_DOCUMENTS.forEach((def) => {
        const exists = list.some(
          (d) => d.id === def.id || d.title.toLowerCase() === def.title.toLowerCase()
        );
        if (!exists) {
          merged.push(def);
        }
      });
      return merged;
    }
  } catch { /* ignore */ }
  return DEFAULT_DOCUMENTS;
}

function saveDocuments(list: DocumentItem[]) {
  try {
    localStorage.setItem(LS_DOCS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

// ── Accordion semplice ────────────────────────────────────────────────────────
function Accordion({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[14px] font-bold text-gray-900">{title}</span>
        <IcChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Row info ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-[10px] font-bold text-gray-400 uppercase shrink-0 pt-0.5 tracking-wider">{label}</span>
      <span className="text-[13px] text-gray-800 font-semibold text-right">{value}</span>
    </div>
  );
}

// ── Sheet per inserire documento ──────────────────────────────────────────────
function AddDocumentSheet({
  category,
  onSave,
  onClose,
}: {
  category: DocumentCategory;
  onSave: (doc: DocumentItem) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<DocumentItem["owner"]>("Nunzio");
  const [number, setNumber] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit() {
    if (!title.trim() || !number.trim()) return;
    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      category,
      title: title.trim(),
      owner,
      number: number.trim(),
      notes: notes.trim() || undefined,
    };
    onSave(newDoc);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center backdrop-blur-[2px]"
      style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-white rounded-t-[32px] p-5 pb-8 max-h-[85dvh] overflow-y-auto shadow-2xl border-t border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-black text-gray-900 mb-1">Aggiungi documento</h2>
        <p className="text-[12px] text-gray-400 mb-4">Categoria: {category}</p>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Nome Documento *</label>
            <input
              type="text"
              value={title}
              placeholder="es. Passaporto Nunzio, Visto Australia"
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1.5">Intestatario</label>
            <div className="flex gap-2">
              {(["Nunzio", "Giusy", "Entrambi"] as DocumentItem["owner"][]).map((o) => (
                <button
                  key={o}
                  onClick={() => setOwner(o)}
                  className={`flex-1 py-2 rounded-xl text-[12px] font-semibold transition-colors ${owner === o ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                    }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Numero / Codice *</label>
            <input
              type="text"
              value={number}
              placeholder="es. YA9876543, 168889..."
              onChange={(e) => setNumber(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">Note (opzionale)</label>
            <input
              type="text"
              value={notes}
              placeholder="es. Scadenza: 14 dic 2034"
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-[14px]"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="flex-1 py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-[14px]"
            onClick={handleSubmit}
            disabled={!title.trim() || !number.trim()}
            style={{ opacity: title.trim() && number.trim() ? 1 : 0.5 }}
          >
            Aggiungi
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sheet Dettaglio Categoria Documento ─────────────────────────────────────────
function CategoryDocumentsSheet({
  category,
  documents,
  onCompile,
  onDelete,
  onAddClick,
  onClose,
}: {
  category: DocumentCategory;
  documents: DocumentItem[];
  onCompile: (doc: DocumentItem) => void;
  onDelete: (id: string) => void;
  onAddClick: () => void;
  onClose: () => void;
}) {
  const filtered = documents.filter((d) => d.category === category);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-[2px]"
      style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-white rounded-t-[32px] p-5 pb-8 max-h-[85dvh] overflow-y-auto shadow-2xl border-t border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h2 className="text-[17px] font-black text-gray-900 mb-1">Dettaglio Categoria</h2>
        <p className="text-[12px] text-gray-400 mb-4">{category}</p>

        <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="text-[12px] text-gray-400 italic text-center py-6 bg-gray-50 rounded-xl">
              Nessun documento inserito in questa categoria.
            </p>
          ) : (
            filtered.map((doc) => (
              <div key={doc.id} className="bg-gray-50/70 border border-gray-100 rounded-xl p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-black text-gray-800 leading-snug">{doc.title}</span>
                    <span className="bg-gray-200/80 text-gray-600 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                      {doc.owner}
                    </span>
                  </div>
                  <p className={`text-[13px] font-mono mt-1 ${doc.isMockDefault && doc.number.includes("⚠️") ? "text-amber-600 font-bold" : "text-gray-700 font-semibold"}`}>
                    {doc.number}
                  </p>
                  {doc.notes && <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{doc.notes}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc.isMockDefault && doc.number.includes("⚠️") ? (
                    <button
                      onClick={() => onCompile(doc)}
                      className="text-[10px] bg-blue-50 text-blue-600 font-extrabold px-2 py-1 rounded-lg"
                    >
                      Compila
                    </button>
                  ) : (
                    <button
                      onClick={() => onDelete(doc.id)}
                      className="text-[11px] text-red-500 font-bold px-1 py-1"
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px]"
            onClick={onClose}
          >
            Chiudi
          </button>
          <button
            className="flex-1 py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-[14px] flex items-center justify-center gap-1.5"
            onClick={onAddClick}
          >
            <IcPlus size={14} />
            Aggiungi
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sezioni di navigazione mock (Note, Checklist, Impostazioni) ─────────────────
const NAV_ITEMS = [
  { label: "Note", desc: "Appunti e promemoria rapidi", info: "Funzionalità in arrivo. Usa la timeline per note locali." },
  { label: "Checklist", desc: "Cose da fare prima di partire", info: "Funzionalità in arrivo. Checklist bagaglio offline." },
  { label: "Impostazioni", desc: "Preferenze app e reset cache", info: "Honeymoon Roadbook v2.0. Funzionamento offline attivo." },
];

export default function AltroView() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentItem[]>(loadDocuments);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null);
  const [showAddDocCategory, setShowAddDocCategory] = useState<DocumentCategory | null>(null);
  const [activeInfoLabel, setActiveInfoLabel] = useState<string | null>(null);

  useEffect(() => {
    saveDocuments(documents);
  }, [documents]);

  function handleSaveDoc(newDoc: DocumentItem) {
    setDocuments((prev) => {
      // Se stiamo sovrascrivendo un default pre-compilato con lo stesso titolo
      const filtered = prev.filter((d) => !(d.isMockDefault && d.title.toLowerCase() === newDoc.title.toLowerCase()));
      return [...filtered, newDoc];
    });
  }

  function handleDeleteDoc(id: string) {
    if (window.confirm("Rimuovere questo documento?")) {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    }
  }

  function handleCompileDefault(defDoc: DocumentItem) {
    const val = window.prompt(`Inserisci il numero/codice per: ${defDoc.title}`, "");
    if (val === null) return;
    if (!val.trim()) return;

    setDocuments((prev) =>
      prev.map((d) =>
        d.id === defDoc.id
          ? { ...d, number: val.trim(), isMockDefault: false }
          : d
      )
    );
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <h1 className="text-[24px] font-extrabold text-gray-900">Altro</h1>

      {/* Navigazione rapida */}
      <div className="card divide-y divide-gray-50">
        <button
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50"
          onClick={() => navigate("/budgeter")}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-purple-50 border border-purple-100">
            <span className="text-purple-600"><IcWallet size={22} /></span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-gray-900">Budgeter</p>
            <p className="text-[12px] text-gray-400">Riepilogo spese viaggio</p>
          </div>
          <IcChevronRight size={15} className="text-gray-300 flex-shrink-0" />
        </button>

        {NAV_ITEMS.map((item) => (
          <div key={item.label} className="w-full">
            <button
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50"
              onClick={() => setActiveInfoLabel(activeInfoLabel === item.label ? null : item.label)}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-50 border border-gray-100">
                <span className="text-gray-500">
                  {item.label === "Note" ? <IcNote size={20} /> : item.label === "Checklist" ? <IcCheck size={20} /> : <IcSettings size={20} />}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-gray-900">{item.label}</p>
                <p className="text-[12px] text-gray-400">{item.desc}</p>
              </div>
              <IcChevronDown size={14} className={`text-gray-300 flex-shrink-0 transition-transform duration-200 ${activeInfoLabel === item.label ? "rotate-180 text-blue-500" : ""}`} />
            </button>
            {activeInfoLabel === item.label && (
              <div className="bg-blue-50/30 px-14 pb-3 pt-1 text-[11px] font-semibold text-blue-600 border-l-2 border-blue-400">
                {item.info}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Accordion 1: 📁 Documenti di viaggio (raggruppati per COSA) */}
      <Accordion title="📁 Documenti di viaggio">
        <div className="divide-y divide-gray-100">
          {CATEGORIES.map((cat) => {
            const count = documents.filter((d) => d.category === cat.name).length;
            return (
              <button
                key={cat.name}
                className="w-full flex items-center justify-between py-3 transition-colors hover:bg-gray-50/30 text-left"
                onClick={() => setSelectedCategory(cat.name)}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[18px]">{cat.icon}</span>
                  <span className="text-[13px] font-bold text-gray-800">{cat.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-semibold text-gray-400">
                    {count} {count === 1 ? "documento" : "documenti"}
                  </span>
                  <IcChevronRight size={14} className="text-gray-300" />
                </div>
              </button>
            );
          })}
        </div>
      </Accordion>

      {/* Accordion 2: Assicurazione — dati reali Heymondo (CHIUSO DI DEFAULT) */}
      <Accordion title="🛡️ Assicurazione Heymondo" defaultOpen={false}>
        <div className="space-y-0">
          <InfoRow label="Polizza" value={`${INSURANCE.brand} · ${INSURANCE.policyNumber}`} />
          <InfoRow label="Piano" value={INSURANCE.plan} />
          <InfoRow label="Assicurati" value={INSURANCE.insured} />
          <InfoRow label="Periodo" value={`${INSURANCE.startDate} – ${INSURANCE.endDate}`} />
          <InfoRow label="Copertura" value={INSURANCE.coverage} />
          <InfoRow label="Costo" value={INSURANCE.cost} />
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Coperture principali</p>
          <InfoRow label="Mediche" value={INSURANCE.medicalExpenses} />
          <InfoRow label="Bagagli" value={INSURANCE.luggage} />
          <InfoRow label="Ritardo volo" value={INSURANCE.flightDelay} />
          <InfoRow label="Resp. civile" value={INSURANCE.personalLiability} />
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Contatti rapidi</p>
          <div className="flex gap-2 flex-wrap">
            <a
              href={`tel:${INSURANCE.phone24h}`}
              className="flex-1 min-w-[120px] bg-blue-600 text-white text-[12px] font-semibold py-2.5 px-3 rounded-xl text-center shadow-md shadow-blue-200"
            >
              📞 Assistenza 24/7
            </a>
            <a
              href={`tel:${INSURANCE.phoneClaims}`}
              className="flex-1 min-w-[120px] bg-gray-100 text-gray-700 text-[12px] font-semibold py-2.5 px-3 rounded-xl text-center"
            >
              📋 Sinistri
            </a>
          </div>
          <a
            href={INSURANCE.claimsPortal}
            target="_blank"
            rel="noreferrer"
            className="block w-full text-center text-[12px] font-semibold text-blue-600 py-2 hover:underline"
          >
            Portale sinistri online →
          </a>
        </div>
      </Accordion>

      {/* Accordion 3: Emergenze per paese — dati reali */}
      <Accordion title="🚨 Numeri di emergenza">
        <div className="space-y-3">
          {EMERGENCY_CONTACTS.map((ec) => (
            <div key={ec.country} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-gray-900">{ec.country}</p>
                <a
                  href={`tel:${ec.number}`}
                  className="bg-red-500 text-white text-[12px] font-extrabold px-3 py-1 rounded-lg shadow-sm shadow-red-200"
                >
                  {ec.number}
                </a>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{ec.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
            <strong className="text-gray-700">Cosa fare se hai bisogno di assistenza medica:</strong><br />
            1. Chiama subito l'assistenza Heymondo: <span className="font-mono font-bold text-blue-600">{INSURANCE.phone24h}</span><br />
            2. Contatta la struttura prima di sostenere spese<br />
            3. Conserva tutti i documenti e le ricevute
          </p>
        </div>
      </Accordion>

      {/* Accordion 4: Bagagli e note operative */}
      <Accordion title="🧳 Bagagli e franchigie">
        <div className="space-y-2">
          <InfoRow label="Bluebridge (traghetto)" value="A mano: borsa piccola 7 kg + effetti personali · Principali in auto" />
          <InfoRow label="Cebu Pacific (Go Easy)" value="20 kg stiva a testa confermati" />
          <InfoRow label="PAL Express USU→CEB" value="15 kg stiva · Giusy: posto 06C" />
          <InfoRow label="China Airlines ritorno" value="Franchigia da verificare" />
        </div>
        <div className="mt-3 bg-amber-50/60 border border-amber-100/60 rounded-xl px-3 py-2.5">
          <p className="text-[11.5px] text-amber-700 font-semibold leading-relaxed">
            ⚠️ Segnala sempre peso e numero pezzi. Check-in Bluebridge: tassativo 1 ora prima (ore 11:30).
          </p>
        </div>
      </Accordion>

      {/* Accordion 5: Scadenze assicurazione */}
      <Accordion title="⏱ Scadenze e segnalazioni">
        <div className="space-y-3">
          {[
            { label: "Sinistri medici / viaggio", note: "Di norma entro 15 giorni dall'evento" },
            { label: "Bagagli", note: "Entro 15 giorni dal rientro" },
            { label: "Ritardo volo", note: "Entro 15 giorni dal rientro" },
            { label: "Annullamento", note: "Entro 5 giorni dall'evento, non oltre 24h dalla partenza" },
            { label: "Da conservare sempre", note: "Ricevute, rapporti PIR, certificati medici, n° polizza" },
          ].map((item) => (
            <div key={item.label} className="flex gap-2.5">
              <div className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-[13px] font-bold text-gray-900 leading-snug">{item.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Accordion>

      {/* Sheet Dettaglio Categoria */}
      {selectedCategory && (
        <CategoryDocumentsSheet
          category={selectedCategory}
          documents={documents}
          onCompile={handleCompileDefault}
          onDelete={handleDeleteDoc}
          onAddClick={() => {
            setShowAddDocCategory(selectedCategory);
            setSelectedCategory(null);
          }}
          onClose={() => setSelectedCategory(null)}
        />
      )}

      {/* Sheet Aggiunta Documento specifico */}
      {showAddDocCategory && (
        <AddDocumentSheet
          category={showAddDocCategory}
          onSave={handleSaveDoc}
          onClose={() => setShowAddDocCategory(null)}
        />
      )}

      <p className="text-center text-[10px] text-gray-400 mt-6 font-bold uppercase tracking-widest">
        Honeymoon Roadbook · NZ · AU · PH
      </p>
    </div>
  );
}
