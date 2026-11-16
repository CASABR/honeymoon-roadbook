import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import {
  parseGoogleDriveUrl,
  getGooglePickerConfigStatus,
  openGoogleFolderPicker,
  type GoogleDriveFavoriteFolder
} from '../../services/googlePickerService';

interface GoogleDriveFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (folder: GoogleDriveFavoriteFolder) => void;
  onDisconnect?: () => void;
  currentFolder?: GoogleDriveFavoriteFolder | null;
}

export default function GoogleDriveFolderModal({
  isOpen,
  onClose,
  onSave,
  onDisconnect,
  currentFolder
}: GoogleDriveFolderModalProps) {
  const [folderName, setFolderName] = useState('');
  const [folderUrl, setFolderUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [mode, setMode] = useState<'picker' | 'manual'>('picker');

  const pickerStatus = getGooglePickerConfigStatus();

  useEffect(() => {
    if (isOpen) {
      if (currentFolder) {
        setFolderName(currentFolder.name);
        setFolderUrl(currentFolder.url);
        setErrorMessage('');
        setMode('manual');
      } else {
        setFolderName('');
        setFolderUrl('');
        setErrorMessage('');
        setMode(pickerStatus.isConfigured ? 'picker' : 'manual');
      }
    }
  }, [isOpen, currentFolder, pickerStatus.isConfigured]);

  if (!isOpen) return null;

  const handleOpenFolderPicker = async () => {
    setErrorMessage('');
    setIsPickerLoading(true);
    await openGoogleFolderPicker({
      parentFolderId: currentFolder?.id,
      onSelect: (folder) => {
        setIsPickerLoading(false);
        onSave(folder);
        onClose();
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

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanUrl = folderUrl.trim();
    if (!cleanUrl) {
      setErrorMessage('Inserisci l\'indirizzo della cartella Google Drive.');
      return;
    }

    const validation = parseGoogleDriveUrl(cleanUrl);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Link Google Drive non valido.');
      return;
    }

    const cleanName = folderName.trim() || 'Cartella Viaggio Drive';
    const folderId = validation.fileId || `folder_${Date.now()}`;
    const targetUrl = validation.cleanUrl;

    onSave({
      id: folderId,
      name: cleanName,
      url: targetUrl,
      selectedAt: Date.now()
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={currentFolder ? "Modifica Cartella Drive" : "Collega Cartella Drive"} centered>
      <div className="space-y-4 max-w-md w-full">
        {/* HEADER INFORMATIVO */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg shrink-0">
            📁
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">Cartella Preferita Google Drive</h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Tieni a portata di mano la cartella cloud per voucher e documenti
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
            {errorMessage}
          </div>
        )}

        {pickerStatus.isConfigured && mode === 'picker' ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleOpenFolderPicker}
              disabled={isPickerLoading}
              className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100/60 dark:hover:bg-blue-950/70 transition-all cursor-pointer text-left group shadow-xs active:scale-[0.99] disabled:opacity-60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">📂</span>
                <div>
                  <h4 className="text-sm font-extrabold text-blue-950 dark:text-blue-200">
                    {isPickerLoading ? 'Apertura Google Drive…' : 'Seleziona cartella da Google Drive'}
                  </h4>
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                    {isPickerLoading ? 'Autorizza la finestra popup nel browser' : 'Scegli la cartella principale del viaggio con Google Picker'}
                  </p>
                </div>
              </div>
              <span className="text-blue-600 dark:text-blue-400 font-extrabold text-sm ml-2">›</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('manual')}
              className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer text-center"
            >
              Oppure incolla il link della cartella manualmente
            </button>

            <div className="flex items-center justify-between pt-2">
              {currentFolder && onDisconnect && (
                <button
                  type="button"
                  onClick={() => {
                    onDisconnect();
                    onClose();
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  Scollega cartella
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="ml-auto px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitManual} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nome della cartella
              </label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="es. Documenti Viaggio di Nozze"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Indirizzo link Google Drive (URL cartella)
              </label>
              <input
                type="url"
                value={folderUrl}
                onChange={(e) => setFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Apri la cartella su Google Drive, tocca "Condividi" &gt; "Copia link" e incollalo qui.
              </p>
            </div>

            {pickerStatus.isConfigured && (
              <button
                type="button"
                onClick={() => setMode('picker')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer block"
              >
                ← Torna a Google Picker
              </button>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
              {currentFolder && onDisconnect && (
                <button
                  type="button"
                  onClick={() => {
                    onDisconnect();
                    onClose();
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  Scollega
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  Salva cartella
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
