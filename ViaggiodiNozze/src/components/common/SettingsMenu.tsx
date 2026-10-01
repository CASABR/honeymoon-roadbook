import { useState, useRef, useEffect } from 'react';
import { storageService } from '../../storage/storageService';
import type { DeviceRole } from '../../types';
import DeviceRoleModal from './DeviceRoleModal';

/**
 * Menu impostazioni discreto (icona in alto a destra nell'\u2019App).
 * Gestisce Export JSON e Import JSON del backup completo.
 */
export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => storageService.getDeviceRole());
  const [showRoleModal, setShowRoleModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleRoleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ role: DeviceRole }>;
      if (customEvent.detail?.role) {
        setDeviceRole(customEvent.detail.role);
      }
    };
    window.addEventListener('device_role_changed', handleRoleChanged);
    return () => window.removeEventListener('device_role_changed', handleRoleChanged);
  }, []);

  const handleSelectRole = (newRole: DeviceRole) => {
    storageService.setDeviceRole(newRole);
    setDeviceRole(newRole);
    const roleLabels: Record<DeviceRole, string> = {
      guida: 'Telefono Guida (GPS Attivo)',
      copilota: 'Telefono Co-pilota',
      viewer: 'Computer / Ospite (Viewer)'
    };
    showToast('ok', `Ruolo aggiornato: ${roleLabels[newRole]}`);
  };

  const showToast = (type: 'ok' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await storageService.exportAllData();
      const date = new Date().toISOString().split('T')[0];
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `honeymoon-roadbook-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('ok', 'Backup esportato con successo.');
    } catch (err) {
      showToast('error', 'Errore durante l\u2019esportazione.');
      console.error(err);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      await storageService.importAllData(text);
      showToast('ok', 'Dati ripristinati. La pagina si aggiorner\u00e0.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore durante l\u2019importazione.';
      showToast('error', msg);
    } finally {
      setImporting(false);
      setOpen(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      {/* Trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Impostazioni"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-b border-slate-100">
                Dispositivo
              </p>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowRoleModal(true);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">
                    {deviceRole === 'guida' ? '🟢' : deviceRole === 'copilota' ? '🟡' : '💻'}
                  </span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800">Ruolo Dispositivo</span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      {deviceRole === 'guida' ? 'Telefono Guida (GPS)' : deviceRole === 'copilota' ? 'Telefono Co-pilota' : 'Computer / Viewer'}
                    </span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-t border-b border-slate-100">
                Backup & Ripristino
              </p>

              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exporting ? 'Esportazione...' : 'Esporta backup JSON'}
              </button>

              <button
                type="button"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 border-t border-slate-100"
              >
                <svg className="w-4 h-4 text-purple-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {importing ? 'Importazione...' : 'Importa backup JSON'}
              </button>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2 border-t border-b border-slate-100">
                Sincronizzazione Cloud
              </p>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('force_cloud_sync_requested'));
                  showToast('ok', 'Sincronizzazione forzata avviata nel cloud!');
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer border-t border-slate-100"
              >
                <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Forza Sincronizzazione al Cloud
              </button>

              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </>
        )}
      </div>

      {/* Modal Ruolo Dispositivo */}
      <DeviceRoleModal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        currentRole={deviceRole}
        onSelectRole={handleSelectRole}
      />

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          className={
            'fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl text-sm font-medium shadow-2xl shadow-black/40 border transition-all ' +
            (toast.type === 'ok'
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/20 border-rose-500/40 text-rose-300')
          }
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
