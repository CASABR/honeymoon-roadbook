import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import Modal from './Modal';
import releaseHistory from '../../data/releaseHistory.json';
import { APP_VERSION, BUILD_TIME, COMMIT_HASH } from '../../utils/appVersion';
import {
  APP_UPDATE_STATE_EVENT,
  isAppUpdateAvailable,
} from '../../utils/appUpdateState';

export const OPEN_APP_INFO_EVENT = 'open_hounigo_app_info';

interface ReleaseEntry {
  version: string;
  publishedAt: string;
  sourceCommit: string;
  changes: string[];
}

function formatPublishedDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
}

export function openAppInfo(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_APP_INFO_EVENT));
  }
}

export function AppInfoButton() {
  return (
    <button
      type="button"
      onClick={openAppInfo}
      className="flex h-11 w-11 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-xl bg-transparent text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200 cursor-pointer"
      aria-label="Informazioni su HOUNIGO"
      title="Informazioni su HOUNIGO"
    >
      <Info aria-hidden="true" size={18} strokeWidth={1.8} />
    </button>
  );
}

export default function AppInfoModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(isAppUpdateAvailable);
  const releases = useMemo(
    () => (releaseHistory.releases as ReleaseEntry[]).slice(0, 10),
    []
  );
  const installedRelease = releases.find((release) => release.version === APP_VERSION);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleUpdateState = (event: Event) => {
      const detail = (event as CustomEvent<{ available?: boolean }>).detail;
      setUpdateAvailable(Boolean(detail?.available));
    };
    window.addEventListener(OPEN_APP_INFO_EVENT, handleOpen);
    window.addEventListener(APP_UPDATE_STATE_EVENT, handleUpdateState);
    return () => {
      window.removeEventListener(OPEN_APP_INFO_EVENT, handleOpen);
      window.removeEventListener(APP_UPDATE_STATE_EVENT, handleUpdateState);
    };
  }, []);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Informazioni su HOUNIGO"
      accentVariant="sky"
      centered
    >
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Versione installata</p>
            <p className="mt-1 text-xl font-black text-[#172033] dark:text-white">HOUNIGO v{APP_VERSION}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pubblicata {installedRelease ? formatPublishedDate(installedRelease.publishedAt) : 'in data non disponibile'}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
            updateAvailable
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
          }`}>
            {updateAvailable ? 'Aggiornamento disponibile' : 'Versione aggiornata'}
          </span>
        </div>
        {updateAvailable && (
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
            L’aggiornamento è pronto: usa il messaggio di aggiornamento della PWA per installarlo.
          </p>
        )}
      </section>

      <section aria-labelledby="release-history-title">
        <h3 id="release-history-title" className="text-sm font-black text-[#172033] dark:text-white">
          Ultimi aggiornamenti pubblicati
        </h3>
        <div className="mt-3 space-y-3">
          {releases.map((release) => (
            <article key={release.version} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-extrabold text-sm text-[#172033] dark:text-white">Versione {release.version}</p>
                <time className="text-[11px] text-slate-500 dark:text-slate-400" dateTime={release.publishedAt}>
                  {formatPublishedDate(release.publishedAt)}
                </time>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {release.changes.slice(0, 3).map((change) => (
                  <li key={change} className="flex gap-2">
                    <span aria-hidden="true" className="text-[#FF6B5F]">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <details className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer font-bold">Dettagli tecnici</summary>
        <p className="mt-2 font-mono">Commit {COMMIT_HASH}{BUILD_TIME ? ` · Build ${BUILD_TIME}` : ''}</p>
      </details>
    </Modal>
  );
}
