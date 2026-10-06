import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { getTripConfig } from '../../utils/tripConfig';

export default function GestioneViaggioView({ onBack }: { onBack: () => void }) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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

      // Generate a random 6-character alphanumeric code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Calculate expiration (7 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const inviteRef = doc(db, 'invites', code);
      await setDoc(inviteRef, {
        tripId: config.id,
        createdBy: user.uid,
        createdAt: Date.now(),
        expiresAt: expiresAt.getTime(),
        maxUses: 1,
        usedCount: 0
      });

      setInviteCode(code);
    } catch (err) {
      console.error('Errore generazione invito:', err);
      alert('Impossibile generare l\'invito. Verifica i permessi.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!inviteCode) return;
    const url = `${window.location.origin}/?join=${inviteCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          <p className="text-xs text-slate-500 font-medium">Invita collaboratori e gestisci gli accessi</p>
        </div>
      </header>

      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl mb-4">
          👥
        </div>
        <h3 className="font-extrabold text-slate-900 text-lg mb-2">Invita un Co-pilota</h3>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Genera un link di invito per permettere a una persona di accedere e modificare questo viaggio. Il link sarà valido per 7 giorni.
        </p>

        {!inviteCode ? (
          <button
            onClick={generateInvite}
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold bg-slate-900 text-white shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Generazione...' : 'Genera Link Invito'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <span className="block text-xs text-slate-500 font-medium mb-1">Codice Invito</span>
              <span className="text-3xl font-black tracking-widest text-slate-900">{inviteCode}</span>
            </div>
            
            <button
              onClick={copyToClipboard}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold bg-indigo-600 text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? 'Copiato!' : 'Copia Link Condivisibile'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
