const fs = require('fs');
const path = require('path');

const filesToFix = [
  'AlloggioCard.tsx',
  'RistoranteCard.tsx',
  'ShoppingCard.tsx',
  'TappaCard.tsx',
  'TrasportoCard.tsx',
].map(f => path.join(__dirname, '..', '..', '..', 'ViaggiodiNozze', 'src', 'components', 'cards', f));

for (const file of filesToFix) {
  let content = fs.readFileSync(file, 'utf8');

  // Remove `useDeviceRole` import
  content = content.replace(/import \{ useDeviceRole \} from '\.\.\/\.\.\/utils\/useDeviceRole';\r?\n/g, '');

  // Remove `const { canEdit } = useDeviceRole();`
  content = content.replace(/^[ \t]*const \{ canEdit \} = useDeviceRole\(\);\r?\n/gm, '');

  // Specific to AlloggioCard.tsx
  if (file.endsWith('AlloggioCard.tsx')) {
    // We already accidentally replaced `useState` earlier and `BedDouble` is gone but let's make sure it's valid:
    // If it's missing useState, we should ensure it's there.
    if (!content.includes("import { useState }")) {
       content = "import { useState } from 'react';\n" + content;
    }
    // Also remove the bad import we added if it exists
    content = content.replace(/import \{ Calendar, MapPin, Map, Check, Trash2 \} from 'lucide-react'; \/\/ added a dummy comment or just replace the whole import block\r?\n/g, '');
  }

  // Specific to TrasportoCard.tsx
  if (file.endsWith('TrasportoCard.tsx')) {
    // Remove `onDelete` from Props interface and destructuring
    content = content.replace(/^[ \t]*onDelete: \(\) => void;\r?\n/gm, '');
    content = content.replace(/^[ \t]*onDelete,\r?\n/gm, '');
  }

  fs.writeFileSync(file, content);
}
console.log('Fixed TS6133 errors');
