import { useState } from 'react';
import NavBar, { type SectionTab } from './components/NavBar';
import AttivitaView from './views/AttivitaView';
import AlloggiView from './views/AlloggiView';
import TrasportiView from './views/TrasportiView';
import SettingsMenu from './components/common/SettingsMenu';
import UpdateToast from './components/common/UpdateToast';

export default function App() {
  const [activeTab, setActiveTab] = useState<SectionTab>('attivita');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center selection:bg-blue-500 selection:text-white font-sans antialiased">
      {/* Top Bar */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
          Honeymoon Roadbook
        </p>
        <SettingsMenu />
      </header>

      {/* Container Mobile / Shell */}
      <main className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 pt-1 pb-28">
        {activeTab === 'attivita' && <AttivitaView />}
        {activeTab === 'alloggi' && <AlloggiView />}
        {activeTab === 'trasporti' && <TrasportiView />}
      </main>

      {/* Navigazione Inferiore */}
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* PWA Update Toast */}
      <UpdateToast />
    </div>
  );
}
