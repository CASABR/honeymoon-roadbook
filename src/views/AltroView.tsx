import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { INSURANCE, EMERGENCY_CONTACTS } from "../data/mockData";
import {
  IcNote, IcSettings, IcWallet,
  IcChevronRight, IcChevronDown, IcPlus,
} from "../components/Icons";
import { repository } from "../services/repository";
import type { Checklist, DocumentItem, AttachmentItem, ChecklistItem } from "../services/repository";

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



// ── Accordion semplice ───────────────────────────────────────────────────────────────────
function Accordion({ title, children, defaultOpen = false, isOpen, onToggle }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  // Props controllati opzionali: se forniti, il componente opera in modalità controllata
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  // Usa props controllati se forniti, altrimenti stato locale
  const open = isOpen !== undefined ? isOpen : localOpen;
  const handleToggle = onToggle ?? (() => setLocalOpen((o) => !o));
  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50"
        onClick={handleToggle}
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
      className="bottom-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-container"
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
  onAttachmentAdd,
  onAttachmentDelete,
  onClose,
}: {
  category: DocumentCategory;
  documents: DocumentItem[];
  onCompile: (doc: DocumentItem) => void;
  onDelete: (id: string) => void;
  onAddClick: () => void;
  onAttachmentAdd: (docId: string, att: AttachmentItem) => void;
  onAttachmentDelete: (docId: string, attId: string) => void;
  onClose: () => void;
}) {
  const filtered = documents.filter((d) => d.category === category);
  const [previewAtt, setPreviewAtt] = useState<AttachmentItem | null>(null);

  function handleFileUpload(docId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Limite: avviso se il file supera 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert("File troppo grande (max 10 MB). Gli allegati sono salvati nel browser (localStorage) e lo spazio è limitato.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const type: AttachmentItem["type"] = file.type.startsWith("image/") ? "image" : file.type === "application/pdf" ? "pdf" : "other";
      const att: AttachmentItem = { id: `att-${Date.now()}`, name: file.name, type, dataUrl };
      onAttachmentAdd(docId, att);
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = "";
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
        <h2 className="text-[17px] font-black text-gray-900 mb-1">Dettaglio Categoria</h2>
        <p className="text-[12px] text-gray-400 mb-4">{category}</p>

        {/* Nota tecnica allegati */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
          <p className="text-[10px] text-amber-700 font-semibold leading-relaxed">
            ⚠️ Gli allegati sono salvati <strong>solo nel browser locale</strong> (localStorage base64).
            Max 10 MB per file. Si perdono se si pulisce la cache del browser.
          </p>
        </div>

        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="text-[12px] text-gray-400 italic text-center py-6 bg-gray-50 rounded-xl">
              Nessun documento inserito in questa categoria.
            </p>
          ) : (
            filtered.map((doc) => (
              <div key={doc.id} className="bg-gray-50/70 border border-gray-100 rounded-xl p-3">
                {/* Header documento */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
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

                {/* Allegati */}
                {doc.attachments && doc.attachments.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2 mb-2">
                    {doc.attachments.map((att) => (
                      <div key={att.id} className="relative group">
                        {att.type === "image" ? (
                          <button onClick={() => setPreviewAtt(att)}>
                            <img
                              src={att.dataUrl}
                              alt={att.name}
                              className="w-16 h-16 object-cover rounded-xl border border-gray-200 hover:opacity-80 transition-opacity"
                            />
                          </button>
                        ) : (
                          <a
                            href={att.dataUrl}
                            download={att.name}
                            className="w-16 h-16 flex flex-col items-center justify-center bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-colors"
                          >
                            <span className="text-[20px]">📄</span>
                            <span className="text-[8px] text-red-600 font-bold mt-0.5 px-1 text-center leading-tight truncate w-full">{att.name.split(".")[0]}</span>
                          </a>
                        )}
                        <button
                          onClick={() => onAttachmentDelete(doc.id, att.id)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm opacity-95 active:scale-90"
                          title="Elimina allegato"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload allegato */}
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 cursor-pointer hover:text-blue-600 transition-colors mt-1">
                  <span className="text-[14px]">📎</span>
                  Aggiungi allegato (foto/PDF)
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(doc.id, e)}
                  />
                </label>
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

      {/* Preview immagine a schermo intero */}
      {previewAtt && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewAtt(null)}
        >
          <img
            src={previewAtt.dataUrl}
            alt={previewAtt.name}
            className="max-w-full max-h-[80dvh] rounded-2xl object-contain"
          />
          <button
            className="absolute top-4 right-4 text-white text-[24px] font-bold"
            onClick={() => setPreviewAtt(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}





const DEFAULT_CHECKLISTS: Checklist[] = [
  {
    id: "chk-bagaglio",
    title: "🎒 Bagaglio a Mano",
    items: [
      { id: "chki-1", text: "Passaporto e portadocumenti", checked: false },
      { id: "chki-2", text: "Caricabatterie e adattatore universale", checked: false },
      { id: "chki-3", text: "Occhiali da sole e da vista", checked: false },
      { id: "chki-4", text: "Medicinali essenziali", checked: false },
    ],
  },
  {
    id: "chk-documenti",
    title: "📄 Documenti da fare",
    items: [
      { id: "chki-5", text: "Verificare validità passaporti", checked: true },
      { id: "chki-6", text: "Richiedere Visto Australia (eVisitor)", checked: false },
      { id: "chki-7", text: "Compilare eTravel Filippine (3gg prima)", checked: false },
      { id: "chki-8", text: "Ritirare patente internazionale", checked: false },
    ],
  },
];

// (useSearchParams già importato in cima)

export default function AltroView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openSection = searchParams.get("open");

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null);
  const [showAddDocCategory, setShowAddDocCategory] = useState<DocumentCategory | null>(null);
  const [activeInfoLabel, setActiveInfoLabel] = useState<string | null>(null);
  const [personalNotes, setPersonalNotes] = useState("");

  useEffect(() => {
    async function initData() {
      const docs = await repository.getDocuments(DEFAULT_DOCUMENTS);
      const chks = await repository.getChecklists(DEFAULT_CHECKLISTS);
      const notesVal = await repository.getNotes();
      setDocuments(docs);
      setChecklists(chks);
      setPersonalNotes(notesVal);
      isLoadedRef.current = true;
      setIsLoading(false);
    }
    initData();
  }, []);

  useEffect(() => {
    if (isLoadedRef.current) {
      repository.saveDocuments(documents);
    }
  }, [documents]);

  useEffect(() => {
    if (isLoadedRef.current) {
      repository.saveChecklists(checklists);
    }
  }, [checklists]);

  // Accordion a singola apertura: id dell'accordion aperto (null = tutti chiusi)
  const [openAccordion, setOpenAccordion] = useState<string | null>(() => {
    // Se c'è un openSection da URL, apri quell'accordion; altrimenti tutto chiuso
    if (openSection === "checklist") return "checklist";
    if (openSection === "insurance") return "insurance";
    if (openSection === "emergencies") return "emergencies";
    if (openSection === "documents") return "documents";
    if (openSection === "baggage") return "baggage";
    if (openSection === "deadlines") return "deadlines";
    return null;
  });

  function toggleAccordion(id: string) {
    setOpenAccordion((prev) => (prev === id ? null : id));
  }

  // Sincronizza openAccordion se openSection cambia (navigazione SPA senza rimontaggio)
  useEffect(() => {
    if (openSection) {
      setOpenAccordion(openSection);
    }
  }, [openSection]);

  // Gestione scroll smooth all'avvio se c'è openSection
  useEffect(() => {
    if (openSection) {
      setTimeout(() => {
        const el = document.getElementById(`altro-sec-${openSection}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 300);
    }
  }, [openSection]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60dvh] gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-[12px] text-slate-500 font-semibold">Caricamento dati...</span>
      </div>
    );
  }

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

  function handleAttachmentAdd(docId: string, att: AttachmentItem) {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, attachments: [...(d.attachments ?? []), att] }
          : d
      )
    );
  }

  function handleAttachmentDelete(docId: string, attId: string) {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, attachments: (d.attachments ?? []).filter((a) => a.id !== attId) }
          : d
      )
    );
  }

  // Checklist handlers
  function toggleChecklistItem(checklistId: string, itemId: string) {
    setChecklists((prev) =>
      prev.map((c) => {
        if (c.id !== checklistId) return c;
        return {
          ...c,
          items: c.items.map((it) => (it.id === itemId ? { ...it, checked: !it.checked } : it)),
        };
      })
    );
  }

  function addChecklistItem(checklistId: string, text: string) {
    if (!text.trim()) return;
    const newItem: ChecklistItem = {
      id: `chki-${Date.now()}-${Math.random()}`,
      text: text.trim(),
      checked: false,
    };
    setChecklists((prev) =>
      prev.map((c) => {
        if (c.id !== checklistId) return c;
        return { ...c, items: [...c.items, newItem] };
      })
    );
  }

  function removeChecklistItem(checklistId: string, itemId: string) {
    setChecklists((prev) =>
      prev.map((c) => {
        if (c.id !== checklistId) return c;
        return { ...c, items: c.items.filter((it) => it.id !== itemId) };
      })
    );
  }

  function addChecklist(title: string) {
    if (!title.trim()) return;
    const newChecklist: Checklist = {
      id: `chk-${Date.now()}`,
      title: title.trim(),
      items: [],
    };
    setChecklists((prev) => [...prev, newChecklist]);
  }

  function removeChecklist(id: string) {
    if (window.confirm("Eliminare questa checklist?")) {
      setChecklists((prev) => prev.filter((c) => c.id !== id));
    }
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

        {/* Note Personali Reali */}
        <div className="w-full">
          <button
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50"
            onClick={() => setActiveInfoLabel(activeInfoLabel === "Note" ? null : "Note")}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50 border border-blue-100">
              <span className="text-blue-600"><IcNote size={20} /></span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-gray-900">Note</p>
              <p className="text-[12px] text-gray-400">Appunti e promemoria rapidi</p>
            </div>
            <IcChevronDown size={14} className={`text-gray-300 flex-shrink-0 transition-transform duration-200 ${activeInfoLabel === "Note" ? "rotate-180 text-blue-500" : ""}`} />
          </button>
          {activeInfoLabel === "Note" && (
            <div className="px-4 pb-4 pt-1 bg-white border-t border-gray-50">
              <label className="text-[11px] font-semibold text-gray-400 block mb-1.5 uppercase tracking-wider">Appunti di viaggio (Salvataggio automatico)</label>
              <textarea
                value={personalNotes}
                onChange={(e) => {
                  setPersonalNotes(e.target.value);
                  repository.saveNotes(e.target.value);
                }}
                placeholder="Scrivi qui i tuoi appunti, liste bagaglio speciali, idee o annotazioni... Vengono salvati istantaneamente nel database locale del telefono."
                className="w-full min-h-[140px] bg-gray-50 border border-gray-200 rounded-xl p-3 text-[13px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:bg-white resize-none"
              />
            </div>
          )}
        </div>

        {/* Impostazioni Reali */}
        <div className="w-full">
          <button
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50"
            onClick={() => setActiveInfoLabel(activeInfoLabel === "Impostazioni" ? null : "Impostazioni")}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-50 border border-gray-100">
              <span className="text-gray-500"><IcSettings size={20} /></span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-gray-900">Impostazioni</p>
              <p className="text-[12px] text-gray-400">Statistiche e reset cache locale</p>
            </div>
            <IcChevronDown size={14} className={`text-gray-300 flex-shrink-0 transition-transform duration-200 ${activeInfoLabel === "Impostazioni" ? "rotate-180 text-blue-500" : ""}`} />
          </button>
          {activeInfoLabel === "Impostazioni" && (
            <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-50 space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Statistiche database locale</p>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-[12px] text-gray-600 space-y-1.5 font-medium">
                  <div className="flex justify-between">
                    <span>Documenti allegati:</span>
                    <span className="font-bold text-gray-800">{documents.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Checklist attive:</span>
                    <span className="font-bold text-gray-800">{checklists.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Elementi checklist completati:</span>
                    <span className="font-bold text-gray-800">
                      {checklists.reduce((acc, c) => acc + c.items.filter(i => i.checked).length, 0)} / {checklists.reduce((acc, c) => acc + c.items.length, 0)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={async () => {
                    if (window.confirm("ATTENZIONE!\nSei sicuro di voler cancellare tutti i dati dell'applicazione? Questa operazione eliminerà tutti i documenti allegati, le note, i QR code e le spese personali registrate e ripristinerà i default mock iniziali.\nQuesta azione non è revocabile.")) {
                      await repository.clearAllData();
                      alert("Dati resettati correttamente! L'applicazione verrà ricaricata.");
                      window.location.href = window.location.pathname;
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 font-extrabold text-[12px] border border-red-100 hover:bg-red-100 transition-colors active:scale-95 text-center"
                >
                  ⚠️ Reset Dati Applicazione
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Accordion delle Checklist */}
      <div id="altro-sec-checklist">
        <Accordion
          title="📋 Le mie Checklist"
          isOpen={openAccordion === "checklist"}
          onToggle={() => toggleAccordion("checklist")}
        >
          <div className="space-y-4">
            {checklists.map((chk) => (
              <div key={chk.id} className="bg-gray-50/50 border border-gray-100 rounded-xl p-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                  <h3 className="text-[13px] font-black text-gray-800">{chk.title}</h3>
                  <button
                    onClick={() => removeChecklist(chk.id)}
                    className="text-[11px] text-red-500 font-bold hover:underline"
                  >
                    Elimina
                  </button>
                </div>

                {/* Items */}
                <div className="space-y-1.5 mb-3">
                  {chk.items.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">Nessun elemento in questa lista.</p>
                  ) : (
                    chk.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 min-w-0 cursor-pointer select-none flex-1">
                          <input
                            type="checkbox"
                            checked={it.checked}
                            onChange={() => toggleChecklistItem(chk.id, it.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                          />
                          <span className={`text-[12px] truncate ${it.checked ? "line-through text-gray-400" : "text-gray-700"}`}>
                            {it.text}
                          </span>
                        </label>
                        <button
                          onClick={() => removeChecklistItem(chk.id, it.id)}
                          className="text-gray-300 hover:text-red-500 text-[10px] p-0.5"
                        >
                          🗑️
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Nuovo Item form */}
                <NewItemForm onAdd={(text) => addChecklistItem(chk.id, text)} />
              </div>
            ))}

            {/* Nuova Checklist form */}
            <NewChecklistForm onAdd={addChecklist} />
          </div>
        </Accordion>
      </div>

      {/* Accordion 1: 📁 Documenti di viaggio (raggruppati per COSA) */}
      <div id="altro-sec-documents">
        <Accordion
          title="📁 Documenti di viaggio"
          isOpen={openAccordion === "documents"}
          onToggle={() => toggleAccordion("documents")}
        >
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
      </div>

      {/* Accordion 2: Assicurazione — dati reali Heymondo */}
      <div id="altro-sec-insurance">
        <Accordion
          title="🛡️ Assicurazione Heymondo"
          isOpen={openAccordion === "insurance"}
          onToggle={() => toggleAccordion("insurance")}
        >
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
      </div>

      {/* Accordion 3: Emergenze per paese — dati reali */}
      <div id="altro-sec-emergencies">
        <Accordion
          title="🚨 Numeri di emergenza"
          isOpen={openAccordion === "emergencies"}
          onToggle={() => toggleAccordion("emergencies")}
        >
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
      </div>

      {/* Accordion 4: Bagagli e note operative */}
      <div id="altro-sec-baggage">
        <Accordion
          title="🧳 Bagagli e franchigie"
          isOpen={openAccordion === "baggage"}
          onToggle={() => toggleAccordion("baggage")}
        >
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
      </div>

      {/* Accordion 5: Scadenze assicurazione */}
      <div id="altro-sec-deadlines">
        <Accordion
          title="⏱ Scadenze e segnalazioni"
          isOpen={openAccordion === "deadlines"}
          onToggle={() => toggleAccordion("deadlines")}
        >
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
      </div>

      {/* Sheet Dettaglio Categoria */}
      {selectedCategory && (
        <CategoryDocumentsSheet
          category={selectedCategory}
          documents={documents}
          onCompile={handleCompileDefault}
          onDelete={handleDeleteDoc}
          onAttachmentAdd={handleAttachmentAdd}
          onAttachmentDelete={handleAttachmentDelete}
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

// ── Form per aggiungere un singolo elemento Checklist ────────────────────────
function NewItemForm({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) {
          onAdd(text);
          setText("");
        }
      }}
      className="flex gap-1.5 mt-2"
    >
      <input
        type="text"
        placeholder="Aggiungi elemento..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-gray-800 placeholder:text-gray-300 outline-none focus:border-blue-400"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="bg-blue-600 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg disabled:opacity-50"
      >
        +
      </button>
    </form>
  );
}

// ── Form per creare una nuova Checklist intera ──────────────────────────────
function NewChecklistForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) {
          onAdd(title);
          setTitle("");
        }
      }}
      className="border-t border-gray-100 pt-3 mt-2 flex gap-1.5"
    >
      <input
        type="text"
        placeholder="Nuova lista (es. 🎒 Bagaglio stiva)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[12px] text-gray-850 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:bg-white"
      />
      <button
        type="submit"
        disabled={!title.trim()}
        className="bg-blue-600 text-white font-bold text-[12px] px-4 py-2 rounded-xl disabled:opacity-50"
      >
        Crea Lista
      </button>
    </form>
  );
}
