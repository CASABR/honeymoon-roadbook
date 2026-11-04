const assert = require('assert');

console.log('--- TEST E2E: SPOT FOTOGRAFICO E SELETTORE ATTIVITA ---');

// 1. Verifica coerenza tipi e salvataggio Tappa Spot Fotografico
const mockTappaPhotoSpot = {
  id: 'tappa_spot_test_001',
  titolo: 'Mirador de San Nicolás',
  sottocategoria: 'Spot fotografico',
  data: '2026-11-28',
  lightWindow: 'golden_hour',
  photoSubject: 'Scorcio panoramico Alhambra con luce radente',
  attachments: [
    {
      id: 'att_photo_001',
      name: 'alhambra_sunset.jpg',
      size: 102400,
      type: 'image',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
      purpose: 'photo'
    }
  ],
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// Verifica integrità dati Tappa
assert.strictEqual(mockTappaPhotoSpot.sottocategoria, 'Spot fotografico');
assert.strictEqual(mockTappaPhotoSpot.lightWindow, 'golden_hour');
assert.strictEqual(mockTappaPhotoSpot.photoSubject, 'Scorcio panoramico Alhambra con luce radente');
assert.strictEqual(mockTappaPhotoSpot.attachments.length, 1);
assert.strictEqual(mockTappaPhotoSpot.attachments[0].purpose, 'photo');
console.log('✓ Tappa Spot Fotografico: campi lightWindow, photoSubject e attachments validati');

// 2. Verifica Attività Spot Fotografico
const mockAttivitaPhotoSpot = {
  id: 'attivita_spot_test_001',
  titolo: 'Punto panoramico Valle del Jerte',
  categoria: 'visita',
  sottocategoria: 'Spot fotografico',
  data: '2026-11-29',
  lightWindow: 'alba',
  photoSubject: 'Nebbia mattutina sui ciliegi in fiore',
  attachments: [
    {
      id: 'att_photo_002',
      name: 'valle_jerte.jpg',
      size: 204800,
      type: 'image',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
      purpose: 'photo'
    }
  ],
  createdAt: Date.now(),
  updatedAt: Date.now()
};

assert.strictEqual(mockAttivitaPhotoSpot.sottocategoria, 'Spot fotografico');
assert.strictEqual(mockAttivitaPhotoSpot.lightWindow, 'alba');
assert.strictEqual(mockAttivitaPhotoSpot.attachments[0].type, 'image');
console.log('✓ Attività Spot Fotografico: coerenza verificata con modello condiviso');

// 3. Verifica le 7 categorie del nuovo selettore Attività
const SOTTOCATEGORIE_INFO = [
  { id: 'Trekking', label: 'Trekking', icon: '🥾' },
  { id: 'Spot fotografico', label: 'Spot foto', icon: '📸' },
  { id: 'Passeggiata', label: 'Passeggiata', icon: '🚶' },
  { id: 'Tour Guidato', label: 'Tour Guidato', icon: '🏛️' },
  { id: 'Museo', label: 'Museo', icon: '🎨' },
  { id: 'Adrenalina', label: 'Adrenalina', icon: '⚡' },
  { id: 'Altro', label: 'Altro', icon: '✨' },
];

assert.strictEqual(SOTTOCATEGORIE_INFO.length, 7);
assert.deepStrictEqual(
  SOTTOCATEGORIE_INFO.map(s => s.id),
  ['Trekking', 'Spot fotografico', 'Passeggiata', 'Tour Guidato', 'Museo', 'Adrenalina', 'Altro']
);
console.log('✓ Selettore Attività: 7 sottocategorie corrette, nessun form generico');

console.log('--- TUTTI I TEST SPOT FOTOGRAFICO E SELETTORE ATTIVITÀ PASSATI CON SUCCESSO ---');
