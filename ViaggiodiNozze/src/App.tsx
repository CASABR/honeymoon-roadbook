import { useState } from 'react';
import NavBar, { type SectionTab } from './components/NavBar';
import OggiView from './views/OggiView';
import AttivitaView from './views/AttivitaView';
import AlloggiView from './views/AlloggiView';
import TrasportiView from './views/TrasportiView';
import AltroView from './views/AltroView';
import SettingsMenu from './components/common/SettingsMenu';
import UpdateToast from './components/common/UpdateToast';

export default function App() {
  const [activeTab, setActiveTab] = useState<SectionTab>('oggi');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center selection:bg-rose-500 selection:text-white font-sans antialiased">
      {/* Top Bar */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Honeymoon Roadbook
          </p>
        </div>
        <SettingsMenu />
      </header>

      {/* Container Mobile / Shell */}
      <main className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 pt-1 pb-28">
        {activeTab === 'oggi' && <OggiView onNavigateTab={setActiveTab} />}
        {activeTab === 'attivita' && <AttivitaView />}
        {activeTab === 'alloggi' && <AlloggiView />}
        {activeTab === 'trasporti' && <TrasportiView />}
        {activeTab === 'altro' && <AltroView />}
      </main>

      {/* Navigazione Inferiore */}
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* PWA Update Toast */}
      <UpdateToast />
    </div>
  );
}

