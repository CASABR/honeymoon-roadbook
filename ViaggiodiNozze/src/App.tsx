import { useState } from 'react';
import type { SectionTab, CategoriaTab } from './types';
import NavBar from './components/NavBar';
import CategorieBar from './components/CategorieBar';
import OggiView from './views/OggiView';
import AttivitaView from './views/AttivitaView';
import TappeView from './views/altro/TappeView';
import RistorantiView from './views/altro/RistorantiView';
import AlloggiView from './views/AlloggiView';
import TrasportiView from './views/TrasportiView';
import ShoppingView from './views/altro/ShoppingView';
import AltroView from './views/AltroView';
import SettingsMenu from './components/common/SettingsMenu';
import UpdateToast from './components/common/UpdateToast';

export default function App() {
  const [activeTab, setActiveTab] = useState<SectionTab>('oggi');
  const [activeCategoria, setActiveCategoria] = useState<CategoriaTab | null>(null);
  const [isCategorieOpen, setIsCategorieOpen] = useState(false);

  const handleTabChange = (tab: SectionTab, categoria?: CategoriaTab) => {
    setActiveTab(tab);
    setIsCategorieOpen(false);
    if (tab === 'oggi' || tab === 'altro') {
      setActiveCategoria(null);
    } else if (tab === 'categorie') {
      setActiveCategoria(categoria || activeCategoria || 'tappe');
    }
  };

  const handleToggleCategorie = () => {
    setIsCategorieOpen(prev => !prev);
  };

  const handleSelectCategoria = (cat: CategoriaTab) => {
    setActiveCategoria(cat);
    setActiveTab('categorie');
    setIsCategorieOpen(false);
  };

  const handleCloseCategorie = () => {
    setIsCategorieOpen(false);
  };

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
        {activeTab === 'oggi' && <OggiView onNavigateTab={handleTabChange} />}
        
        {activeTab === 'categorie' && (
          <>
            {activeCategoria === 'tappe' && <TappeView />}
            {activeCategoria === 'attivita' && <AttivitaView />}
            {activeCategoria === 'ristoranti' && <RistorantiView />}
            {activeCategoria === 'alloggi' && <AlloggiView />}
            {activeCategoria === 'trasporti' && <TrasportiView />}
            {activeCategoria === 'shopping' && <ShoppingView />}
            {!activeCategoria && <TappeView />}
          </>
        )}

        {activeTab === 'altro' && <AltroView />}
      </main>

      {/* Barra inferiore classica a 3 tab (Oggi - Categorie - Altro) sempre presente come base */}
      <NavBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenCategorie={handleToggleCategorie}
        isCategorieActive={activeTab === 'categorie' || isCategorieOpen}
      />

      {/* Dock orizzontale a capsula mostrato in overlay sovrimpresso al click su "Categorie" */}
      {isCategorieOpen && (
        <CategorieBar
          activeCategoria={activeCategoria}
          onSelectCategoria={handleSelectCategoria}
          onClose={handleCloseCategorie}
        />
      )}

      {/* PWA Update Toast */}
      <UpdateToast />
    </div>
  );
}


