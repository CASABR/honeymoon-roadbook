import { storageService } from '../storage/storageService';
import type { Attivita } from '../types';

export async function seedMilano29Dic() {
  try {
    const days = await storageService.getDays();
    let targetDay = days.find(d => d.date === '2026-12-29');

    if (!targetDay) {
      targetDay = {
        id: 'day_2026-12-29',
        date: '2026-12-29',
        title: 'Milano',
        location: 'Milano',
        notes: 'Giornata inserita automaticamente (Milano)',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await storageService.saveDay(targetDay);
    }

    const activities = await storageService.getActivities(targetDay.id);
    
    const hasNovecento = activities.some(a => a.title === 'Museo del Novecento');
    if (!hasNovecento) {
      const novecento: Attivita = {
        id: 'real_novecento_dic29',
        dayId: targetDay.id,
        title: 'Museo del Novecento',
        time: '17:00',
        location: 'Milano',
        category: 'cultura',
        status: 'completata',
        copilota: false,
        coordinate: { lat: 45.4637, lng: 9.1905 },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await storageService.saveActivity(novecento);
    }

    const hasStarita = activities.some(a => a.title === 'Starita Milano');
    if (!hasStarita) {
      const starita: Attivita = {
        id: 'real_starita_dic29',
        dayId: targetDay.id,
        title: 'Starita Milano',
        time: '20:00',
        location: 'Milano',
        category: 'cibo',
        status: 'completata',
        copilota: false,
        coordinate: { lat: 45.4789, lng: 9.1724 },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await storageService.saveActivity(starita);
    }
  } catch (err) {
    console.error("Errore durante l'inserimento di Milano 29 Dicembre:", err);
  }
}
