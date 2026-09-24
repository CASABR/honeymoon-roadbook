import { useState } from 'react';

type SubTab = 'tutti' | 'assicurazione' | 'emergenze' | 'documenti';

export default function AltroView() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('tutti');

  return (
    <div className="space-y-4 pt-1 animate-fade-in">
      {/* Header Sezione */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Info & Documenti
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Assicurazione, numeri utili e visti di viaggio
          </p>
        </div>
      </div>

      {/* Segmented Control / Filtro Sotto-sezioni */}
      <div className="flex gap-1.5 p-1 bg-slate-200/60 rounded-2xl">
        {[
          { id: 'tutti', label: 'Tutti' },
          { id: 'assicurazione', label: 'Polizza' },
          { id: 'emergenze', label: 'Emergenze' },
          { id: 'documenti', label: 'Documenti' }
        ].map((tab) => {
          const isSelected = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as SubTab)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SOTTO-SCHEDA 1: ASSICURAZIONE DI VIAGGIO */}
      {(activeSubTab === 'tutti' || activeSubTab === 'assicurazione') && (
        <section className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold">
                🛡️
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Assicurazione di Viaggio
                </h2>
                <p className="text-[11px] text-slate-500">
                  Polizza Sanitaria H24 & Assistenza Nozze
                </p>
              </div>
            </div>
            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              ✓ Attiva
            </span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Compagnia:</span>
              <span className="font-bold text-slate-800">Europ Assistance / Allianz Global</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Polizza N°:</span>
              <span className="font-mono font-bold text-slate-900">EA-2026-NZAU-88391</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Massimale Spese Mediche:</span>
              <span className="font-bold text-emerald-700">Illimitato (NZ & AU)</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Validità:</span>
              <span className="text-slate-700 font-medium">28 Nov 2026 – 12 Gen 2027</span>
            </div>
          </div>

          {/* Azione di chiamata rapida H24 */}
          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Centrale Operativa H24 all'Estero
              </div>
              <div className="text-xs font-semibold text-slate-700 mt-0.5">
                +39 02 5824 5555
              </div>
            </div>
            <a
              href="tel:+390258245555"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all active:scale-95 shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>Chiama H24</span>
            </a>
          </div>

          <div className="text-[11px] text-slate-500 leading-relaxed space-y-1">
            <p className="font-semibold text-slate-700">Coperture principali incluse:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Rimpatrio sanitario e trasporto medico protetto</li>
              <li>Smarrimento, furto o danneggiamento bagagli</li>
              <li>Responsabilità civile verso terzi</li>
              <li>Prolungamento forzato o interruzione viaggio</li>
            </ul>
          </div>
        </section>
      )}

      {/* SOTTO-SCHEDA 2: NUMERI DI EMERGENZA RAPIDA */}
      {(activeSubTab === 'tutti' || activeSubTab === 'emergenze') && (
        <section className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm font-bold">
              🚨
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Numeri di Emergenza Rapida
              </h2>
              <p className="text-[11px] text-slate-500">
                Tasti diretti per chiamate di pronto soccorso e ambasciate
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {/* Nuova Zelanda */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-xl">🇳🇿</span>
                <div>
                  <div className="text-xs font-bold text-slate-900">Nuova Zelanda</div>
                  <div className="text-[11px] text-slate-500">Polizia, Ambulanza, Pompieri</div>
                </div>
              </div>
              <a
                href="tel:111"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
              >
                <span>📞 111</span>
              </a>
            </div>

            {/* Australia */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-xl">🇦🇺</span>
                <div>
                  <div className="text-xs font-bold text-slate-900">Australia</div>
                  <div className="text-[11px] text-slate-500">Triple Zero (Emergenza Nazionale)</div>
                </div>
              </div>
              <a
                href="tel:000"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
              >
                <span>📞 000</span>
              </a>
            </div>

            {/* Filippine */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-xl">🇵🇭</span>
                <div>
                  <div className="text-xs font-bold text-slate-900">Filippine</div>
                  <div className="text-[11px] text-slate-500">Pronto Intervento & Polizia</div>
                </div>
              </div>
              <a
                href="tel:911"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
              >
                <span>📞 911</span>
              </a>
            </div>
          </div>

          {/* Rappresentanze Diplomatiche Italiane */}
          <div className="pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Ambasciate e Consolati Italiani
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Wellington (NZ):</span>
                  <p className="text-[11px] text-slate-500">+64 4 473 5339</p>
                </div>
                <a
                  href="tel:+6444735339"
                  className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-colors"
                >
                  Chiama
                </a>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Sydney (AU):</span>
                  <p className="text-[11px] text-slate-500">+61 2 9262 3222</p>
                </div>
                <a
                  href="tel:+61292623222"
                  className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-colors"
                >
                  Chiama
                </a>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Manila (PH):</span>
                  <p className="text-[11px] text-slate-500">+63 2 8892 4531</p>
                </div>
                <a
                  href="tel:+63288924531"
                  className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-colors"
                >
                  Chiama
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SOTTO-SCHEDA 3: DOCUMENTI DI VIAGGIO */}
      {(activeSubTab === 'tutti' || activeSubTab === 'documenti') && (
        <section className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
              🛂
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Documenti & Visti d'Ingresso
              </h2>
              <p className="text-[11px] text-slate-500">
                Passaporti e autorizzazioni per Nuova Zelanda, Australia e Filippine
              </p>
            </div>
          </div>

          {/* Passaporti */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Passaporti Elettronici
            </h3>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 text-xs">Sposo & Sposa</span>
                  <p className="text-[11px] text-slate-500">Passaporti biometrici validi</p>
                </div>
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ✓ Validi (&gt; 6 mesi)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Scadenza oltre la data richiesta per il rientro in Italia (Gennaio 2027).
              </p>
            </div>
          </div>

          {/* Visti e Autorizzazioni */}
          <div className="space-y-2 pt-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Visti e Permessi di Soggiorno
            </h3>

            {/* NZeTA */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">🇳🇿 NZeTA + Tassa IVL</span>
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Richiesto / Valido
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Autorizzazione elettronica per Nuova Zelanda collegata digitalmente al passaporto.
              </p>
            </div>

            {/* eVisitor Australia */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">🇦🇺 eVisitor (Subclass 651)</span>
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Richiesto / Valido
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Visto turistico australiano gratuito per cittadini UE, valido 12 mesi per soggiorni fino a 3 mesi.
              </p>
            </div>

            {/* eTravel Filippine */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">🇵🇭 eTravel Philippines</span>
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Richiesto / Valido
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Registrazione digitale di arrivo da completare online nelle 72 ore precedenti l'imbarco.
              </p>
            </div>

            {/* Patente Internazionale */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">🪪 Patente Internazionale (IDP)</span>
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Richiesta / Valida
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Modello Ginevra 1949 / Vienna 1968, indispensabile per il ritiro del campervan e dell'auto.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
