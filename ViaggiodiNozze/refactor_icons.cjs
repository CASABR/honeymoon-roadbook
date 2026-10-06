const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    const fullPath = path.join(__dirname, filePath);
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');
    
    for (const { from, to } of replacements) {
        content = content.replace(from, to);
    }
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated ${filePath}`);
}

// 1. AttivitaCard.tsx
replaceInFile('src/components/cards/AttivitaCard.tsx', [
    { from: /import \{ useState \} from 'react';/g, to: "import { useState } from 'react';\nimport { Compass, Landmark, Mountain, Zap, Ticket } from 'lucide-react';" },
    { from: /<span className="text-emerald-600 dark:text-emerald-400 shrink-0">\s*<svg[\s\S]*?<\/svg>\s*<\/span>/g, to: `{(() => {
            const cat = (activity.sottocategoria || activity.category || '').toLowerCase();
            let Icon = Compass;
            if (cat.includes('muse') || cat.includes('cultur')) Icon = Landmark;
            else if (cat.includes('trekking') || cat.includes('natur')) Icon = Mountain;
            else if (cat.includes('adrenalin') || cat.includes('sport')) Icon = Zap;
            else if (cat.includes('spettacol') || cat.includes('tour')) Icon = Ticket;
            return <Icon className="w-4 h-4 shrink-0 text-[#172033] dark:text-white" />;
          })()}` }
]);

// 2. RistoranteCard.tsx
replaceInFile('src/components/cards/RistoranteCard.tsx', [
    { from: /import \{ useState \} from 'react';/g, to: "import { useState } from 'react';\nimport { UtensilsCrossed } from 'lucide-react';" },
    { from: /<span className="text-emerald-600 dark:text-emerald-400 shrink-0">\s*<svg[\s\S]*?<\/svg>\s*<\/span>/g, to: `<UtensilsCrossed className="w-4 h-4 shrink-0 text-[#172033] dark:text-white" />` }
]);

// 3. AlloggioCard.tsx
replaceInFile('src/components/cards/AlloggioCard.tsx', [
    { from: /import \{ useState \} from 'react';/g, to: "import { useState } from 'react';\nimport { BedDouble } from 'lucide-react';" },
    { from: /<span className="text-emerald-600 dark:text-emerald-400 shrink-0">\s*<svg[\s\S]*?<\/svg>\s*<\/span>/g, to: `<BedDouble className="w-4 h-4 shrink-0 text-[#172033] dark:text-white" />` }
]);

// 4. TrasportoCard.tsx
replaceInFile('src/components/cards/TrasportoCard.tsx', [
    { from: /import \{ useState \} from 'react';/g, to: "import { useState } from 'react';\nimport { Plane, Train, Car, Ship } from 'lucide-react';" },
    { from: /<span className="text-xl sm:text-2xl mr-1">\s*\{getTransportIcon\(\)\}\s*<\/span>/g, to: `{(() => {
            let Icon = Plane;
            switch(transport.type) {
                case 'treno': Icon = Train; break;
                case 'auto':
                case 'camper':
                case 'transfer': Icon = Car; break;
                case 'traghetto': Icon = Ship; break;
            }
            return <Icon className="w-5 h-5 sm:w-6 sm:h-6 mr-1 shrink-0 text-[#172033] dark:text-white" />;
          })()}` }
]);

// 5. ShoppingCard.tsx
replaceInFile('src/components/cards/ShoppingCard.tsx', [
    { from: /import \{ useState \} from 'react';/g, to: "import { useState } from 'react';\nimport { ShoppingBag, Fuel, Pill } from 'lucide-react';" },
    { from: /<span className="text-emerald-600 dark:text-emerald-400 shrink-0">\s*<svg[\s\S]*?<\/svg>\s*<\/span>/g, to: `{(() => {
            const cat = (item.sottocategoria || item.scopo || item.nome || '').toLowerCase();
            let Icon = ShoppingBag;
            if (cat.includes('carburante') || cat.includes('benzina')) Icon = Fuel;
            else if (cat.includes('farmacia') || cat.includes('medicin')) Icon = Pill;
            return <Icon className="w-4 h-4 shrink-0 text-[#172033] dark:text-white" />;
          })()}` }
]);

// 6. TappaCard.tsx
replaceInFile('src/components/cards/TappaCard.tsx', [
    { from: /import \{ useState \} from 'react';/g, to: "import { useState } from 'react';\nimport { Camera, Mountain, MapPin } from 'lucide-react';" },
    { from: /<span className="text-sm shrink-0">\s*\{getIcon\(\)\}\s*<\/span>/g, to: `{(() => {
            const cat = (tappa.sottocategoria || '').toLowerCase();
            let Icon = MapPin;
            if (cat.includes('fotograf')) Icon = Camera;
            else if (cat.includes('panoram')) Icon = Mountain;
            return <Icon className="w-4 h-4 shrink-0 text-[#172033] dark:text-white" />;
          })()}` }
]);
