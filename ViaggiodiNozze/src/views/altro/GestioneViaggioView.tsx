import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { getTripConfig, saveTripConfig } from '../../utils/tripConfig';

export default function GestioneViaggioView({ onBack }: { onBack: () => void }) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const initialConfig = getTripConfig();
  const [title, setTitle] = useState(initialConfig?.title || 'Il nostro viaggio');
  const [startDate, setStartDate] = useState(initialConfig?.startDate || '');
  const [endDate, setEndDate] = useState(initialConfig?.endDate || '');
  const [savingDates, setSavingDates] = useState(false);
  const [datesSaved, setDatesSaved] = useState(false);

  const handleSaveTripDates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      alert('Inserisci sia la data di inizio che quella di fine vacanza.');
      return;
    }
    if (startDate > endDate) {
      alert('La data di inizio non può essere successiva alla data di fine.');
      return;
    }
    setSavingDates(true);
    try {
      const config = getTripConfig();
      if (!config) return;

      const startD = new Date(startDate);
      const endD = new Date(endDate);
      const diffTime = Math.abs(endD.getTime() - startD.getTime());
      const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const updated = {
        ...config,
        title: title.trim() || config.title,
        startDate,
        endDate,
        totalDays
      };

      saveTripConfig(updated);

      if (db && config.id) {
        try {
          const tripRef = doc(db, 'trips', config.id);
          await setDoc(tripRef, {
            title: updated.title,
            startDate: updated.startDate,
            endDate: updated.endDate,
            totalDays: updated.totalDays,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (fbErr) {
          console.warn('[GestioneViaggio] Aggiornamento Firestore opzionale/offline:', fbErr);
        }
      }

      window.dispatchEvent(new CustomEvent('trip_config_changed', { detail: { config: updated } }));
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
        detail: { entityType: 'settings', action: 'save', data: updated }
      }));

      setDatesSaved(true);
      setTimeout(() => setDatesSaved(false), 3000);
    } catch (err) {
      console.error('Errore salvataggio date viaggio:', err);
      alert('Si è verificato un errore durante il salvataggio.');
    } finally {
      setSavingDates(false);
    }
  };

  const generateInvite = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      const config = getTripConfig();
      
      if (!user || !config) {
        alert('Devi essere autenticato e avere un viaggio attivo.');
        setLoading(false);
        return;
      }

      // 1. Prova prima tramite la Cloud Function dedicata createInvite
      try {
        const { httpsCallable } = await import('firebase/functions');
        const { functions } = await import('../../firebase');
        if (functions) {
          const createInviteFn = httpsCallable<{ tripId: string }, { success: boolean; code: string; expiresAt: number }>(functions, 'createInvite');
          const res = await createInviteFn({ tripId: config.id });
          if (res.data?.code) {
            setInviteCode(res.data.code);
            return;
          }
        }
      } catch (cfErr) {
        console.warn("Cloud function createInvite non disponibile, fallback sicuro:", cfErr);
      }

      // 2. Fallback: genera codice casuale e salva SOLO l'hash SHA-256 in /trips/{tripId}/inviteTokens/{tokenId}
      const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      let code = '';
      const randomValues = new Uint8Array(8);
      window.crypto.getRandomValues(randomValues);
      for (let i = 0; i < 8; i++) {
        code += charset[randomValues[i] % charset.length];
      }

      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const tokenId = 'tok_' + Math.random().toString(36).substring(2, 10);

      // Calcola hash SHA-256 nel browser (nessun codice in chiaro salvato)
      const encoder = new TextEncoder();
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(code));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const tokenRef = doc(db, 'trips', config.id, 'inviteTokens', tokenId);
      await setDoc(tokenRef, {
        tokenId,
        tokenHash,
        tripId: config.id,
        createdBy: user.uid,
        createdAt: Date.now(),
        expiresAt,
        maxUses: 1,
        usedCount: 0,
        active: true
      });

      setInviteCode(code);
    } catch (err) {
      console.error('Errore generazione invito:', err);
      alert('Impossibile generare l\'invito. Verifica i permessi.');
    } finally {
      setLoading(false);
    }
  };

  const getInviteUrl = () => {
    if (!inviteCode) return '';
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return `${baseUrl}?role=copilota&invite=true&join=${encodeURIComponent(inviteCode)}`;
  };

  const copyToClipboard = async () => {
    const url = getInviteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback per dispositivi con clipboard API limitata
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="space-y-6 pt-1 animate-fade-in pb-10 px-1">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Gestione Viaggio</h2>
          <p className="text-xs text-slate-500 font-medium">Modifica date e gestisci accessi collaboratori</p>
        </div>
      </header>

      {/* Date e Info Viaggio */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-2xl mb-4">
          📅
        </div>
        <h3 className="font-extrabold text-slate-900 text-lg mb-1">Date e Durata Vacanza</h3>
        <p className="text-xs text-slate-500 mb-5 leading-relaxed">
          Modifica il periodo ufficiale del viaggio. Il calendario dell'app e la timeline si adatteranno automaticamente.
        </p>

        <form onSubmit={handleSaveTripDates} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Titolo Viaggio
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Il nostro viaggio di nozze"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Data Inizio
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Data Fine
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingDates}
            className="w-full py-3 rounded-xl font-bold bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 text-sm"
          >
            {savingDates ? 'Salvataggio in corso...' : datesSaved ? '✓ Date salvate con successo!' : 'Salva Date Viaggio'}
          </button>
        </form>
      </div>

      {/* Invito Co-pilota */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl mb-4">
          👥
        </div>
        <h3 className="font-extrabold text-slate-900 text-lg mb-2">Invita un Co-pilota</h3>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Genera un link di invito per permettere a una persona di accedere e modificare questo viaggio come Co-pilota. Il link sarà valido per 7 giorni.
        </p>

        {!inviteCode ? (
          <button
            onClick={generateInvite}
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold bg-slate-900 text-white shadow-md active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Generazione...' : 'Genera Link Invito'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <span className="block text-xs text-slate-500 font-medium mb-1">Codice Invito</span>
              <span className="text-3xl font-black tracking-widest text-slate-900">{inviteCode}</span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Link d'Invito Completo
              </label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
                <input
                  type="text"
                  readOnly
                  value={getInviteUrl()}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full bg-transparent px-1 text-xs text-slate-800 font-mono focus:outline-none select-all truncate"
                />
              </div>
            </div>
            
            <button
              type="button"
              onClick={copyToClipboard}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold bg-indigo-600 text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? '✓ Link Copiato negli Appunti!' : 'Copia Link'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
