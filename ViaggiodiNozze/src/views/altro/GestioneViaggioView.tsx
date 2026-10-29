import { useState, useEffect } from 'react';
import { doc, setDoc, collection, getDocs, getDoc, arrayRemove, arrayUnion, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { getTripConfig, saveTripConfig } from '../../utils/tripConfig';
import { formatDateIT } from '../../utils/tripDates';
import { createTripInvite } from '../../services/tripInviteService';

export interface TripMemberInfo {
  uid: string;
  name?: string;
  email?: string;
  role: 'owner' | 'copilota' | 'member';
  createdAt?: number;
  status?: string;
}

export default function GestioneViaggioView({ onBack }: { onBack: () => void }) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const initialConfig = getTripConfig();
  const [title, setTitle] = useState(initialConfig?.title || 'Il nostro viaggio');
  const [ownerName, setOwnerName] = useState(initialConfig?.ownerName || '');
  const [startDate, setStartDate] = useState(initialConfig?.startDate || '');
  const [endDate, setEndDate] = useState(initialConfig?.endDate || '');
  const [savingDates, setSavingDates] = useState(false);
  const [datesSaved, setDatesSaved] = useState(false);

  // Gestione Partecipanti
  const [members, setMembers] = useState<TripMemberInfo[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberToKick, setMemberToKick] = useState<TripMemberInfo | null>(null);
  const [isKicking, setIsKicking] = useState(false);
  const [kickSuccessMsg, setKickSuccessMsg] = useState<string | null>(null);
  const [kickErrorMsg, setKickErrorMsg] = useState<string | null>(null);
  const [newMemberUid, setNewMemberUid] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberSuccess, setAddMemberSuccess] = useState<string | null>(null);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Immagine Header Centralizzata
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(() => {
    if (initialConfig?.headerImageUrl) return initialConfig.headerImageUrl;
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('trip_header_image') || null;
    }
    return null;
  });
  const [savingHeaderImg, setSavingHeaderImg] = useState(false);

  const handleImageUpload = (file: File) => {
    if (!file) return;
    setSavingHeaderImg(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800; // max dimensione per mantenere il Base64 sotto i 300-400KB

        if (width > height && width > MAX_SIZE) {
          height = Math.round(height * (MAX_SIZE / width));
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width = Math.round(width * (MAX_SIZE / height));
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          setHeaderImageUrl(dataUrl);

          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('trip_header_image', dataUrl);
            localStorage.setItem('hero_bg_image', dataUrl);
          }

          const config = getTripConfig();
          if (config) {
            const updated = { ...config, headerImageUrl: dataUrl };
            saveTripConfig(updated);
            if (db && config.id) {
              try {
                await setDoc(doc(db, 'trips', config.id), {
                  headerImageUrl: dataUrl,
                  updatedAt: Date.now()
                }, { merge: true });
              } catch (err) {
                console.warn('[GestioneViaggio] Errore salvataggio headerImageUrl in Firestore:', err);
              }
            }
            window.dispatchEvent(new CustomEvent('trip_config_changed', { detail: { config: updated } }));
            window.dispatchEvent(new CustomEvent('trip_header_image_updated', { detail: { headerImageUrl: dataUrl } }));
          }
        }
        setSavingHeaderImg(false);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveHeaderImage = async () => {
    setHeaderImageUrl(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('trip_header_image');
      localStorage.removeItem('hero_bg_image');
    }
    const config = getTripConfig();
    if (config) {
      const updated = { ...config, headerImageUrl: null };
      saveTripConfig(updated);
      if (db && config.id) {
        try {
          await setDoc(doc(db, 'trips', config.id), {
            headerImageUrl: null,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (err) {
          console.warn('[GestioneViaggio] Errore rimozione headerImageUrl in Firestore:', err);
        }
      }
      window.dispatchEvent(new CustomEvent('trip_config_changed', { detail: { config: updated } }));
      window.dispatchEvent(new CustomEvent('trip_header_image_updated', { detail: { headerImageUrl: null } }));
    }
  };

  // Caricamento partecipanti
  const fetchMembers = async () => {
    const config = getTripConfig();
    if (!config || !config.id || !db) return;
    setLoadingMembers(true);
    try {
      const tripRef = doc(db, 'trips', config.id);
      const tripSnap = await getDoc(tripRef).catch(() => null);
      const tripData = tripSnap?.data();

      const membersColRef = collection(db, 'trips', config.id, 'members');
      const snap = await getDocs(membersColRef).catch(() => null);
      const list: TripMemberInfo[] = [];

      if (snap && !snap.empty) {
        snap.docs.forEach(d => {
          const m = d.data();
          const isOwner = Boolean(tripData?.ownerUid && d.id === tripData.ownerUid);
          list.push({
            uid: d.id,
            name: m.name || m.displayName || (isOwner ? tripData?.ownerName : undefined),
            email: m.email,
            role: isOwner ? 'owner' : (m.role || 'copilota'),
            createdAt: m.createdAt,
            status: m.status
          });
        });
      } else if (tripData) {
        // Fallback dall'array members del documento trip
        const memberIds: string[] = Array.isArray(tripData.members) ? tripData.members : (tripData.ownerUid ? [tripData.ownerUid] : []);
        memberIds.forEach(uid => {
          const isOwner = Boolean(tripData.ownerUid && uid === tripData.ownerUid);
          list.push({
            uid,
            name: isOwner ? tripData.ownerName : undefined,
            role: isOwner ? 'owner' : 'copilota'
          });
        });
      }

      // Normalizzazione deterministica per la sola UI:
      // L'owner effettivo confermato dal documento remoto radice compare sempre UNA sola volta e in cima
      const trustedOwnerUid = tripData?.ownerUid;
      if (trustedOwnerUid) {
        const existingIdx = list.findIndex(m => m.uid === trustedOwnerUid);
        let ownerItem: TripMemberInfo;
        if (existingIdx >= 0) {
          const existing = list[existingIdx];
          ownerItem = {
            ...existing,
            role: 'owner',
            name: existing.name || tripData?.ownerName
          };
          list.splice(existingIdx, 1);
        } else {
          ownerItem = {
            uid: trustedOwnerUid,
            name: tripData?.ownerName,
            role: 'owner',
            createdAt: tripData?.createdAt
          };
        }
        list.unshift(ownerItem);
      }

      setMembers(list);
    } catch (err) {
      console.warn('[GestioneViaggio] Errore caricamento membri:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleKickMember = async () => {
    if (!memberToKick) return;
    const config = getTripConfig();
    if (!config?.id) return;

    // Controllo client per sicurezza
    if (memberToKick.role === 'owner' || memberToKick.uid === config.ownerUid) {
      alert('Non è possibile espellere l’organizzatore del viaggio.');
      return;
    }
    if (auth?.currentUser && memberToKick.uid === auth.currentUser.uid) {
      alert('Non puoi espellere te stesso dal viaggio.');
      return;
    }

    setIsKicking(true);
    setKickErrorMsg(null);
    setKickSuccessMsg(null);

    // Timeout di guardia (15s) per prevenire caricamento infinito su problemi di rete
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout durante l\'operazione di espulsione. Verifica la connessione di rete e riprova.')), 15000)
    );

    try {
      if (!db) {
        throw new Error('Database Firestore non inizializzato.');
      }

      // Esecuzione atomica client-side Firestore con writeBatch (compatibile Firebase Spark, 0 Cloud Functions)
      const kickTask = (async () => {
        const batch = writeBatch(db);
        const tripRef = doc(db, 'trips', config.id);
        batch.update(tripRef, {
          members: arrayRemove(memberToKick.uid),
          updatedAt: Date.now()
        });

        const memberRef = doc(db, 'trips', config.id, 'members', memberToKick.uid);
        batch.delete(memberRef);
        await batch.commit();
      })();

      await Promise.race([kickTask, timeoutPromise]);

      setKickSuccessMsg(`Partecipante ${memberToKick.name || memberToKick.uid} espulso con successo dal viaggio.`);
      setMembers(prev => prev.filter(m => m.uid !== memberToKick.uid));
      setMemberToKick(null);
    } catch (err: any) {
      console.error('[GestioneViaggio] Errore espulsione partecipante:', err);
      setKickErrorMsg(err?.message || 'Errore durante l\'espulsione del partecipante.');
    } finally {
      setIsKicking(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUid = newMemberUid.trim();
    const cleanName = newMemberName.trim() || 'Co-pilota';
    if (!cleanUid) {
      setAddMemberError('Inserisci l\'UID del partecipante.');
      return;
    }
    const config = getTripConfig();
    if (!config?.id) {
      setAddMemberError('Nessun viaggio attivo.');
      return;
    }

    setAddingMember(true);
    setAddMemberError(null);
    setAddMemberSuccess(null);

    try {
      if (!db) throw new Error('Database Firebase non inizializzato.');

      const tripRef = doc(db, 'trips', config.id);
      const memberRef = doc(db, 'trips', config.id, 'members', cleanUid);
      const batch = writeBatch(db);
      batch.update(tripRef, {
        members: arrayUnion(cleanUid),
        updatedAt: Date.now()
      });
      batch.set(memberRef, {
        uid: cleanUid,
        name: cleanName,
        role: 'copilota',
        createdAt: Date.now()
      }, { merge: true });
      await batch.commit();

      setAddMemberSuccess(`Partecipante "${cleanName}" (${cleanUid.slice(0, 6)}...) aggiunto con successo come Co-pilota.`);
      setNewMemberUid('');
      setNewMemberName('');
      await fetchMembers();
      setTimeout(() => setAddMemberSuccess(null), 4000);
    } catch (err: any) {
      console.error('[GestioneViaggio] Errore aggiunta membro:', err);
      setAddMemberError(err?.message || 'Errore durante l\'aggiunta del partecipante. Verifica i permessi di organizzatore.');
    } finally {
      setAddingMember(false);
    }
  };

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

      const cleanOwnerName = ownerName.trim();
      const updated = {
        ...config,
        title: title.trim() || config.title,
        ownerName: cleanOwnerName || config.ownerName || undefined,
        startDate,
        endDate,
        totalDays,
        headerImageUrl: headerImageUrl || config.headerImageUrl || null
      };

      saveTripConfig(updated);

      if (db && config.id) {
        try {
          const tripRef = doc(db, 'trips', config.id);
          const tripPayload: any = {
            title: updated.title,
            startDate: updated.startDate,
            endDate: updated.endDate,
            totalDays: updated.totalDays,
            headerImageUrl: updated.headerImageUrl,
            updatedAt: Date.now()
          };
          if (updated.ownerName) {
            tripPayload.ownerName = updated.ownerName;
          }
          await setDoc(tripRef, tripPayload, { merge: true });

          const curUid = auth?.currentUser?.uid || config.ownerUid;
          if (curUid && updated.ownerName) {
            const memberRef = doc(db, 'trips', config.id, 'members', curUid);
            await setDoc(memberRef, {
              name: updated.ownerName,
              updatedAt: Date.now()
            }, { merge: true });
          }
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
      const config = getTripConfig();
      if (!config || !config.id) {
        alert('Nessun viaggio attivo trovato. Seleziona o crea un viaggio.');
        return;
      }

      if (config.id === '0000') {
        alert('Il viaggio master 0000 non supporta inviti copilota aperti.');
        return;
      }

      const res = await createTripInvite(config.id);
      setInviteCode(res.inviteToken);
      setInviteUrl(res.inviteLink);
    } catch (err: any) {
      console.error('Errore generazione invito crittografico:', err);
      alert(err?.message || 'Impossibile generare il link d\'invito. Verifica la connessione e i permessi.');
    } finally {
      setLoading(false);
    }
  };

  const getInviteUrl = () => {
    if (inviteUrl) return inviteUrl;
    if (!inviteCode) return '';
    const config = getTripConfig();
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return `${baseUrl}?join=${encodeURIComponent(config?.id || '')}&token=${encodeURIComponent(inviteCode)}`;
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

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Nome dell’Organizzatore
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Es. Mario Rossi"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Visibile ai partecipanti invitati e nel portale Admin.
            </p>
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

      {/* Immagine di Copertina / Header del Viaggio */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl mb-4">
          🖼️
        </div>
        <h3 className="font-extrabold text-slate-900 text-lg mb-1">Copertina del Viaggio</h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          L'immagine caricata sarà visibile nell'header su tutti i dispositivi sincronizzati (Master, Copilota e Viewer).
        </p>

        {headerImageUrl ? (
          <div className="space-y-3">
            <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-slate-200 group shadow-inner">
              <img
                src={headerImageUrl}
                alt="Copertina Viaggio"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 pointer-events-none" />
            </div>
            <div className="flex gap-2">
              <label className="flex-1 py-2.5 px-3 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs text-center cursor-pointer transition-colors">
                {savingHeaderImg ? 'Compressione in corso...' : 'Sostituisci Foto'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={savingHeaderImg}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleRemoveHeaderImage}
                disabled={savingHeaderImg}
                className="py-2.5 px-4 rounded-xl font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs transition-colors cursor-pointer"
              >
                Rimuovi
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="w-full border-2 border-dashed border-slate-200 hover:border-amber-400 bg-slate-50/70 hover:bg-amber-50/30 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
              <span className="text-2xl">📸</span>
              <span className="text-xs font-bold text-slate-700">Carica Immagine di Copertina</span>
              <span className="text-[10px] text-slate-400">JPG, PNG compressa automaticamente per il cloud</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={savingHeaderImg}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f);
                }}
              />
            </label>
          </div>
        )}
      </div>

      {/* Invito Co-pilota */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl mb-4">
          👥
        </div>
        <h3 className="font-extrabold text-slate-900 text-lg mb-2">Invita un Co-pilota</h3>
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          Condividi il link d'invito per consentire a un copilota di collegarsi al viaggio dal proprio smartphone.
        </p>

        {/* Generazione Link Crittografico */}
        <div className="mb-6">
          {!inviteCode ? (
            <button
              onClick={generateInvite}
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-2"
            >
              <span>🔗</span>
              <span>{loading ? 'Generazione link sicuro...' : 'Genera Link d\'Invito Sicuro'}</span>
            </button>
          ) : (
            <div className="space-y-3 p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Link di invito attivo</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">Scadenza: 7 giorni</span>
              </div>
              <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-xl p-2.5">
                <input
                  type="text"
                  readOnly
                  value={getInviteUrl()}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full bg-transparent px-1 text-xs text-slate-800 font-mono focus:outline-none select-all truncate"
                />
              </div>
              <button
                type="button"
                onClick={copyToClipboard}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all cursor-pointer text-xs"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {copied ? '✓ Link Copiato negli Appunti!' : 'Copia Link d\'Invito'}
              </button>
            </div>
          )}
        </div>

        {/* Autorizzazione Alternativa tramite UID */}
        <div className="border-t border-slate-100 pt-5">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer text-xs font-bold text-slate-500 uppercase tracking-wider select-none hover:text-slate-800 transition-colors">
              <span>Metodo alternativo: Autorizza UID Dispositivo</span>
              <span className="transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-3 pt-2">
              <form onSubmit={handleAddMember} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Se preferisci autorizzare manualmente il dispositivo del copilota senza link con token, inserisci il suo UID dispositivo qui sotto:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={newMemberUid}
                    onChange={(e) => setNewMemberUid(e.target.value)}
                    placeholder="UID dispositivo Co-pilota *"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Nome visualizzato (es. Co-pilota)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
                {addMemberError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                    ⚠️ {addMemberError}
                  </div>
                )}
                {addMemberSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                    ✓ {addMemberSuccess}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={addingMember || !newMemberUid.trim()}
                  className="w-full py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {addingMember ? 'Autorizzazione in corso...' : 'Autorizza UID'}
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>

      {/* Sezione Partecipanti al Viaggio */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center text-2xl">
              👥
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">Partecipanti al Viaggio</h3>
              <p className="text-xs text-slate-500">Membri registrati con accesso al roadbook</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchMembers}
            disabled={loadingMembers}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
            title="Aggiorna lista"
          >
            {loadingMembers ? '⏳' : '🔄'}
          </button>
        </div>

        {kickSuccessMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            ✓ {kickSuccessMsg}
          </div>
        )}
        {kickErrorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
            ⚠️ {kickErrorMsg}
          </div>
        )}

        {loadingMembers && members.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs font-medium">
            Caricamento partecipanti in corso...
          </div>
        ) : members.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs font-medium">
            Nessun partecipante registrato.
          </div>
        ) : (
          <div className="space-y-2.5">
            {members.map((m) => {
              const isOwner = m.role === 'owner' || m.uid === initialConfig?.ownerUid;
              const isCurrentDeviceUser = auth?.currentUser?.uid === m.uid;
              const isOwnerOrAdmin = initialConfig?.ownerUid === auth?.currentUser?.uid
                || members.some(mem => mem.uid === auth?.currentUser?.uid && mem.role === 'owner');
              const canKickThisMember = !isOwner && !isCurrentDeviceUser && isOwnerOrAdmin;

              return (
                <div
                  key={m.uid}
                  className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      isOwner ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {isOwner ? '👑' : '👤'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                          {m.name || 'Nome non specificato'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isOwner
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        }`}>
                          {isOwner ? 'Organizzatore' : 'Co-pilota'}
                        </span>
                        {isCurrentDeviceUser && (
                          <span className="text-[10px] text-slate-400 font-semibold">(Tu)</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="truncate">{m.email || 'Email non disponibile'}</span>
                        {m.createdAt && (
                          <>
                            <span>•</span>
                            <span>Adesione: {formatDateIT(m.createdAt)}</span>
                          </>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                        UID: {m.uid}
                      </div>
                    </div>
                  </div>

                  {canKickThisMember && (
                    <button
                      type="button"
                      onClick={() => setMemberToKick(m)}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      Espelli
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal di Conferma Espulsione */}
      {memberToKick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Espellere questo partecipante?</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Stai per revocare l'accesso al viaggio per:
              </p>
              <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div><strong>Nome:</strong> {memberToKick.name || 'Nome non specificato'}</div>
                <div><strong>Ruolo:</strong> {memberToKick.role === 'owner' ? 'Organizzatore' : 'Co-pilota'}</div>
                <div className="font-mono text-[11px] text-slate-500 truncate"><strong>UID:</strong> {memberToKick.uid}</div>
              </div>
              <p className="text-[11px] text-rose-600 font-semibold mt-2.5">
                Questa persona non potrà più visualizzare né modificare i dati privati del viaggio.
              </p>

              {kickErrorMsg && (
                <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold leading-relaxed">
                  ⚠️ {kickErrorMsg}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isKicking}
                onClick={() => {
                  setMemberToKick(null);
                  setKickErrorMsg(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isKicking}
                onClick={handleKickMember}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isKicking ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                    <span>Espulsione in corso…</span>
                  </>
                ) : (
                  'Conferma Espulsione'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
