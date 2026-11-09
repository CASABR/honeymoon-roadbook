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
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    defaultTitle: 'Biglietto / Voucher Attività'
  },
  {
    id: 'alloggi',
    label: 'Alloggi & Hotel',
    icon: '🏨',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    defaultTitle: 'Conferma Prenotazione Alloggio'
  },
  {
    id: 'assicurazione',
    label: 'Assicurazioni',
    icon: '🏥',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    defaultTitle: 'Polizza Sanitaria / Certificato'
  },
  {
    id: 'passaporto',
    label: 'Documenti Personali',
    icon: '🛂',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    defaultTitle: 'Documento Personale / Identità'
  },
  {
    id: 'altro',
    label: 'Altro & Ricevute',
    icon: '📁',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
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
  const [category, setCategory] = useState<DriveCategory>('attivita');
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPickerLoading, setIsPickerLoading] = useState(false);

  const pickerStatus = getGooglePickerConfigStatus();

  useEffect(() => {
    if (documentToEdit) {
      setTitle(documentToEdit.title || '');
      setDriveUrl(documentToEdit.driveUrl || '');
      const matchedCat = DRIVE_CATEGORIES.find(c => c.id === documentToEdit.category)?.id || 'altro';
      setCategory(matchedCat);
      setDescription(documentToEdit.description || '');
      setErrorMessage('');
    } else {
      setTitle('');
      setDriveUrl('');
      setCategory('attivita');
      setDescription('');
      setErrorMessage('');
    }
  }, [documentToEdit, isOpen]);

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
        if (!title.trim() || DRIVE_CATEGORIES.some(c => c.defaultTitle === title.trim())) {
          setTitle(item.name.replace(/\.[^/.]+$/, ''));
        }
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={documentToEdit ? 'Modifica Documento Google Drive' : 'Collega da Google Drive'}
      accentVariant="indigo"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner Google Drive */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50/80 via-emerald-50/60 to-amber-50/50 border border-blue-200/60 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs">
            {/* SVG Logo Google Drive */}
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
            <h4 className="text-xs font-bold text-slate-900">Documento Google Drive</h4>
            <p className="text-[11px] text-slate-600 line-clamp-1">
              Collega voucher, biglietti o cartelle condivise senza occupare memoria
            </p>
          </div>
        </div>

        {/* 1. SELETTORE CATEGORIA */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            1. Seleziona Categoria
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
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span className="text-sm">{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. NOME DOCUMENTO */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            2. Nome Documento *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Es. Biglietti Volo, Voucher Hotel, Polizza Viaggio..."
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-semibold focus:outline-hidden focus:bg-white focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* 3. LINK GOOGLE DRIVE O GOOGLE PICKER */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              3. Link File o Cartella Google Drive *
            </label>
            {pickerStatus.isConfigured && (
              <button
                type="button"
                onClick={handleOpenPicker}
                disabled={isPickerLoading}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
              >
                <span>📂</span>
                <span>{isPickerLoading ? 'Apertura…' : 'Scegli con Picker'}</span>
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
            className={`w-full h-11 px-3 bg-slate-50 border rounded-xl text-slate-900 text-xs font-medium focus:outline-hidden focus:bg-white transition-colors ${
              urlValidation
                ? urlValidation.isValid
                  ? 'border-emerald-400 focus:border-emerald-500'
                  : 'border-rose-300 focus:border-rose-500'
                : 'border-slate-200 focus:border-indigo-500'
            }`}
          />

          {/* Feedback validazione URL */}
          {urlValidation && (
            <div className={`text-[11px] font-medium flex items-center gap-1.5 pt-0.5 ${
              urlValidation.isValid ? 'text-emerald-700' : 'text-rose-600'
            }`}>
              <span>{urlValidation.isValid ? '✓' : '⚠️'}</span>
              <span>
                {urlValidation.isValid
                  ? (urlValidation.isFolder ? 'Cartella Google Drive valida' : 'Link Google Drive valido')
                  : urlValidation.error}
              </span>
            </div>
          )}

          {/* Guida / Stato Google Picker */}
          {!pickerStatus.isConfigured && (
            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700 flex items-center gap-1">
                <span>💡</span> Inserimento rapido attivo tramite link di condivisione
              </p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Apri il file su Google Drive, tocca <em>Condividi › Copia link</em> e incollalo qui sopra.
              </p>
            </div>
          )}
        </div>

        {/* 4. NOTE O DESCRIZIONE OPZIONALE */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            Note o Dettagli (opzionale)
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Es. Codice PNR, istruzioni check-in o passeggeri..."
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-hidden focus:bg-white focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Informativa Privacy e Integrità Drive */}
        <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-2.5 text-[11px] text-indigo-900/80 leading-relaxed">
          🔒 <strong>Protezione Drive:</strong> Il file originale risiede nel tuo Google Drive. HOUNIGO memorizza solo il collegamento sicuro e non modificherà né eliminerà mai il tuo file originale.
        </div>

        {errorMessage && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            {errorMessage}
          </div>
        )}

        {/* PULSANTI DI AZIONE */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
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
    </Modal>
  );
}

