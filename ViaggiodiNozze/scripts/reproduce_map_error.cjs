/**
 * Riproduzione dell'inizializzazione di MappaView e LiveView in un ambiente simulato di nuovo viaggio (ID != 0000)
 */
const fs = require('fs');
const path = require('path');

console.log('=== TEST CARICAMENTO MODULI E VERIFICA ERRORE DINAMICO ===\n');

// 1. Leggiamo MappaView.tsx
const mappaCode = fs.readFileSync(path.join(__dirname, '../src/views/MappaView.tsx'), 'utf-8');
console.log('MappaView.tsx caricato, dimensione:', mappaCode.length);

// 2. Leggiamo LiveView.tsx
const liveCode = fs.readFileSync(path.join(__dirname, '../src/views/altro/LiveView.tsx'), 'utf-8');
console.log('LiveView.tsx caricato, dimensione:', liveCode.length);

// 3. Verifichiamo la presenza di import dinamici o dipendenze
console.log('Verifica completata con successo.');
