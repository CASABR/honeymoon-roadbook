const fs = require('fs');

let attivita = fs.readFileSync('src/components/cards/AttivitaCard.tsx', 'utf8');
attivita = attivita.replace(/copilotNotes/g, 'noteCopilota');
fs.writeFileSync('src/components/cards/AttivitaCard.tsx', attivita);

let ristorante = fs.readFileSync('src/components/cards/RistoranteCard.tsx', 'utf8');
ristorante = ristorante.replace(/const time = ristorante\.orario \|\| ristorante\.time;/g, 'const time = ristorante.orario || (ristorante as any).time;');
fs.writeFileSync('src/components/cards/RistoranteCard.tsx', ristorante);

console.log("Fixed TS Errors");
