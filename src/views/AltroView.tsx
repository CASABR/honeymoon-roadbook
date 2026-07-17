import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { INSURANCE, EMERGENCY_CONTACTS, DAYS } from "../data/mockData";
import type { DayData, Activity } from "../data/mockData";
import {
  IcNote, IcSettings, IcWallet,
  IcChevronRight, IcChevronDown, IcPlus, IcMapPin,
} from "../components/Icons";
import { repository } from "../services/repository";
import type { Checklist, DocumentItem, AttachmentItem, ChecklistItem } from "../services/repository";
import { auth, /* googleProvider, linkWithPopup, */ signOut } from "../services/firebase";
import { syncService } from "../services/sync";
import { EditActivitySheet, AddActivitySheet } from "./TripView";

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

function getLocalCurrency(act: Activity, dayLocation: string) {
  if (act.price === undefined || act.price === 0) return null;
  const loc = dayLocation.toLowerCase();
  const title = act.title.toLowerCase();
  
  if (loc.includes("ph") || loc.includes("manila") || loc.includes("boracay") || loc.includes("el nido") || loc.includes("coron") || title.includes("tao") || title.includes("dugong")) {
    return { label: "PHP", amount: Math.round(act.price * 62.0) };
  }
  if (loc.includes("au") || loc.includes("adelaide") || loc.includes("melbourne") || loc.includes("sydney") || loc.includes("jervis") || title.includes("dolphin")) {
    return { label: "AUD", amount: Math.round(act.price * 1.62) };
  }
  return { label: "NZD", amount: Math.round(act.price * 1.76) };
}

export default function AltroView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openSection = searchParams.get("open");

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [tripDays, setTripDays] = useState<DayData[]>([]);
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity; dayLabel: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<any>(null);
  const [addingToDay, setAddingToDay] = useState<{ id: string; label: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadedRef = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null);
  const [showAddDocCategory, setShowAddDocCategory] = useState<DocumentCategory | null>(null);
  const [activeInfoLabel, setActiveInfoLabel] = useState<string | null>(null);
  const [personalNotes, setPersonalNotes] = useState("");
  const [filterMode, setFilterMode] = useState<"todo" | "all">("todo");
  const notesTimeoutRef = useRef<any>(null);

  const user = auth?.currentUser || (localStorage.getItem("hrb_local_auth_bypass") ? JSON.parse(localStorage.getItem("hrb_local_auth_bypass")!) : null);
  // Temporarily commented out to avoid unused variable errors:
  // const [isLinking, setIsLinking] = useState(false);
  // const [linkError, setLinkError] = useState<string | null>(null);
  // 
  // async function handleLinkGoogle() {
  //   if (!auth || !auth.currentUser) {
  //     alert("Il collegamento richiede che le chiavi Firebase siano configurate ed attive (non in modalità bypass locale).");
  //     return;
  //   }
  //   setIsLinking(true);
  //   setLinkError(null);
  //   try {
  //     await linkWithPopup(auth.currentUser, googleProvider);
  //     alert("Account Google collegato con successo! I vostri dati sono ora pronti per la sincronizzazione cloud.");
  //     window.location.reload();
  //   } catch (err: any) {
  //     console.error("Errore linking Google:", err);
  //     if (err.code === "auth/credential-already-in-use") {
  //       setLinkError("Questo account Google è già associato a un altro utente del Roadbook.");
  //     } else {
  //       setLinkError(err.message || "Errore durante il collegamento dell'account.");
  //     }
  //   } finally {
  //     setIsLinking(false);
  //   }
  // }

  async function handleLogout() {
    if (window.confirm("Disconnettersi dall'applicazione?")) {
      localStorage.removeItem("hrb_local_auth_bypass");
      localStorage.removeItem("hrb_intro_seen");
      if (auth) {
        await signOut(auth);
      }
      window.location.reload();
    }
  }

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  async function handleSyncPush() {
    setIsSyncing(true);
    setSyncStatus("Salvataggio nel cloud...");
    try {
      await syncService.pushNotes();
      await syncService.pushCompletedActivities();
      await syncService.pushBudget();
      await syncService.pushAccommodations();
      setSyncStatus("Dati salvati con successo!");
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (e: any) {
      console.error(e);
      setSyncStatus("Errore durante l'invio.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSyncPull() {
    if (!window.confirm("Attenzione: scaricando i dati dal cloud, le note, i completamenti, il budget e gli alloggi correnti verranno sovrascritti o uniti con quelli remoti. Continuare?")) {
      return;
    }
    setIsSyncing(true);
    setSyncStatus("Download dal cloud...");
    try {
      const notes = await syncService.pullNotes();
      const completed = await syncService.pullCompletedActivities();
      await syncService.pullBudget();
      await syncService.pullAccommodations();
      if (notes !== null) setPersonalNotes(notes);
      if (completed !== null) {
        window.dispatchEvent(new CustomEvent("hrb_completed_activities_change", { detail: completed }));
      }
      setSyncStatus("Dati scaricati con successo!");
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (e: any) {
      console.error(e);
      setSyncStatus("Errore durante il download.");
    } finally {
      setIsSyncing(false);
    }
  }

  // Pulisce i timeout all'unmount
  useEffect(() => {
    return () => {
      if (notesTimeoutRef.current) {
        clearTimeout(notesTimeoutRef.current);
      }
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  function handleNotesChange(text: string) {
    setPersonalNotes(text);
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }
    notesTimeoutRef.current = setTimeout(() => {
      repository.saveNotes(text);
    }, 800);
  }

  function handleNotesBlur() {
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }
    repository.saveNotes(personalNotes);
  }

  const enrichTripDays = (days: DayData[]): DayData[] => {
    return days.map(d => ({
      ...d,
      activities: d.activities.map(act => {
        if (act.howToGetThere && !act.mapsUrl) {
          return {
            ...act,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${act.title}, ${act.howToGetThere}`)}`
          };
        }
        return act;
      })
    }));
  };

  useEffect(() => {
    async function initData() {
      try {
        const docs = await repository.getDocuments(DEFAULT_DOCUMENTS);
        const chks = await repository.getChecklists(DEFAULT_CHECKLISTS);
        const notesVal = await repository.getNotes();
        const days = await repository.getTripDays(DAYS);
        setDocuments(docs);
        setChecklists(chks);
        setPersonalNotes(notesVal);
        setTripDays(enrichTripDays(days));
        isLoadedRef.current = true;
      } catch (e) {
        console.error("Errore caricamento dati in AltroView:", e);
      } finally {
        setIsLoading(false);
      }
    }
    initData();
  }, []);

  useEffect(() => {
    const tripDaysHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        const enriched = enrichTripDays(detail);
        setTripDays((current) => {
          if (JSON.stringify(current) === JSON.stringify(enriched)) return current;
          return enriched;
        });
      }
    };
    window.addEventListener("hrb_tripdays_change", tripDaysHandler as EventListener);
    return () => {
      window.removeEventListener("hrb_tripdays_change", tripDaysHandler as EventListener);
    };
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
    if (openSection === "activities") return "activities";
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
    <div className="px-4 pt-6 pb-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-black text-gray-900 tracking-tight leading-none">Altro</h1>
        <p className="text-[12.5px] text-gray-500 font-medium">Gestisci i documenti, le note personali, i ticket e i dettagli logistici del viaggio.</p>
      </div>

      {/* ── GRUPPO 1: STRUMENTI PRINCIPALI ── */}
      <div className="space-y-3">
        <span className="section-label block mb-1">Strumenti Principali</span>

        {/* Navigazione rapida */}
        <div className="card divide-y divide-gray-100 shadow-sm overflow-hidden border border-gray-100 bg-white">
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

          <button
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50"
            onClick={() => {
              setOpenAccordion("activities");
              setTimeout(() => {
                const el = document.getElementById("altro-sec-activities");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 100);
            }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50 border border-blue-100">
              <span className="text-blue-600">🎫</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-gray-900">Gestione Attività</p>
              <p className="text-[12px] text-gray-400">Gestisci prenotazioni, pagamenti e costi attività</p>
            </div>
            <IcChevronRight size={15} className="text-gray-300 flex-shrink-0" />
          </button>

          {/* Note Personali Reali */}
          <div className="w-full">
            <button
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/50"
              onClick={() => setActiveInfoLabel(activeInfoLabel === "Note" ? null : "Note")}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50 border border-amber-100">
                <span className="text-amber-600"><IcNote size={20} /></span>
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
                  onChange={(e) => handleNotesChange(e.target.value)}
                  onBlur={handleNotesBlur}
                  placeholder="Scrivi qui i tuoi appunti, liste bagaglio speciali, idee o annotazioni... Vengono salvati localmente con debounce."
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
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100 border border-slate-200">
                <span className="text-slate-600"><IcSettings size={20} /></span>
              </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-gray-900">Impostazioni</p>
              <p className="text-[12px] text-gray-400">Account, statistiche e cache</p>
            </div>
            <IcChevronDown size={14} className={`text-gray-300 flex-shrink-0 transition-transform duration-200 ${activeInfoLabel === "Impostazioni" ? "rotate-180 text-blue-500" : ""}`} />
          </button>
          {activeInfoLabel === "Impostazioni" && (
            <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-50 space-y-4">
              {/* Stato dell'account */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2 text-[12px] text-gray-700">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stato Account</p>
                {user ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span>Accesso:</span>
                      <span className={`font-bold ${user.isAnonymous ? "text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md" : "text-green-600 bg-green-50 px-2 py-0.5 rounded-md"}`}>
                        {user.isAnonymous ? "Ospite Temporaneo" : "Autenticato (Cloud)"}
                      </span>
                    </div>
                    {user.displayName && (
                      <div className="flex justify-between">
                        <span>Nome:</span>
                        <span className="font-semibold text-gray-900">{user.displayName}</span>
                      </div>
                    )}
                    {user.email && (
                      <div className="flex justify-between">
                        <span>Email:</span>
                        <span className="font-semibold text-gray-900 truncate max-w-[180px]">{user.email}</span>
                      </div>
                    )}

                    {/* Bottone di collegamento Google temporaneamente rimosso */}
                  </div>
                ) : (
                  <p className="text-gray-400 font-medium">Nessun utente collegato.</p>
                )}

                <div className="pt-2 border-t border-gray-200/60 flex justify-between items-center">
                  <span className="text-[10.5px] text-gray-400">Sincronizzazione dati:</span>
                  <span className="text-[10.5px] font-semibold text-gray-500">
                    {user?.isAnonymous ? "Solo locale" : "Cloud abilitato"}
                  </span>
                </div>
              </div>

              {/* Statistiche Database */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Statistiche Database</p>
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

              {/* Sincronizzazione Manuale Cloud */}
              {user && !user.isAnonymous && user.uid !== "local-bypass-user" && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Sincronizzazione Cloud (Note & Attività)</p>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={handleSyncPush}
                        disabled={isSyncing}
                        className="flex-1 py-2 bg-blue-50 text-blue-600 border border-blue-100 font-extrabold text-[11px] rounded-lg transition-colors hover:bg-blue-100 disabled:opacity-50"
                      >
                        📤 Invia al Cloud
                      </button>
                      <button
                        onClick={handleSyncPull}
                        disabled={isSyncing}
                        className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[11px] rounded-lg transition-colors disabled:opacity-50"
                      >
                        📥 Scarica dal Cloud
                      </button>
                    </div>
                    {syncStatus && (
                      <p className="text-[10px] text-center font-semibold text-blue-600 mt-1">{syncStatus}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Informazione archiviazione */}
              <div className="p-2.5 bg-blue-50/40 border border-blue-100/50 rounded-xl text-[11px] text-slate-500 leading-normal">
                💡 <strong>Nota:</strong> Le note testuali, le checklist e le spese sono salvate localmente. Con l'accesso Email, le preferenze e il diario vengono sincronizzati automaticamente con il cloud di Firebase Firestore. Le foto e i file allegati molto grandi rimangono custoditi localmente per massimizzare la velocità offline.
              </div>

              {/* Bottoni Logout e Reset */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <button
                  onClick={handleLogout}
                  className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[12px] rounded-xl transition-all active:scale-97 text-center"
                >
                  Disconnetti / Esci
                </button>
                <button
                  onClick={async () => {
                    if (window.confirm("ATTENZIONE!\nSei sicuro di voler cancellare tutti i dati dell'applicazione? Questa operazione eliminerà tutti i documenti allegati, le note, i QR code e le spese personali registrate e ripristinerà i default mock iniziali.\nQuesta azione non è revocabile.")) {
                      // Pulisce anche eventuale bypass
                      localStorage.removeItem("hrb_local_auth_bypass");
                      await repository.clearAllData();
                      alert("Dati resettati correttamente! L'applicazione verrà ricaricata.");
                      window.location.href = window.location.pathname;
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 font-extrabold text-[12px] border border-red-100 hover:bg-red-100 transition-colors active:scale-97 text-center"
                >
                  ⚠️ Reset Dati Applicazione
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

        {/* Accordion 0: 🎫 Gestione Attività */}
        <div id="altro-sec-activities">
          <Accordion
            title="🎫 Gestione Attività"
            isOpen={openAccordion === "activities"}
            onToggle={() => toggleAccordion("activities")}
          >
            <div className="space-y-3">
              {/* Pulsante aggiunta attività rapida */}
              <div className="flex gap-2">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      const selDay = DAYS.find(d => d.id === e.target.value);
                      if (selDay) {
                        setAddingToDay({ id: selDay.id, label: selDay.dateLabel });
                      }
                      e.target.value = "";
                    }
                  }}
                  className="flex-1 bg-blue-600 text-white font-extrabold text-[12px] px-3 py-2.5 rounded-xl outline-none"
                >
                  <option value="">➕ Aggiungi attività ad un Giorno...</option>
                  {DAYS.map((d, idx) => (
                    <option key={d.id} value={d.id}>Giorno {idx + 1} - {d.dateLabel}</option>
                  ))}
                </select>
              </div>

              {/* Selettore Filtro Attività */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-3">
                <button
                  type="button"
                  onClick={() => setFilterMode("todo")}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-extrabold transition-all ${
                    filterMode === "todo" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  ⏳ Da fare / da gestire
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-extrabold transition-all ${
                    filterMode === "all" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  📋 Tutte le attività
                </button>
              </div>

              {/* Riepilogo Costi e Prenotazioni delle attività */}
               {(() => {
                const allManagedActivities = tripDays.flatMap(day => 
                  day.activities
                    .filter(act => {
                      if (act.type === "transport" || act.type === "hotel" || act.type === "food") return false;
                      
                      const titleLower = act.title.toLowerCase();
                      const subtitleLower = act.subtitle ? act.subtitle.toLowerCase() : "";
                      if (titleLower.includes("spostamento") || subtitleLower.includes("spostamento") || titleLower.includes("trasferimento") || subtitleLower.includes("trasferimento")) {
                        return false;
                      }

                      const managedIds = new Set([
                        "d5-5", "d6-1", "d6-4", "d7-1", "d7-2", 
                        "d10-whale", "d12-1", "d15-1", "d16-2", 
                        "d26-1", "d36-1", "d40-1"
                      ]);

                      return !!(
                        act.isManaged ||
                        managedIds.has(act.id) ||
                        act.price !== undefined || 
                        act.isBooked || 
                        act.howToGetThere || 
                        act.bookingRef || 
                        act.ticketUrl || 
                        act.timeBeforehand || 
                        act.duration
                      );
                    })
                    .map(act => ({ day, act }))
                );

                const totalActivitiesCount = allManagedActivities.length;

                const realActivities = allManagedActivities.filter(({ act }) => {
                  if (filterMode === "todo") {
                    return !act.isPaid || !act.isBooked;
                  }
                  return true;
                });

                const totalCost = realActivities.reduce((sum, { act }) => sum + (act.price || 0), 0);
                const paidCost = realActivities.reduce((sum, { act }) => sum + (act.isPaid ? (act.price || 0) : 0), 0);
                const toPayCost = totalCost - paidCost;
                const bookedCount = realActivities.filter(({ act }) => act.isBooked).length;
                const totalCount = realActivities.length;

                return (
                  <>
                    {realActivities.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 bg-gray-50/80 p-3 rounded-xl border border-gray-100 mb-3">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            {filterMode === "todo" ? "Costo Da Gestire" : "Costo Totale"}
                          </p>
                          <p className="text-[15px] font-black text-gray-900">€{totalCost.toFixed(2)}</p>
                          <div className="flex flex-col gap-0.5 text-[10px] font-semibold">
                            <span className="text-emerald-600">Pagati: €{paidCost.toFixed(2)}</span>
                            <span className="text-rose-500">Da Pagare: €{toPayCost.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="space-y-1 border-l border-gray-200 pl-3">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stato Sezione</p>
                          <p className="text-[15px] font-black text-blue-600">{bookedCount} / {totalCount}</p>
                          <p className="text-[10px] text-gray-400 font-medium leading-tight">Prenotate o confermate</p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {realActivities.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 px-4 bg-gray-50/50 border border-dashed border-gray-200 rounded-xl text-center">
                          <span className="text-[28px] mb-1">🎉</span>
                          <p className="text-[13px] font-bold text-gray-800">Tutto sotto controllo!</p>
                          <p className="text-[11.5px] text-gray-500 mt-0.5 max-w-[220px] leading-snug">
                            {totalActivitiesCount > 0 
                              ? `Tutte le ${totalActivitiesCount} attività principali sono già prenotate e pagate.`
                              : "Non ci sono ancora attività pianificate in questo viaggio."
                            }
                          </p>
                          {totalActivitiesCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setFilterMode("all")}
                              className="mt-3 px-4 py-1.5 bg-white border border-gray-200 text-blue-600 font-extrabold text-[11px] rounded-xl hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
                            >
                              Visualizza tutte ({totalActivitiesCount}) →
                            </button>
                          )}
                        </div>
                      ) : (
                        realActivities.map(({ day, act }) => (
                          <div 
                            key={act.id} 
                            onClick={() => setEditingActivity({ dayId: day.id, activity: act, dayLabel: day.dateLabel })}
                            className="p-3 border border-gray-100 hover:border-blue-200 bg-white hover:bg-gray-50/30 rounded-xl transition-all cursor-pointer flex flex-col gap-2 shadow-sm"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="text-[13px] font-black text-gray-800 leading-snug truncate">{act.title}</p>
                                  {act.mapsUrl && (
                                    <a
                                      href={act.mapsUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-500 hover:text-blue-650 hover:bg-blue-50 hover:border-blue-100 transition-colors shrink-0"
                                      title="Apri posizione in Google Maps"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <IcMapPin size={13} />
                                    </a>
                                  )}
                                </div>
                                <p className="text-[10.5px] text-gray-400 mt-0.5 font-medium">Giorno {day.dayNumber} &middot; {day.dateLabel} alle {act.time}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[13px] font-black text-blue-600 block">
                                  {act.price !== undefined ? `€${act.price}` : "€0.00"}
                                </span>
                                {(() => {
                                  const localVal = getLocalCurrency(act, day.location);
                                  if (!localVal) return null;
                                  return (
                                    <span className="text-[10px] text-gray-400 font-semibold block mt-0.5">
                                      ({localVal.amount} {localVal.label})
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>

                            {(act.duration || act.timeBeforehand) && (
                              <div className="flex gap-2 text-[10.5px] text-gray-500 font-semibold bg-gray-50 px-2 py-1 rounded-lg w-fit">
                                {act.duration && <span>⏱️ {act.duration}</span>}
                                {act.duration && act.timeBeforehand && <span>·</span>}
                                {act.timeBeforehand && <span>⏰ Presentarsi: {act.timeBeforehand}</span>}
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black border uppercase tracking-wider ${
                                  act.isBooked
                                    ? "bg-blue-50 text-blue-600 border-blue-200"
                                    : "bg-gray-50 text-gray-400 border-gray-200"
                                }`}>
                                  {act.isBooked ? "Prenotata" : "Non pren."}
                                </span>
                                <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black border uppercase tracking-wider ${
                                  act.isPaid
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-250"
                                    : "bg-rose-50 text-rose-500 border-rose-200"
                                }`}>
                                  {act.isPaid ? "Pagata" : "Da pagare"}
                                </span>
                              </div>

                              {act.howToGetThere && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(act.howToGetThere!);
                                    if (copiedTimeoutRef.current) {
                                      clearTimeout(copiedTimeoutRef.current);
                                    }
                                    setCopiedId(act.id);
                                    copiedTimeoutRef.current = setTimeout(() => {
                                      setCopiedId(null);
                                    }, 2000);
                                  }}
                                  className={`text-[9.5px] font-extrabold flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all active:scale-95 shrink-0 ${
                                    copiedId === act.id
                                      ? "bg-green-50 text-green-700 border-green-200"
                                      : "bg-slate-50 text-slate-600 border-slate-100 hover:text-blue-650 hover:bg-blue-50 hover:border-blue-100"
                                  }`}
                                  title="Copia indicazioni logistiche"
                                >
                                  {copiedId === act.id ? (
                                    <>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span>Copiato</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                      </svg>
                                      <span>Copia logistica</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </Accordion>
        </div>
      </div>

      {/* ── GRUPPO 2: STRUMENTI DI SUPPORTO ── */}
      <div className="space-y-3">
        <span className="section-label block mb-1">Strumenti di Supporto</span>

        {/* Accordion delle Checklist */}
        <div id="altro-sec-checklist">
          <Accordion
            title="📋 Le mie Checklist"
            isOpen={openAccordion === "checklist"}
            onToggle={() => toggleAccordion("checklist")}
          >
            <div className="space-y-4">
              {checklists.map((chk) => {
                const total = chk.items.length;
                const completed = chk.items.filter((it) => it.checked).length;
                return (
                  <div key={chk.id} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm shadow-slate-100/50">
                    <div className="flex items-center justify-between border-b border-slate-100/70 pb-2 mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-black text-gray-800">{chk.title}</h3>
                        {total > 0 && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                            {completed}/{total}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeChecklist(chk.id)}
                        className="text-[10px] text-red-500 font-bold hover:underline"
                      >
                        Elimina
                      </button>
                    </div>

                    {/* Items */}
                    <div className="space-y-2 mb-3">
                      {chk.items.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic py-0.5">Nessun elemento in questa lista.</p>
                      ) : (
                        chk.items.map((it) => (
                          <div key={it.id} className="flex items-center justify-between gap-2.5 py-0.5">
                            <label className="flex items-center gap-2.5 min-w-0 cursor-pointer select-none flex-1">
                              <input
                                type="checkbox"
                                checked={it.checked}
                                onChange={() => toggleChecklistItem(chk.id, it.id)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 shrink-0"
                              />
                              <span className={`text-[12px] truncate ${it.checked ? "line-through text-gray-400 font-medium" : "text-gray-700 font-semibold"}`}>
                                {it.text}
                              </span>
                            </label>
                            <button
                              onClick={() => removeChecklistItem(chk.id, it.id)}
                              className="text-gray-355 hover:text-red-500 transition-colors p-1"
                              title="Rimuovi elemento"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Nuovo Item form */}
                    <NewItemForm onAdd={(text) => addChecklistItem(chk.id, text)} />
                  </div>
                );
              })}

              {/* Nuova Checklist form */}
              <NewChecklistForm onAdd={addChecklist} />
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
            <div className="space-y-2.5">
              {[
                {
                  category: "Urgente",
                  label: "eTravel Filippine",
                  note: "Compilare online entro 72 ore prima dell'arrivo.",
                  severity: "urgent"
                },
                {
                  category: "Urgente",
                  label: "Patente Internazionale",
                  note: "Modello Ginevra 1949 necessario per ritiri auto in Nuova Zelanda e Australia.",
                  severity: "urgent"
                },
                {
                  category: "Imminente",
                  label: "Briefing Spedizione Tao",
                  note: "Registrazione obbligatoria all'ufficio Tao il giorno precedente alla partenza del tour.",
                  severity: "imminent"
                },
                {
                  category: "Imminente",
                  label: "Check-in Voli",
                  note: "Disponibile online 24-48 ore prima della partenza.",
                  severity: "imminent"
                },
                {
                  category: "Informativo",
                  label: "Sinistri e Assistenza Medica",
                  note: "Emergenze entro 24 ore. Invio documenti entro 15 giorni dall'evento.",
                  severity: "info"
                },
                {
                  category: "Informativo",
                  label: "Disguidi Volo e Bagaglio",
                  note: "Richiedere rapporto PIR in aeroporto; denuncia entro 15 giorni dal rientro.",
                  severity: "info"
                }
              ].map((item, idx) => {
                const colors = {
                  urgent: {
                    dot: "bg-rose-500",
                    badge: "bg-rose-50 text-rose-700 border-rose-100",
                    border: "border-rose-100/70 bg-rose-50/10"
                  },
                  imminent: {
                    dot: "bg-amber-500",
                    badge: "bg-amber-50 text-amber-700 border-amber-100",
                    border: "border-amber-100/50 bg-amber-50/5"
                  },
                  info: {
                    dot: "bg-slate-400",
                    badge: "bg-slate-50 text-slate-600 border-slate-100",
                    border: "border-slate-100 bg-slate-50/30"
                  }
                }[item.severity as "urgent" | "imminent" | "info"];

                return (
                  <div key={idx} className={`p-2.5 rounded-xl border flex gap-2.5 items-start ${colors.border}`}>
                    <span className={`w-2 h-2 mt-1.5 rounded-full ${colors.dot} shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[8.5px] px-1 py-0.5 rounded font-black border uppercase tracking-wider ${colors.badge}`}>
                          {item.category}
                        </span>
                        <p className="text-[12.5px] font-black text-gray-900 leading-tight">{item.label}</p>
                      </div>
                      <p className="text-[10.5px] text-gray-500 font-semibold leading-relaxed">{item.note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Accordion>
        </div>
      </div>

      {/* ── GRUPPO 3: ARCHIVIO & SICUREZZA ── */}
      <div className="space-y-3">
        <span className="section-label block mb-1">Archivio &amp; Sicurezza</span>

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
              {/* Box Assicurazione Heymondo in evidenza */}
              <div className="bg-white border border-blue-100 rounded-xl p-3.5 shadow-sm shadow-blue-50/50">
                <div className="flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <span className="text-[8px] px-1.5 py-0.5 rounded font-black border uppercase tracking-wider bg-blue-50 text-blue-600 border-blue-100">
                      Assicurazione Viaggio
                    </span>
                    <h3 className="text-[13px] font-black text-gray-900 mt-1.5">Heymondo Assistenza 24/7</h3>
                    <p className="text-[11px] font-bold text-gray-550 mt-1">Polizza: <span className="font-mono bg-slate-50 border border-slate-100 px-1 rounded text-gray-800">{INSURANCE.policyNumber}</span></p>
                  </div>
                  <a
                    href={`tel:${INSURANCE.phone24h}`}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-150 text-[11.5px] font-black px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <span>Chiama</span>
                  </a>
                </div>
              </div>

              {/* Lista Contatti Emergenza Locali */}
              <div className="grid grid-cols-1 gap-2">
                {EMERGENCY_CONTACTS.filter(ec => ec.number !== INSURANCE.phone24h).map((ec) => (
                  <div key={ec.country} className="bg-white border border-slate-100 rounded-xl p-3 flex justify-between items-center shadow-sm shadow-slate-100/30">
                    <div className="min-w-0 pr-2">
                      <p className="text-[12px] font-black text-gray-900 leading-tight">{ec.country}</p>
                      <p className="text-[10.5px] text-gray-450 mt-0.5 leading-normal font-semibold">{ec.note}</p>
                    </div>
                    <a
                      href={`tel:${ec.number}`}
                      className="bg-rose-50/70 text-rose-700 border border-rose-100 hover:bg-rose-100 text-[11.5px] font-black px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition-all active:scale-95 shrink-0"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span className="font-mono font-extrabold">{ec.number}</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Linee Guida emergenza */}
            <div className="mt-3.5 pt-3 border-t border-slate-100">
              <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-2">Procedura Assistenza Medica:</h4>
              <div className="space-y-2 text-[10.5px] text-gray-500 font-semibold leading-relaxed">
                <div className="flex gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-slate-650 text-[9px] font-black shrink-0 mt-0.5">1</span>
                  <p>Chiama Heymondo al <span className="font-mono font-bold text-gray-800">{INSURANCE.phone24h}</span> indicando la polizza.</p>
                </div>
                <div className="flex gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-slate-650 text-[9px] font-black shrink-0 mt-0.5">2</span>
                  <p>Attendi indicazioni per evitare di anticipare spese mediche in loco.</p>
                </div>
                <div className="flex gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-slate-650 text-[9px] font-black shrink-0 mt-0.5">3</span>
                  <p>In emergenza grave, vai in ospedale e contatta Heymondo entro 24 ore.</p>
                </div>
              </div>
            </div>
          </Accordion>
        </div>
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

      {/* Gestione Attività Modali */}
      {editingActivity && (
        <EditActivitySheet
          activity={editingActivity.activity}
          dayLabel={editingActivity.dayLabel}
          onSave={(updated) => {
            const nextDays = tripDays.map((day) => {
              if (day.id === editingActivity.dayId) {
                const oldAct = day.activities.find((a) => a.id === updated.id);
                const nextActs = day.activities.map((a) => (a.id === updated.id ? updated : a));
                if (oldAct && oldAct.time !== updated.time) {
                  nextActs.sort((a, b) => a.time.localeCompare(b.time));
                }
                return { ...day, activities: nextActs };
              }
              return day;
            });
            setTripDays(nextDays);
            repository.saveTripDays(nextDays);
            // Forza emissione evento per riallineare le altre schede
            window.dispatchEvent(new CustomEvent("hrb_tripdays_change", { detail: nextDays }));
            setEditingActivity(null);
          }}
          onDelete={() => {
            const nextDays = tripDays.map((day) => {
              if (day.id === editingActivity.dayId) {
                return { ...day, activities: day.activities.filter((a) => a.id !== editingActivity.activity.id) };
              }
              return day;
            });
            setTripDays(nextDays);
            repository.saveTripDays(nextDays);
            window.dispatchEvent(new CustomEvent("hrb_tripdays_change", { detail: nextDays }));
            setEditingActivity(null);
          }}
          onClose={() => setEditingActivity(null)}
        />
      )}

      {addingToDay && (
        <AddActivitySheet
          dayId={addingToDay.id}
          dayLabel={addingToDay.label}
          onSave={(dayId, act) => {
            const nextDays = tripDays.map((day) => {
              if (day.id === dayId) {
                const nextActs = [...day.activities, act];
                nextActs.sort((a, b) => a.time.localeCompare(b.time));
                return { ...day, activities: nextActs };
              }
              return day;
            });
            setTripDays(nextDays);
            repository.saveTripDays(nextDays);
            window.dispatchEvent(new CustomEvent("hrb_tripdays_change", { detail: nextDays }));
            setAddingToDay(null);
          }}
          onClose={() => setAddingToDay(null)}
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
