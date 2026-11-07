const fs = require('fs');
const path = require('path');

const navBarPath = path.resolve(__dirname, '..', 'src', 'components', 'NavBar.tsx');
let code = fs.readFileSync(navBarPath, 'utf8');

// Replace imports and add BicolorMapPinPlusIcon
const oldImport = "import { TrailItinerario, TrailCategorie, TrailMappa, TrailToolkit, TrailAi } from './icons/TrailIcons';";
const newImport = `import { TrailItinerario, TrailCategorie, TrailMappa, TrailToolkit, TrailAi } from './icons/TrailIcons';
import { MapPin, Plus } from 'lucide-react';

export { TrailCategorie };

/**
 * Icona bicolore per "Aggiungi":
 * - map-pin: segnaposto nel colore principale/inattivo o attivo
 * - plus: piccolo simbolo + rosso corallo (#FF6B5F) sovrapposto in alto a destra
 */
export function BicolorMapPinPlusIcon({ active = false, size = 20 }: { active?: boolean; size?: number }) {
  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: \`\${size}px\`, height: \`\${size}px\` }}
      aria-hidden="true"
    >
      <MapPin
        size={size}
        strokeWidth={active ? 2.3 : 1.9}
        className={active ? 'text-[#FF6B5F]' : 'text-slate-500 dark:text-slate-400'}
      />
      <span
        className={\`absolute -top-1 -right-1 flex items-center justify-center w-3 h-3 rounded-full border border-white/40 dark:border-slate-800 \${
          active ? 'bg-[#FFF0ED] dark:bg-[#221c27]' : 'bg-[#F8F7F3] dark:bg-[#172033]'
        }\`}
      >
        <Plus
          size={9}
          strokeWidth={3.5}
          className="text-[#FF6B5F]"
        />
      </span>
    </div>
  );
}`;

code = code.replace(oldImport, newImport);

// Replace tab labels and icon in tabDetails
code = code.replace(
  `    oggi: {
      label: 'Oggi',
      icon: (active: boolean) => <TrailItinerario size={20} active={active} />
    },
    categorie: {
      label: 'Itinerario',
      icon: (active: boolean) => <TrailCategorie size={20} active={active} />
    },`,
  `    oggi: {
      label: 'La giornata',
      icon: (active: boolean) => <TrailItinerario size={20} active={active} />
    },
    categorie: {
      label: 'Aggiungi',
      icon: (active: boolean) => <BicolorMapPinPlusIcon size={20} active={active} />
    },`
);

// If Windows CRLF
code = code.replace(
  `    oggi: {\r\n      label: 'Oggi',\r\n      icon: (active: boolean) => <TrailItinerario size={20} active={active} />\r\n    },\r\n    categorie: {\r\n      label: 'Itinerario',\r\n      icon: (active: boolean) => <TrailCategorie size={20} active={active} />\r\n    },`,
  `    oggi: {\r\n      label: 'La giornata',\r\n      icon: (active: boolean) => <TrailItinerario size={20} active={active} />\r\n    },\r\n    categorie: {\r\n      label: 'Aggiungi',\r\n      icon: (active: boolean) => <BicolorMapPinPlusIcon size={20} active={active} />\r\n    },`
);

fs.writeFileSync(navBarPath, code, 'utf8');
console.log('NavBar updated with BicolorMapPinPlusIcon, "Aggiungi", and "La giornata"!');

