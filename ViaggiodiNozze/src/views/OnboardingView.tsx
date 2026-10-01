import { useState } from 'react';
import { saveTripConfig } from '../utils/tripConfig';

export default function OnboardingView() {
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  
  // Create state
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Join state
  const [inviteCode, setInviteCode] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate || !endDate) return;
    
    const id = 'trip_' + Math.random().toString(36).substring(2, 9);
    saveTripConfig({ id, title, startDate, endDate });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    
    // In a real app, we'd fetch the trip config from Firestore using the inviteCode.
    // For now, we simulate fetching it and assuming dates for Demo purposes.
    // Assuming the user is joining the "Honeymoon" if they type something.
    saveTripConfig({
      id: inviteCode.trim(),
      title: 'Viaggio Sincronizzato',
      startDate: '2026-11-28', // Fallback
      endDate: '2027-01-10'
    });
  };

  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/60 p-8 text-center space-y-8 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-blue-50 to-transparent"></div>
          
          <div className="relative z-10 space-y-4">
            <div className="w-20 h-20 mx-auto bg-blue-600 rounded-3xl flex items-center justify-center text-white text-4xl shadow-lg shadow-blue-600/30 rotate-3">
              🌍
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Benvenuto!</h1>
            <p className="text-slate-500 font-medium">Il tuo Roadbook digitale è pronto. Come vuoi iniziare?</p>
          </div>

          <div className="relative z-10 space-y-4 pt-4">
            <button 
              onClick={() => setMode('create')}
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg shadow-md hover:bg-blue-500 transition-all active:scale-95"
            >
              ✨ Crea Nuovo Viaggio
            </button>
            <button 
              onClick={() => setMode('join')}
              className="w-full py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold text-lg hover:bg-slate-200 transition-all active:scale-95 border border-slate-200"
            >
              🤝 Unisciti a un Viaggio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <form onSubmit={handleCreate} className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/60 p-8 space-y-6 relative">
          <button type="button" onClick={() => setMode('select')} className="absolute top-6 left-6 text-slate-400 hover:text-slate-700">
            ← Indietro
          </button>
          <div className="text-center pt-8">
            <h2 className="text-2xl font-bold text-slate-900">Crea Viaggio</h2>
            <p className="text-slate-500 text-sm mt-1">Imposta le date per generare il calendario.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nome del Viaggio</label>
              <input required type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Giappone 2026" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Partenza</label>
                <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ritorno</label>
                <input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-sm" />
              </div>
            </div>
          </div>

          <button type="submit" className="w-full py-4 mt-4 rounded-2xl bg-blue-600 text-white font-bold text-lg shadow-md hover:bg-blue-500 transition-all active:scale-95">
            Genera Roadbook 🚀
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <form onSubmit={handleJoin} className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/60 p-8 space-y-6 relative">
        <button type="button" onClick={() => setMode('select')} className="absolute top-6 left-6 text-slate-400 hover:text-slate-700">
          ← Indietro
        </button>
        <div className="text-center pt-8">
          <h2 className="text-2xl font-bold text-slate-900">Unisciti al Viaggio</h2>
          <p className="text-slate-500 text-sm mt-1">Inserisci il codice invito della tua Guida.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Codice Invito</label>
          <input required type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Es. trip_xyz123" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-center tracking-widest text-lg" />
        </div>

        <button type="submit" className="w-full py-4 mt-4 rounded-2xl bg-slate-900 text-white font-bold text-lg shadow-md hover:bg-slate-800 transition-all active:scale-95">
          Connettiti 🔗
        </button>
      </form>
    </div>
  );
}
