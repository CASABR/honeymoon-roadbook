import type { DeviceRole } from '../../types';

interface DeviceRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: DeviceRole;
  onSelectRole: (role: DeviceRole) => void;
}

export default function DeviceRoleModal({
  isOpen,
  onClose,
  currentRole,
  onSelectRole,
}: DeviceRoleModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="relative bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4 z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-lg">
              📱
            </span>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm">Ruolo del Dispositivo</h3>
              <p className="text-[11px] text-slate-400">Configura come questo dispositivo usa il GPS</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center text-xs cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2.5">
          {/* 1. Telefono Guida */}
          <button
            type="button"
            onClick={() => {
              onSelectRole('guida');
              onClose();
            }}
            className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
              currentRole === 'guida'
                ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🟢</span>
                <span className="font-extrabold text-xs text-slate-900">
                  Telefono Guida (Master / Riferimento)
                </span>
              </div>
              {currentRole === 'guida' && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Attivo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
              Dispositivo di riferimento per la posizione GPS del viaggio. Trasmette le coordinate reali e scatta la foto per chi segue da casa.
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 pl-7 pt-0.5">
              <span>✓ Geolocation API attiva</span>
              <span>•</span>
              <span>✓ Rilevamento GPS reale</span>
              <span>•</span>
              <span>✓ Upload foto</span>
            </div>
          </button>

          {/* 2. Telefono Co-pilota */}
          <button
            type="button"
            onClick={() => {
              onSelectRole('copilota');
              onClose();
            }}
            className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
              currentRole === 'copilota'
                ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🟡</span>
                <span className="font-extrabold text-xs text-slate-900">
                  Telefono Co-pilota
                </span>
              </div>
              {currentRole === 'copilota' && (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  Attivo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
              Accesso a modifiche, spese, note e itinerario. Non invia il segnale GPS per non sovrascrivere la posizione del Telefono Guida.
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800 pl-7 pt-0.5">
              <span>✓ Gestione note & spese</span>
              <span>•</span>
              <span>✓ Mappa ancorata alla guida</span>
            </div>
          </button>

          {/* 3. Computer / Ospite (Viewer) */}
          <button
            type="button"
            onClick={() => {
              onSelectRole('viewer');
              onClose();
            }}
            className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
              currentRole === 'viewer'
                ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-400/20 shadow-xs'
                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💻</span>
                <span className="font-extrabold text-xs text-slate-900">
                  Computer / Ospite (Viewer)
                </span>
              </div>
              {currentRole === 'viewer' && (
                <span className="text-[10px] font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">
                  Attivo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
              Modalità consultazione e test. Non richiede mai l'accesso al GPS locale e mostra passivamente le tappe e la posizione inviata dal Telefono Guida.
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 pl-7 pt-0.5">
              <span>✓ Zero popup GPS</span>
              <span>•</span>
              <span>✓ Visualizzazione passiva tappe</span>
            </div>
          </button>
        </div>

        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
