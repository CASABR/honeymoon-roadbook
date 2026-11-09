import React, { useState, useEffect } from 'react';
import type { TravelDocument } from '../../types';
import Modal from '../common/Modal';
import {
  parseGoogleDriveUrl,
  getGooglePickerConfigStatus,
  openGooglePicker,
  type GooglePickerSelectedItem
} from '../../services/googlePickerService';

interface GoogleDriveDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (doc: TravelDocument) => void;
  documentToEdit?: TravelDocument | null;
}

type DriveCategory = 'attivita' | 'alloggi' | 'assicurazione' | 'passaporto' | 'altro';

interface DriveCategoryOption {
  id: DriveCategory;
  label: string;
  icon: string;
  badgeClass: string;
  defaultTitle: string;
}

const DRIVE_CATEGORIES: DriveCategoryOption[] = [
  {
    id: 'attivita',
    label: 'Biglietti & Voucher',
    icon: '🎟️',
    badgeClass: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    defaultTitle: 'Biglietto / Voucher Attività'
  },
  {
    id: 'alloggi',
    label: 'Alloggi & Hotel',
    icon: '🏨',
    badgeClass: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    defaultTitle: 'Conferma Prenotazione Alloggio'
  },
  {
    id: 'assicurazione',
    label: 'Assicurazioni',
    icon: '🏥',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    defaultTitle: 'Polizza Sanitaria / Certificato'
  },
  {
    id: 'passaporto',
    label: 'Documenti Personali',
    icon: '🛂',
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    defaultTitle: 'Documento Personale / Identità'
  },
  {
    id: 'altro',
    label: 'Altro & Ricevute',
    icon: '📁',
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    defaultTitle: 'Documento Google Drive'
  }
];

export default function GoogleDriveDocModal({
  isOpen,
  onClose,
  onSave,
  documentToEdit
}: GoogleDriveDocModalProps) {
  const [title, setTitle] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [pickedFileName, setPickedFileName] = useState('');
  const [category, setCategory] = useState<DriveCategory>('attivita');
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [entryMode, setEntryMode] = useState<'choose' | 'manual'>('choose');

  const pickerStatus = getGooglePickerConfigStatus();

  useEffect(() => {
    if (documentToEdit) {
      setTitle(documentToEdit.title || '');
      setDriveUrl(documentToEdit.driveUrl || '');
      setPickedFileName(documentToEdit.title || '');
      const matchedCat = DRIVE_CATEGORIES.find(c => c.id === documentToEdit.category)?.id || 'altro';
      setCategory(matchedCat);
      setDescription(documentToEdit.description || '');
      setErrorMessage('');
      setEntryMode('manual');
    } else {
      setTitle('');
      setDriveUrl('');
      setPickedFileName('');
      setCategory('attivita');
      setDescription('');
      setErrorMessage('');
      setEntryMode(pickerStatus.isConfigured ? 'choose' : 'manual');
    }
  }, [documentToEdit, isOpen, pickerStatus.isConfigured]);

  if (!isOpen) return null;

  const urlValidation = driveUrl.trim() ? parseGoogleDriveUrl(driveUrl) : null;

  const handleSelectCategory = (cat: DriveCategoryOption) => {
    setCategory(cat.id);
    if (!title.trim() || DRIVE_CATEGORIES.some(c => c.defaultTitle === title.trim())) {
      setTitle(cat.defaultTitle);
    }
  };

  const handleOpenPicker = async () => {
    setErrorMessage('');
    setIsPickerLoading(true);
    await openGooglePicker({
      onSelect: (item: GooglePickerSelectedItem) => {
        setIsPickerLoading(false);
        setDriveUrl(item.url);
        setPickedFileName(item.name);
        const cleanName = item.name.replace(/\.[^/.]+$/, '');
        setTitle(cleanName);
      },
      onError: (err) => {
        setIsPickerLoading(false);
        setErrorMessage(err.message);
      },
      onCancel: () => {
        setIsPickerLoading(false);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMessage('Inserisci un nome per il documento.');
      return;
    }

    const validation = parseGoogleDriveUrl(driveUrl);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Indirizzo Google Drive non valido.');
      return;
    }

    const doc: TravelDocument = {
      id: documentToEdit?.id || 'doc_drive_' + Date.now(),
      category,
      title: cleanTitle,
      description: description.trim() || undefined,
      driveUrl: validation.cleanUrl,
      driveFileId: validation.fileId,
      isFolder: validation.isFolder,
      source: 'google_drive',
      status: 'Collegato Drive',
      attachments: documentToEdit?.attachments || [],
      createdAt: documentToEdit?.createdAt || Date.now(),
      updatedAt: new Date().toISOString()
    };

    onSave(doc);
    onClose();
  };

  const isFileSelected = Boolean(driveUrl.trim());

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={documentToEdit ? 'Modifica Documento Google Drive' : 'Collega da Google Drive'}
      accentVariant="indigo"
    >
      <div className="space-y-4">
        {/* Banner Informativo Intestazione */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50/80 via-emerald-50/60 to-amber-50/50 dark:from-blue-950/40 dark:via-emerald-950/30 dark:to-amber-950/30 border border-blue-200/60 dark:border-blue-900/60 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-xs">
            <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">Documento Google Drive</h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1">
              Collega voucher, biglietti o cartelle cloud al viaggio
            </p>
          </div>
        </div>

        {/* FASE 1: SELEZIONE METODO QUANDO NUOVO DOCUMENTO E FILE NON ANCORA SCELTO */}
        {!documentToEdit && !isFileSelected && (
          <div className="space-y-3">
            {pickerStatus.isConfigured ? (
              <div className="space-y-2.5">
                {/* COMANDO PRINCIPALE: SCEGLI DA GOOGLE DRIVE */}
                <button
                  type="button"
                  onClick={handleOpenPicker}
                  disabled={isPickerLoading}
                  className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 hover:bg-indigo-100/60 dark:hover:bg-indigo-950/70 transition-all cursor-pointer text-left group shadow-xs active:scale-[0.99] disabled:opacity-60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">📂</span>
                    <div>
                      <h4 className="text-sm font-extrabold text-indigo-950 dark:text-indigo-200">
                        {isPickerLoading ? 'Apertura Google Drive…' : 'Scegli un file dal mio Drive'}
                      </h4>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                        {isPickerLoading ? 'Autorizza la finestra popup nel browser' : 'Seleziona direttamente un PDF, documento o voucher'}
                      </p>
                    </div>
                  </div>
                  <span className="text-indigo-600 dark:text-indigo-400 font-extrabold text-sm ml-2">›</span>
                </button>

                {/* COMANDO SECONDARIO: INSERISCI LINK MANUALMENTE */}
                <button
                  type="button"
                  onClick={() => setEntryMode('manual')}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Oppure inserisci il link manualmente
                </button>
              </div>
            ) : (
              /* PICKER NON CONFIGURATO: AVVISO OPERATIVO CHIARO */
              <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold text-xs">
                  <span>⚙️</span>
                  <span>Google Picker in attesa di configurazione</span>
                </div>
                <p className="text-[11px] text-amber-900/80 dark:text-amber-300 leading-relaxed">
                  Per sfogliare i file con un tocco è necessario configurare OAuth Client ID e API Key nella console Google Cloud. Nel frattempo puoi incollare subito il link di condivisione Drive qui sotto.
                </p>
              </div>
            )}
          </div>
        )}

        {/* FASE 2: FORM COMPILAZIONE (QUANDO FILE SCELTO, INSERIMENTO MANUALE O MODIFICA) */}
        {(documentToEdit || isFileSelected || entryMode === 'manual' || !pickerStatus.isConfigured) && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* BADGE FILE SELEZIONATO SE PROVIENE DA PICKER */}
            {isFileSelected && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-emerald-700 dark:text-emerald-300 text-base">✓</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 truncate">
                      {pickedFileName || title || 'File selezionato'}
                    </p>
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 truncate">
                      {driveUrl}
                    </p>
                  </div>
                </div>
                {pickerStatus.isConfigured && !documentToEdit && (
                  <button
                    type="button"
                    onClick={handleOpenPicker}
                    className="shrink-0 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 hover:underline cursor-pointer px-2 py-1 bg-white/80 dark:bg-slate-800 rounded-lg border border-emerald-300 dark:border-emerald-700"
                  >
                    Cambia
                  </button>
                )}
              </div>
            )}

            {/* 1. SELETTORE CATEGORIA */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                1. Categoria del Documento *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {DRIVE_CATEGORIES.map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border text-left ${
                        isSelected
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span className="text-sm shrink-0">{cat.icon}</span>
                      <span className="truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. NOME DOCUMENTO */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                2. Nome Documento *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Biglietti Volo, Voucher Hotel, Polizza Viaggio..."
                className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* 3. LINK GOOGLE DRIVE */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  3. Link File o Cartella Google Drive *
                </label>
                {pickerStatus.isConfigured && (
                  <button
                    type="button"
                    onClick={handleOpenPicker}
                    disabled={isPickerLoading}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <span>📂</span>
                    <span>{isPickerLoading ? 'Apertura…' : 'Scegli da Drive'}</span>
                  </button>
                )}
              </div>

              <input
                type="url"
                required
                value={driveUrl}
                onChange={(e) => {
                  setDriveUrl(e.target.value);
                  setErrorMessage('');
                }}
                placeholder="https://drive.google.com/file/d/... oppure https://docs.google.com/..."
                className={`w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border rounded-xl text-slate-900 dark:text-white text-xs font-medium focus:outline-hidden focus:bg-white dark:focus:bg-slate-900 transition-colors ${
                  urlValidation
                    ? urlValidation.isValid
                      ? 'border-emerald-400 focus:border-emerald-500'
                      : 'border-rose-300 focus:border-rose-500'
                    : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500'
                }`}
              />

              {/* Feedback validazione URL */}
              {urlValidation && (
                <div className={`text-[11px] font-medium flex items-center gap-1.5 pt-0.5 ${
                  urlValidation.isValid ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  <span>{urlValidation.isValid ? '✓' : '⚠️'}</span>
                  <span>
                    {urlValidation.isValid
                      ? (urlValidation.isFolder ? 'Cartella Google Drive valida' : 'Link Google Drive valido')
                      : urlValidation.error}
                  </span>
                </div>
              )}
            </div>

            {/* 4. NOTE O DESCRIZIONE OPZIONALE */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Note o Dettagli (opzionale)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Es. Codice PNR, istruzioni check-in o passeggeri..."
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-hidden focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 transition-colors resize-none"
              />
            </div>

            {/* Avviso Chiarezza Riferimento vs Copia Offline */}
            <div className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 p-2.5 text-[11px] text-indigo-900/80 dark:text-indigo-300 leading-relaxed">
              🔒 <strong>File Originale Protetto:</strong> Il file risiede nel tuo account Google Drive. HOUNIGO registra solo il riferimento protetto e non copia il documento offline né modifica il file originale.
            </div>

            {errorMessage && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold">
                {errorMessage}
              </div>
            )}

            {/* PULSANTI DI AZIONE */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-95"
              >
                {documentToEdit ? 'Aggiorna collegamento' : 'Salva collegamento'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
