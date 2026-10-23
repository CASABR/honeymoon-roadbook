import { useState } from 'react';
import { useAuthIdentity } from '../../utils/useAuthIdentity';

interface IdentityStatusBadgeProps {
  compact?: boolean;
}

export default function IdentityStatusBadge({ compact = false }: IdentityStatusBadgeProps) {
  const {
    currentUid,
    tripId,
    ownerName,
    shortOwnerUid,
    isOwnerUidVerified,
    cloudRole,
    isCloudAuthorized,
    deviceRole,
    hasDiscrepancy,
    discrepancyMessage,
    isSimulated,
    simulatedRole,
    setSimulatedRole
  } = useAuthIdentity();

  const [copiedUid, setCopiedUid] = useState(false);

  const handleCopyCurrentUid = async () => {
    if (!currentUid) return;
    try {
      await navigator.clipboard.writeText(currentUid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const renderCompactRole = () => {
    switch (cloudRole) {
      case 'checking':
        return <span className="text-slate-400 italic">⏳ Verifica...</span>;
      case 'offline':
        return <span className="text-amber-600 font-semibold">📡 Offline</span>;
      case 'unverified':
        return <span className="text-amber-600 font-semibold">⚠️ Non verificato</span>;
      case 'owner':
        return <span className="text-amber-700 font-bold">👑 Owner</span>;
      case 'copilota':
        return <span className="text-emerald-600 font-bold">🤝 Copilota</span>;
      case 'admin':
        return <span className="text-indigo-600 font-bold">🛡️ Admin</span>;
      case 'viewer':
      default:
        return <span className="text-slate-600 dark:text-slate-300 font-semibold">👁️ Viewer (Confermato)</span>;
    }
  };

  const renderCloudBadge = () => {
    switch (cloudRole) {
      case 'checking':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 animate-pulse">
            ⏳ Verifica identità in corso…
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
            📡 Offline (Ruolo non verificato)
          </span>
        );
      case 'unverified':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
            ⚠️ Ruolo non verificato
          </span>
        );
      case 'owner':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
            👑 Owner Verificato
          </span>
        );
      case 'copilota':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
            🤝 Copilota Verificato
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700">
            🛡️ Amministratore Globale
          </span>
        );
      case 'viewer':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
            👁️ Viewer / Ospite (Confermato)
          </span>
        );
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-1 text-[11px] py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
        <div className="flex items-center justify-between gap-1">
          <span className="font-bold text-slate-500 dark:text-slate-400">Owner:</span>
          <span className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1">
            <span>👑</span>
            <span>{ownerName}</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-slate-500 dark:text-slate-400">Tuo Accesso:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {renderCompactRole()}
          </span>
        </div>
        {hasDiscrepancy && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 mt-0.5">
            <span>⚠️</span>
            <span>Discrepanza ruolo locale vs cloud</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
      {/* Intestazione Identità Viaggio */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2.5">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
            Organizzatore del Viaggio {tripId ? `(${tripId})` : ''}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-sm">👑</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100">
              {ownerName}
            </span>
            <span
              className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                isOwnerUidVerified
                  ? 'text-slate-400 dark:text-slate-500 bg-slate-200/60 dark:bg-slate-700/60'
                  : 'text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/40'
              }`}
              title={isOwnerUidVerified ? `UID Owner: ${shortOwnerUid}` : 'UID Owner non ancora confermato da Firestore'}
            >
              {shortOwnerUid}
            </span>
          </div>
        </div>

        {/* Badge Cloud Verificato */}
        <div className="text-right">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
            Stato Cloud
          </span>
          <div className="mt-0.5">
            {renderCloudBadge()}
          </div>
        </div>
      </div>

      {/* Dati Sessione Dispositivo Corrente */}
      <div className="space-y-2 text-xs">
        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 border border-slate-200/80 dark:border-slate-600/60 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              Il TUO UID Dispositivo:
            </span>
            {currentUid && (
              <button
                type="button"
                onClick={handleCopyCurrentUid}
                className="px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[10px] font-bold transition-all cursor-pointer shadow-xs"
              >
                {copiedUid ? '✓ Copiato!' : 'Copia il tuo UID'}
              </button>
            )}
          </div>
          <div className="font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 break-all select-all">
            {currentUid || 'Non connesso'}
          </div>
          <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
            Questo è l'identificativo di questo dispositivo da comunicare a Nunzio per l'autorizzazione.
          </p>
        </div>

        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
          <span className="text-[11px] font-medium text-slate-400">Ruolo Locale (Dispositivo):</span>
          <span className="font-bold capitalize text-slate-800 dark:text-slate-100 flex items-center gap-1">
            <span>
              {deviceRole === 'guida'
                ? (isCloudAuthorized && cloudRole === 'owner' ? '🟢' : '🟡')
                : deviceRole === 'copilota'
                ? (isCloudAuthorized && (cloudRole === 'copilota' || cloudRole === 'owner') ? '🟢' : '🟡')
                : '💻'}
            </span>
            <span>
              {deviceRole === 'guida'
                ? (isCloudAuthorized && cloudRole === 'owner' ? 'Guida (GPS)' : 'Guida (Non verificato)')
                : deviceRole === 'copilota'
                ? (isCloudAuthorized && (cloudRole === 'copilota' || cloudRole === 'owner') ? 'Copilota (Verificato)' : 'Copilota (Non verificato)')
                : 'Viewer'}
            </span>
          </span>
        </div>
      </div>

      {/* Discrepanza Alert */}
      {hasDiscrepancy && (
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-200 leading-snug">
          <div className="font-bold flex items-center gap-1.5 mb-0.5">
            <span>⚠️</span>
            <span>Discrepanza Ruolo Rilevata</span>
          </div>
          <p className="text-[10px] text-amber-700 dark:text-amber-300">
            {discrepancyMessage}
          </p>
          <p className="text-[9px] text-amber-600/90 dark:text-amber-400/90 mt-1 italic">
            I permessi di scrittura e GPS su Firestore sono vincolati al Cloud, non alla selezione locale.
          </p>
        </div>
      )}

      {/* MODALITÀ TEST SIMULATA (Solo ambiente di sviluppo) */}
      {import.meta.env.DEV && (
        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <span>🧪</span>
              <span>Simulatore Ruoli (Dev Mode)</span>
            </span>
            {isSimulated && (
              <span className="text-[9px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.2 rounded">
                SIMULATO: {simulatedRole}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-400 mb-2">
            Simula il comportamento dell'interfaccia senza modificare il database reale né i permessi Firestore.
          </p>
          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => setSimulatedRole(null)}
              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                !isSimulated
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              Reale
            </button>
            <button
              type="button"
              onClick={() => setSimulatedRole('owner')}
              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                simulatedRole === 'owner'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-amber-50'
              }`}
            >
              👑 Owner
            </button>
            <button
              type="button"
              onClick={() => setSimulatedRole('copilota')}
              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                simulatedRole === 'copilota'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-emerald-50'
              }`}
            >
              🤝 Copilota
            </button>
            <button
              type="button"
              onClick={() => setSimulatedRole('viewer')}
              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                simulatedRole === 'viewer'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-sky-50'
              }`}
            >
              👁️ Viewer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
