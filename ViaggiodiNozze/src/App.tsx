import { useState } from 'react';
import NavBar, { type SectionTab } from './components/NavBar';
import AttivitaView from './views/AttivitaView';
import AlloggiView from './views/AlloggiView';
import TrasportiView from './views/TrasportiView';

export default function App() {
  const [activeTab, setActiveTab] = useState<SectionTab>('attivita');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center selection:bg-blue-500 selection:text-white font-sans antialiased">
      {/* Container Mobile / Shell */}
      <main className="w-full max-w-md min-h-screen flex flex-col px-5 pt-8 pb-28">
        {activeTab === 'attivita' && <AttivitaView />}
        {activeTab === 'alloggi' && <AlloggiView />}
        {activeTab === 'trasporti' && <TrasportiView />}
      </main>

      {/* Navigazione Inferiore */}
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
