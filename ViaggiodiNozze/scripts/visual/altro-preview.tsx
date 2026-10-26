import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import AltroView from '../../src/views/AltroView';

localStorage.setItem('roadbook_trip_config', JSON.stringify({
  id: 'PREBETA_VISUAL',
  title: 'Viaggio Demo',
  startDate: '2026-11-28',
  endDate: '2027-01-10',
  ownerName: 'Demo'
}));
localStorage.setItem('houni_trip_id', 'PREBETA_VISUAL');
localStorage.setItem('houni_device_role', 'viewer');
localStorage.setItem('theme', 'light');
document.documentElement.classList.remove('dark');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <main className="min-h-screen bg-[#F8F7F3] px-4 pt-4 pb-12 text-[#172033]">
      <AltroView />
    </main>
  </React.StrictMode>
);
