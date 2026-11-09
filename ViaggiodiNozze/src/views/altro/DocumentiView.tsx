import React, { useState, useEffect, useCallback } from 'react';
import type { TravelDocument } from '../../types';
import { storageService } from '../../storage/storageService';
import DocumentValidityModal from '../../components/modals/DocumentValidityModal';
import GoogleDriveDocModal from '../../components/modals/GoogleDriveDocModal';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import SwipeToDelete from '../../components/common/SwipeToDelete';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { formatDateIT } from '../../utils/tripDates';
import { openDriveUrlSafely, getGooglePickerConfigStatus } from '../../services/googlePickerService';

interface DocumentiViewProps {
  onBack: () => void;
  initialOpenDriveModal?: boolean;
}

type DocCategory = 'passaporto' | 'visto' | 'patente' | 'assicurazione' | 'alloggi' | 'attivita' | 'altro';

interface CategoryPreset {
  id: DocCategory;
  label: string;
  icon: string;
  badgeClass: string;
  defaultTitle: string;
  defaultDescription: string;
}

const CATEGORY_PRESETS: CategoryPreset[] = [
  {
    id: 'passaporto',
    label: '🛂 Passaporti & Identità',
    icon: '🛂',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    defaultTitle: 'Passaporto Biometrico',
    defaultDescription: 'Passaporto elettronico con validità superiore a 6 mesi oltre la data di rientro.'
  },
  {
    id: 'visto',
    label: '📋 Visti Elettronici (NZeTA, eVisitor)',
    icon: '📋',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    defaultTitle: 'Visto Elettronico NZeTA / eVisitor AU',
    defaultDescription: 'Autorizzazione turistica di viaggio con tassa IVL inclusa.'
  },
  {
    id: 'patente',
    label: '🚗 Patente Internazionale & Guida',
    icon: '🚗',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    defaultTitle: 'Patente Internazionale di Guida (IDP)',
    defaultDescription: 'Permesso internazionale di guida convenzione Ginevra 1949 / Vienna 1968 per auto & camper.'
  },
  {
    id: 'assicurazione',
    label: '🏥 Polizza & Tessera Sanitaria',
    icon: '🏥',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    defaultTitle: 'Polizza Assicurazione Viaggio',
    defaultDescription: 'Copertura sanitaria integrativa con assistenza h24 e spese mediche illimitate.'
  },
  {
    id: 'alloggi',
    label: '🏨 Voucher Alloggi & Hotel',
    icon: '🏨',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    defaultTitle: 'Voucher Prenotazione Hotel',
    defaultDescription: 'Conferma di prenotazione e dettagli check-in per le strutture del viaggio.'
  },
  {
    id: 'attivita',
    label: '🎟️ Biglietti & Prenotazioni Attività',
    icon: '🎟️',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    defaultTitle: 'Biglietto Escursione / Tour',
    defaultDescription: 'Ticket d\'ingresso o voucher attività programmata.'
  },
  {
    id: 'altro',
    label: '📁 Altro / Ricevute',
    icon: '📁',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    defaultTitle: 'Documento generico',
    defaultDescription: 'Ricevuta, contratto noleggio o nota personale.'
  }
];

export default function DocumentiView({ onBack, initialOpenDriveModal = false }: DocumentiViewProps) {
  const { canEdit } = useDeviceRole();
  const pickerStatus = getGooglePickerConfigStatus();
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<DocCategory | 'tutti'>('tutti');
  
  // Modale Dettaglio/Modifica
  const [validityModalDoc, setValidityModalDoc] = useState<TravelDocument | null>(null);

  // Modale Creazione Nuovo Documento con Preset
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<CategoryPreset>(CATEGORY_PRESETS[0]);
  const [title, setTitle] = useState(CATEGORY_PRESETS[0].defaultTitle);
  const [description, setDescription] = useState(CATEGORY_PRESETS[0].defaultDescription);
  const [status, setStatus] = useState('Valido');
  const [validity, setValidity] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  // Modale Google Drive
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(initialOpenDriveModal);
  const [editingDriveDoc, setEditingDriveDoc] = useState<TravelDocument | null>(null);

  // Dialog Eliminazione
  const [deleteTarget, setDeleteTarget] = useState<TravelDocument | null>(null);

  useEffect(() => {
    if (initialOpenDriveModal) {
      setIsDriveModalOpen(true);
    }
  }, [initialOpenDriveModal]);

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      const loaded = await storageService.ensureGenericDocumentTemplates();
      setDocuments(loaded);
    } catch (err) {
      console.error('Errore caricamento documenti:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleSelectPresetClick = (preset: CategoryPreset) => {
    setSelectedPreset(preset);
    setTitle(preset.defaultTitle);
    setDescription(preset.defaultDescription);
  };

  const handleOpenAddModal = () => {
    setSelectedPreset(CATEGORY_PRESETS[0]);
    setTitle(CATEGORY_PRESETS[0].defaultTitle);
    setDescription(CATEGORY_PRESETS[0].defaultDescription);
    setStatus('Valido');
    setValidity('');
    setExpiresAt('');
    setIsAddModalOpen(true);
  };

  const handleOpenDriveModal = () => {
    setEditingDriveDoc(null);
    setIsDriveModalOpen(true);
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const newDoc: TravelDocument = {
      id: 'doc_' + Date.now(),
      category: selectedPreset.id,
      title: title.trim() || selectedPreset.defaultTitle,
      description: description.trim() || undefined,
      status: status.trim() || 'Valido',
      validity: validity.trim() || undefined,
      expiresAt: expiresAt.trim() || undefined,
      attachments: [],
      updatedAt: new Date().toISOString()
    };
    await storageService.saveDocument(newDoc);
    setIsAddModalOpen(false);
    await loadDocs();
  };

  const handleSaveDocument = async (updated: TravelDocument) => {
    try {
      await storageService.saveDocument(updated);
      setValidityModalDoc(null);
      await loadDocs();
    } catch (err) {
      console.error('Errore salvataggio documento:', err);
    }
  };

  const handleSaveDriveDocument = async (doc: TravelDocument) => {
    try {
      await storageService.saveDocument(doc);
      setIsDriveModalOpen(false);
      setEditingDriveDoc(null);
      await loadDocs();
    } catch (err) {
      console.error('Errore salvataggio documento Google Drive:', err);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteTarget) return;
    await storageService.deleteDocument(deleteTarget.id);
    setDeleteTarget(null);
    await loadDocs();
  };

  const [showEmptyPlaceholders, setShowEmptyPlaceholders] = useState(true);

  // Identifica i segnaposto predefiniti senza allegati
  const emptyPlaceholdersCount = documents.filter(d => (!d.attachments || d.attachments.length === 0) && d.id.startsWith('doc_')).length;

  const filteredDocs = documents.filter(d => {
    // Non mostrare frammenti o chunk errati
    if (typeof d.id === 'string' && d.id.startsWith('att_chunk_')) return false;
    if (!d.title?.trim() && !d.category) return false;
    if (!showEmptyPlaceholders && (!d.attachments || d.attachments.length === 0) && d.id.startsWith('doc_')) {
      return false;
    }
    if (selectedFilter === 'tutti') return true;
    return d.category === selectedFilter;
  });

  const getCategoryInfo = (cat: string) => {
    return CATEGORY_PRESETS.find(p => p.id === cat) || CATEGORY_PRESETS[CATEGORY_PRESETS.length - 1];
  };

  const getStatusBadge = (statusStr?: string) => {
    const s = (statusStr || 'Valido').toLowerCase();
    if (s.includes('valido') || s.includes('attiva') || s.includes('approvato') || s.includes('completato')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          ✓ {statusStr || 'Valido'}
        </span>
      );
    }
    if (s.includes('attesa') || s.includes('verificare')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          ⏳ {statusStr}
        </span>
      );
    }
    if (s.includes('richiedere')) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          📝 {statusStr}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
        {statusStr || 'Valido'}
      </span>
    );
  };

  return (
    <div className="flex flex-col w-full max-w-full min-w-0 h-full animate-fade-in pb-16 space-y-4">
      {/* HEADER STILE iOS FOLDER RESPONSIVE */}
      <header className="flex flex-col gap-3 px-1 w-full max-w-full min-w-0">
        <div className="flex items-center justify-between gap-2 w-full min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
              title="Torna ad Altro"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 truncate">
                <span>📁</span>
                <span className="truncate">Documenti del Viaggio</span>
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                Cartella digitale passaporti, visti, patenti e voucher
              </p>
            </div>
          </div>

          {emptyPlaceholdersCount > 0 && (
            <button
              type="button"
              onClick={() => setShowEmptyPlaceholders(v => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-95 shrink-0"
              title="Mostra o nascondi i documenti predefiniti senza allegati"
            >
              <span>{showEmptyPlaceholders ? '👁️ Nascondi' : '📂 Mostra tutti'}</span>
              <span className="text-[10px] text-slate-400 font-bold">({emptyPlaceholdersCount})</span>
            </button>
          )}
        </div>

        {canEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full min-w-0">
            <button
              type="button"
              onClick={handleOpenDriveModal}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 text-xs font-bold border border-slate-300 dark:border-slate-700 shadow-2xs transition-all cursor-pointer active:scale-98 min-w-0"
              title="Collega un documento o cartella da Google Drive"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
              <span className="truncate">{pickerStatus.isConfigured ? 'Scegli da Google Drive' : 'Aggiungi da Google Drive'}</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs shadow-indigo-600/20 transition-all cursor-pointer active:scale-98 min-w-0"
            >
              <span className="text-sm font-black">+</span>
              <span className="truncate">Nuovo Documento</span>
            </button>
          </div>
        )}
      </header>

      {/* FILTRI A PILLOLE PER CATEGORIA */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5 -mx-0.5 w-full max-w-full min-w-0">
        <button
          onClick={() => setSelectedFilter('tutti')}
          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
            selectedFilter === 'tutti'
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs dark:bg-white dark:text-slate-900 dark:border-white'
              : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
          }`}
        >
          Tutti ({documents.length})
        </button>
        {CATEGORY_PRESETS.map((p) => {
          const count = documents.filter(d => d.category === p.id).length;
          if (count === 0 && selectedFilter !== p.id) return null;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedFilter(p.id)}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                selectedFilter === p.id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs dark:bg-white dark:text-slate-900 dark:border-white'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.id.charAt(0).toUpperCase() + p.id.slice(1)}</span>
              <span className="text-[10px] opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* GRIGLIA CARD DOCUMENTI iOS FOLDER */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 text-xs font-medium">Caricamento documenti...</div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 border-dashed p-8 text-center my-4">
          <span className="text-4xl mb-2 block">📄</span>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Nessun documento trovato</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Tocca su "+ Nuovo Documento" o collega un file da Google Drive.</p>
        </div>
      ) : (
        <div className="grid gap-3 w-full max-w-full min-w-0">
          {filteredDocs.map((doc) => {
            const catInfo = getCategoryInfo(doc.category);
            return (
              <SwipeToDelete key={doc.id} disabled={!canEdit} onDelete={() => setDeleteTarget(doc)}>
                <div
                  onClick={() => {
                    if (doc.source === 'google_drive' || doc.driveUrl) {
                      setEditingDriveDoc(doc);
                      setIsDriveModalOpen(true);
                    } else {
                      setValidityModalDoc(doc);
                    }
                  }}
                  className="w-full min-w-0 max-w-full overflow-hidden bg-white dark:bg-[#172033] rounded-3xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer flex flex-col gap-2.5 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0 border border-slate-200/60 dark:border-slate-700">
                        {catInfo.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold border ${catInfo.badgeClass}`}>
                            {catInfo.label.split(' ')[1] || doc.category}
                          </span>
                          {(doc.source === 'google_drive' || doc.driveUrl) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[9px] font-bold" title="Documento collegato da Google Drive">
                              <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                              </svg>
                              <span>{doc.isFolder ? 'Cartella Drive' : 'Google Drive'}</span>
                            </span>
                          )}
                          {doc.attachments && doc.attachments.length > 0 && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[9px] font-bold" title={`${doc.attachments.length} allegati`}>
                              📎 {doc.attachments.length}
                            </span>
                          )}
                        </div>
                        <h3 className="font-extrabold text-slate-900 dark:text-white text-sm leading-snug truncate mt-0.5">
                          {doc.title}
                        </h3>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {getStatusBadge(doc.status)}
                    </div>
                  </div>

                  <p className="min-w-0 break-words text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2 pl-0.5">
                    {doc.description || 'Nessuna descrizione.'}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] gap-2">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium truncate min-w-0 flex-1">
                      {doc.driveUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDriveUrlSafely(doc.driveUrl!);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer active:scale-95 shrink-0"
                          title="Apri su Google Drive in una nuova scheda"
                        >
                          <span>Apri su Drive</span>
                          <span>↗</span>
                        </button>
                      ) : (
                        <>
                          {doc.validity && (
                            <span className="truncate">🗓️ {doc.validity}</span>
                          )}
                          {doc.expiresAt && (
                            <span className="font-semibold text-rose-600">⏳ Scad: {formatDateIT(doc.expiresAt)}</span>
                          )}
                        </>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-2.5 shrink-0">
                        {(doc.source === 'google_drive' || doc.driveUrl) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDriveDoc(doc);
                              setIsDriveModalOpen(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-semibold cursor-pointer text-[11px]"
                          >
                            Modifica
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(doc);
                          }}
                          className="text-rose-500 hover:text-rose-700 dark:text-rose-400 font-semibold cursor-pointer text-[11px]"
                        >
                          Elimina
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </SwipeToDelete>
            );
          })}
        </div>
      )}

      {/* MODALE DI CREAZIONE DOCUMENTO CON PRESET CATEGORIE */}
      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Nuovo Documento del Viaggio"
        >
          <form onSubmit={handleCreateDocument} className="space-y-4">
            {/* 1. SELETTORE A PILLOLE CON PRESET CATEGORIE UFFICIALI */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                1. Seleziona Tipologia Documento (Preset)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_PRESETS.map((p) => {
                  const isSelected = selectedPreset.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPresetClick(p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CAMPI FORM */}
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Titolo Documento
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="es. Passaporto Elettronico, Visto NZeTA"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Descrizione / Note
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Note aggiuntive, dettagli o numero polizza..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Stato
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="Valido">✓ Valido / Approvato</option>
                    <option value="In attesa">⏳ In attesa / Da verificare</option>
                    <option value="Da richiedere">📝 Da richiedere</option>
                    <option value="In elaborazione">🔄 In elaborazione</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Scadenza Esatta (Opzionale)
                  </label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Durata / Validità
                </label>
                <input
                  type="text"
                  value={validity}
                  onChange={(e) => setValidity(e.target.value)}
                  placeholder="es. Valido 2 anni, scade 6 mesi dopo il rientro..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* PULSANTI SALVA */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer active:scale-95"
              >
                Crea Documento
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODALE VALIDITA/MODIFICA ESISTENTE */}
      {validityModalDoc && (
        <DocumentValidityModal
          isOpen={!!validityModalDoc}
          onClose={() => { setValidityModalDoc(null); loadDocs(); }}
          document={validityModalDoc}
          onSave={handleSaveDocument}
        />
      )}

      {/* CONFIRM DIALOG ELIMINAZIONE */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen={!!deleteTarget}
          title={deleteTarget.source === 'google_drive' || deleteTarget.driveUrl ? 'Rimuovi Collegamento Drive' : 'Elimina Documento'}
          message={
            deleteTarget.source === 'google_drive' || deleteTarget.driveUrl
              ? `Vuoi rimuovere il collegamento a "${deleteTarget.title}" da questo viaggio? Il file o la cartella originale sul tuo Google Drive non verrà modificata né eliminata.`
              : `Sei sicuro di voler eliminare "${deleteTarget.title}"?`
          }
          confirmLabel={deleteTarget.source === 'google_drive' || deleteTarget.driveUrl ? 'Rimuovi' : 'Elimina'}
          onConfirm={handleDeleteDocument}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* MODALE COLLEGAMENTO GOOGLE DRIVE */}
      {isDriveModalOpen && (
        <GoogleDriveDocModal
          isOpen={isDriveModalOpen}
          onClose={() => {
            setIsDriveModalOpen(false);
            setEditingDriveDoc(null);
          }}
          onSave={handleSaveDriveDocument}
          documentToEdit={editingDriveDoc}
        />
      )}
    </div>
  );
}
