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
    // Restore the messed up import
    content = content.replace(/import \{ Calendar, MapPin, Map, Check, Trash2 \} from 'lucide-react'; \/\/ added a dummy comment or just replace the whole import block\r?\n/, "import { useState } from 'react';\n");
    // Also BedDouble import was already replaced, so no need to replace it again, just restored useState.
  }

  // Specific to TrasportoCard.tsx
  if (file.endsWith('TrasportoCard.tsx')) {
    // Remove `onDelete` from Props interface and destructuring if it still exists
    content = content.replace(/^[ \t]*onDelete: \(\) => void;\r?\n/gm, '');
    content = content.replace(/^[ \t]*onDelete,\r?\n/gm, '');
  }

  fs.writeFileSync(file, content);
}
console.log('Fixed TS6133 errors');
