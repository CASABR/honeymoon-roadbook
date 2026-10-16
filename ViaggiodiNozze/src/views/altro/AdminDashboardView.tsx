import { useState, useEffect } from 'react';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { getTripConfig } from '../../utils/tripConfig';

interface StorageEstimateData {
  quota: number;
  usage: number;
  remaining: number;
  percentUsed: number;
  supported: boolean;
  measuredAt: string;
}

export default function AdminDashboardView({ onBack }: { onBack: () => void }) {
  const { role, canEdit } = useDeviceRole();
  const tripConfig = getTripConfig();

  // Ruolo verifica
  const isAuthorized = role === 'guida' || role === 'copilota' || (typeof localStorage !== 'undefined' && localStorage.getItem('is_sposi_admin') === 'true');

  // Storage info
  const [storageData, setStorageData] = useState<StorageEstimateData | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);

  // Connectivity & Sync Diagnostics
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [recentEvents, setRecentEvents] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'warn' | 'success' }>>([]);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const measureStorage = async () => {
    setStorageLoading(true);
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usage = est.usage || 0;
        const quota = est.quota || 0;
        const remaining = Math.max(0, quota - usage);
        const percent = quota > 0 ? (usage / quota) * 100 : 0;

        setStorageData({
          quota,
          usage,
          remaining,
          percentUsed: Math.min(100, Math.max(0, percent)),
          supported: true,
          measuredAt: new Intl.DateTimeFormat('it-IT', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
          }).format(new Date())
        });
      } catch (err) {
        console.warn('Errore lettura storage estimate:', err);
        setStorageData({
          quota: 0,
          usage: 0,
          remaining: 0,
          percentUsed: 0,
          supported: false,
          measuredAt: new Date().toLocaleTimeString('it-IT')
        });
      }
    } else {
      setStorageData({
        quota: 0,
        usage: 0,
        remaining: 0,
        percentUsed: 0,
        supported: false,
        measuredAt: new Date().toLocaleTimeString('it-IT')
      });
    }
    setStorageLoading(false);
  };

  useEffect(() => {
    measureStorage();

    const handleOnline = () => {
      setIsOnline(true);
      logDiag('Connessione internet ripristinata', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      logDiag('Dispositivo offline: modalità locale attiva', 'warn');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleSync = () => {
      logDiag('Sincronizzazione cloud completata', 'success');
      measureStorage();
    };
    const handleMutated = (e: Event) => {
      const custom = e as CustomEvent;
      const entity = custom.detail?.entityType || 'dati';
      logDiag(`Modifica locale salvata (${entity})`, 'info');
    };

    window.addEventListener('roadbook_cloud_synced', handleSync);
    window.addEventListener('roadbook_data_mutated', handleMutated);

    logDiag('Dashboard Admin inizializzata', 'info');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('roadbook_cloud_synced', handleSync);
      window.removeEventListener('roadbook_data_mutated', handleMutated);
    };
  }, []);

  const logDiag = (text: string, type: 'info' | 'warn' | 'success') => {
    const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRecentEvents(prev => [{ id: Math.random().toString(36).substring(2, 9), time, text, type }, ...prev.slice(0, 19)]);
  };

  if (!isAuthorized) {
    return (
      <div className="space-y-4 pt-2 animate-fade-in pb-12 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            ← Indietro
          </button>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Accesso Riservato</h1>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-3xl p-6 text-center space-y-3">
          <span className="text-4xl">🔒</span>
          <h2 className="text-base font-extrabold text-amber-900 dark:text-amber-200">Area Amministrativa Non Accessibile</h2>
          <p className="text-xs text-amber-800/90 dark:text-amber-300 max-w-md mx-auto leading-relaxed">
            Questa console è riservata agli amministratori e gestori del viaggio (ruolo Guida o Co-pilota autorizzato). 
            Se disponi delle credenziali di accesso, verifica il tuo ruolo in <strong>Altro &gt; Ruolo Dispositivo</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1 animate-fade-in pb-12 max-w-4xl mx-auto">
      {/* Intestazione */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-bold text-sm"
          >
            ← Indietro
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🛠️</span>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Dashboard Amministrazione
              </h1>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                ADMIN
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Diagnostica storage, connettività, stato del viaggio e metriche locali
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={measureStorage}
          disabled={storageLoading}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 disabled:opacity-50"
        >
          {storageLoading ? 'Aggiornamento...' : '🔄 Ricarica'}
        </button>
      </div>

      {/* Grid Riepilogo Stato */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Stato Rete */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
            <span>Connettività</span>
            <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white">
            {isOnline ? 'Online' : 'Offline'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isOnline ? 'Connesso a Internet' : 'Funzionamento solo locale'}
          </div>
        </div>

        {/* Card 2: Ruolo Dispositivo */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
            <span>Ruolo Attivo</span>
            <span className="text-sm">👑</span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white capitalize">
            {role}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {canEdit ? 'Accesso Scrittura / Modifica' : 'Sola Lettura'}
          </div>
        </div>

        {/* Card 3: Viaggio Attivo */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
            <span>Viaggio Attivo</span>
            <span className="text-sm">✈️</span>
          </div>
          <div className="text-base font-extrabold text-slate-900 dark:text-white truncate" title={tripConfig?.title || 'Predefinito'}>
            {tripConfig?.title || 'Predefinito'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
            ID: {tripConfig?.id || '0000'}
          </div>
        </div>

        {/* Card 4: Build / Versione */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
            <span>Versione App</span>
            <span className="text-sm">📦</span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white">
            Hounigo v2.4
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            PWA con IndexedDB
          </div>
        </div>
      </div>

      {/* Avviso Architetturale Sicurezza & Autorizzazioni Client */}
      <div className="bg-slate-100/80 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
        <span className="text-sm shrink-0">🛡️</span>
        <div className="space-y-0.5">
          <p className="font-bold text-slate-900 dark:text-white">Trasparenza Sicurezza &amp; Dati della Console</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            I dati mostrati in questa dashboard (stima memoria locale del browser, stato connessione, log eventi dell'istanza locale) non espongono segreti, token o dati privati di altri viaggi. 
            Il ruolo dispositivo (Guida / Copilota) è configurato localmente; per eventuali operazioni amministrative distruttive sul backend Firestore o modifiche strutturali, la sicurezza è demandata esclusivamente alle regole di sicurezza Firestore lato server e all'appartenenza verificata a <code className="text-indigo-600 dark:text-indigo-400">/trips/{'{tripId}'}/members</code>.
          </p>
        </div>
      </div>

      {/* Sezione Storage e Quote */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Storage Locale Dispositivo */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">💾</span>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Memoria Locale Dispositivo</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Dati salvati nel browser (IndexedDB + Storage API)
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              navigator.storage
            </span>
          </div>

          {storageLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : storageData?.supported ? (
            <div className="space-y-3">
              {/* Barra di Avanzamento */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  <span>Utilizzato: {formatBytes(storageData.usage)}</span>
                  <span>Disponibile: {formatBytes(storageData.remaining)}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      storageData.percentUsed > 85 ? 'bg-rose-500' : storageData.percentUsed > 60 ? 'bg-amber-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${Math.max(1, storageData.percentUsed)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  <span>Quota totale allocabile: {formatBytes(storageData.quota)}</span>
                  <span className="font-semibold">{storageData.percentUsed.toFixed(1)}% occupato</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Rilevamento affidabile: SI</span>
                <span>Rilevato alle: {storageData.measuredAt}</span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-bold text-slate-900 dark:text-white">API Stima non disponibile</p>
              <p>Il browser in uso non espone <code>navigator.storage.estimate()</code> oppure la navigazione anonima limita l'accesso alla stima.</p>
            </div>
          )}
        </div>

        {/* Archiviazione Cloud Firestore */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">☁️</span>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Archiviazione Cloud (Firestore)</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Quota e limiti del database di sincronizzazione
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              DATO REALE
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
            <div className="flex items-start gap-2">
              <span className="text-base text-amber-500 shrink-0">ℹ️</span>
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-extrabold text-slate-900 dark:text-white">Dato di quota cloud non esposto direttamente dal client</p>
                <p className="leading-relaxed">
                  L'SDK Web client di Google Cloud Firestore non fornisce una chiamata per misurare l'occupazione totale del database o la percentuale residua del piano Spark.
                </p>
              </div>
            </div>
            <div className="text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 space-y-1">
              <p><strong>Politica Trasparenza Hounigo:</strong> Nessuna quota cloud fittizia viene simulata.</p>
              <p>Per consultare le operazioni di lettura/scrittura e lo storage effettivo, accedere alla console ufficiale di Google Cloud / Firebase Console.</p>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1">
            <span>Fonte: Firebase Client SDK v10</span>
            <span>Piano: No Blaze (Spark Free)</span>
          </div>
        </div>
      </div>

      {/* Registro Eventi e Diagnostica Recente */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Registro Diagnostica Locale</h2>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {recentEvents.length} eventi registrati
          </span>
        </div>

        {recentEvents.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Nessun evento recente
          </div>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar font-mono text-xs">
            {recentEvents.map(evt => (
              <div
                key={evt.id}
                className={`p-2 rounded-xl flex items-center justify-between border ${
                  evt.type === 'warn'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200'
                    : evt.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span>{evt.type === 'warn' ? '⚠️' : evt.type === 'success' ? '✅' : 'ℹ️'}</span>
                  <span className="truncate">{evt.text}</span>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0 ml-2">{evt.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
