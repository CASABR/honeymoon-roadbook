const fs = require('fs');
const path = require('path');
const p = path.join('src', 'views', 'altro', 'SpeseBudgetView.tsx');
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/\/\/ Auto-fix per bug specifici richiesti[\s\S]*?if \(modifiedT\) tList = await storageService\.getTransports\(\);/m, 
  `// Rimosso auto-fix per evitare loop di render.`);

fs.writeFileSync(p, c, 'utf8');
console.log('Fixed SpeseBudgetView auto-fix loop.');
