const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// 1. AlloggioCard.tsx
let alloggioPath = path.join(root, 'src', 'components', 'cards', 'AlloggioCard.tsx');
let alloggio = fs.readFileSync(alloggioPath, 'utf8');
if (!alloggio.includes('GoogleMapsIcon')) {
  alloggio = alloggio.replace(
    "import { resolveMapUrl } from '../../utils/mapsHelper';",
    "import { resolveMapUrl } from '../../utils/mapsHelper';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
}
alloggio = alloggio.replace(
  '<span aria-hidden="true">🗺️</span>',
  '<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />'
);
fs.writeFileSync(alloggioPath, alloggio, 'utf8');

// 2. AttivitaCard.tsx
let attivitaPath = path.join(root, 'src', 'components', 'cards', 'AttivitaCard.tsx');
let attivita = fs.readFileSync(attivitaPath, 'utf8');
if (!attivita.includes('GoogleMapsIcon')) {
  attivita = attivita.replace(
    "import { resolveMapUrl, hasReliableGeoDestination, getMapsActionLabel } from '../../utils/mapsHelper';",
    "import { resolveMapUrl, hasReliableGeoDestination, getMapsActionLabel } from '../../utils/mapsHelper';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
}
attivita = attivita.replace(
  '<span aria-hidden="true">🗺️</span>',
  '<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />'
);
fs.writeFileSync(attivitaPath, attivita, 'utf8');

// 3. TappaCard.tsx
let tappaPath = path.join(root, 'src', 'components', 'cards', 'TappaCard.tsx');
let tappa = fs.readFileSync(tappaPath, 'utf8');
if (!tappa.includes('GoogleMapsIcon')) {
  tappa = tappa.replace(
    "import { resolveMapUrl, hasReliableGeoDestination, getMapsActionLabel } from '../../utils/mapsHelper';",
    "import { resolveMapUrl, hasReliableGeoDestination, getMapsActionLabel } from '../../utils/mapsHelper';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
}
tappa = tappa.replace(
  '<span aria-hidden="true">🗺️</span>',
  '<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />'
);
fs.writeFileSync(tappaPath, tappa, 'utf8');

// 4. TrasportoCard.tsx
let trasportoPath = path.join(root, 'src', 'components', 'cards', 'TrasportoCard.tsx');
let trasporto = fs.readFileSync(trasportoPath, 'utf8');
if (!trasporto.includes('GoogleMapsIcon')) {
  trasporto = trasporto.replace(
    "import { resolveMapUrl, getTransportMapTargets } from '../../utils/mapsHelper';",
    "import { resolveMapUrl, getTransportMapTargets } from '../../utils/mapsHelper';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
}
trasporto = trasporto.replace(
  '<span aria-hidden="true">🗺️</span>',
  '<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />'
);
fs.writeFileSync(trasportoPath, trasporto, 'utf8');

// 5. RistoranteCard.tsx
let ristorantePath = path.join(root, 'src', 'components', 'cards', 'RistoranteCard.tsx');
let ristorante = fs.readFileSync(ristorantePath, 'utf8');
if (!ristorante.includes('GoogleMapsIcon')) {
  ristorante = ristorante.replace(
    "import { formatCurrency } from '../../utils/currencyHelper';",
    "import { formatCurrency } from '../../utils/currencyHelper';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
}
ristorante = ristorante.replace(
  '<span aria-hidden="true">🗺️</span>',
  '<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />'
);
fs.writeFileSync(ristorantePath, ristorante, 'utf8');

// 6. ShoppingCard.tsx
let shoppingPath = path.join(root, 'src', 'components', 'cards', 'ShoppingCard.tsx');
let shopping = fs.readFileSync(shoppingPath, 'utf8');
if (!shopping.includes('GoogleMapsIcon')) {
  shopping = shopping.replace(
    "import { formatCurrency } from '../../utils/currencyHelper';",
    "import { formatCurrency } from '../../utils/currencyHelper';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
}
shopping = shopping.replace(
  '<span aria-hidden="true">🗺️</span>',
  '<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />'
);
fs.writeFileSync(shoppingPath, shopping, 'utf8');

// 7. DayMapsCard.tsx
let daymapsPath = path.join(root, 'src', 'components', 'cards', 'DayMapsCard.tsx');
let daymaps = fs.readFileSync(daymapsPath, 'utf8');
if (!daymaps.includes('GoogleMapsIcon')) {
  daymaps = daymaps.replace(
    "import { ExternalLink, Navigation } from 'lucide-react';",
    "import { ExternalLink, Navigation } from 'lucide-react';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
}
daymaps = daymaps.replace(
  /<svg[\s\S]*?aria-label="Google Maps"[\s\S]*?<\/svg>/,
  '<GoogleMapsIcon className="w-4 h-4 shrink-0" />'
);
fs.writeFileSync(daymapsPath, daymaps, 'utf8');

// 8. TimelineItemDetailModal.tsx
let modalPath = path.join(root, 'src', 'components', 'modals', 'TimelineItemDetailModal.tsx');
let modal = fs.readFileSync(modalPath, 'utf8');
if (!modal.includes('GoogleMapsIcon')) {
  modal = modal.replace(
    "import { resolveMapUrl, openMapLink, hasReliableGeoDestination, getMapsActionLabel } from '../../utils/mapsHelper';",
    "import { resolveMapUrl, openMapLink, hasReliableGeoDestination, getMapsActionLabel } from '../../utils/mapsHelper';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
  modal = modal.replace(
    />\s*Apri Maps ↗/g,
    '><GoogleMapsIcon className="w-3.5 h-3.5 inline mr-1 shrink-0" />Apri Maps ↗'
  );
  fs.writeFileSync(modalPath, modal, 'utf8');
}

// 9. RouteBadge.tsx
let routeBadgePath = path.join(root, 'src', 'components', 'common', 'RouteBadge.tsx');
let routeBadge = fs.readFileSync(routeBadgePath, 'utf8');
if (!routeBadge.includes('GoogleMapsIcon')) {
  routeBadge = routeBadge.replace(
    "import { Navigation, ExternalLink, HelpCircle } from 'lucide-react';",
    "import { Navigation, ExternalLink, HelpCircle } from 'lucide-react';\nimport GoogleMapsIcon from '../icons/GoogleMapsIcon';"
  );
  routeBadge = routeBadge.replace(
    /<span>Verifica Maps ↗<\/span>/g,
    '<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" /><span>Verifica Maps ↗</span>'
  );
  routeBadge = routeBadge.replace(
    /<span>Apri Maps ↗<\/span>/g,
    '<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" /><span>Apri Maps ↗</span>'
  );
  fs.writeFileSync(routeBadgePath, routeBadge, 'utf8');
}

console.log('Cards and Modals updated with GoogleMapsIcon!');

function addImport(filePath, importLine) {
  let code = fs.readFileSync(filePath, 'utf8');
  if (!code.includes(importLine)) {
    code = importLine + '\n' + code;
    fs.writeFileSync(filePath, code, 'utf8');
  }
}

addImport(path.join(root, 'src', 'components', 'cards', 'DayMapsCard.tsx'), "import GoogleMapsIcon from '../icons/GoogleMapsIcon';");
addImport(path.join(root, 'src', 'components', 'cards', 'RistoranteCard.tsx'), "import GoogleMapsIcon from '../icons/GoogleMapsIcon';");
addImport(path.join(root, 'src', 'components', 'cards', 'ShoppingCard.tsx'), "import GoogleMapsIcon from '../icons/GoogleMapsIcon';");
addImport(path.join(root, 'src', 'components', 'cards', 'TrasportoCard.tsx'), "import GoogleMapsIcon from '../icons/GoogleMapsIcon';");
addImport(path.join(root, 'src', 'components', 'common', 'RouteBadge.tsx'), "import GoogleMapsIcon from '../icons/GoogleMapsIcon';");

console.log('All remaining imports fixed!');
