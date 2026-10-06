const fs = require('fs');

function fix() {
  // 1. TrasportoCard
  let content = fs.readFileSync('src/components/cards/TrasportoCard.tsx', 'utf8');
  content = content.replace(/export default function TrasportoCard\(\{ transport, onEdit \}/, "export default function TrasportoCard({ transport, onEdit, onUpdate }");
  content = content.replace(/const \[copied, setCopied\] = useState\(false\);/, "");
  content = content.replace(/import \{ Compass, Plus \} from 'lucide-react';/, "import { Compass } from 'lucide-react';");
  fs.writeFileSync('src/components/cards/TrasportoCard.tsx', content);

  // 2. RistoranteCard
  content = fs.readFileSync('src/components/cards/RistoranteCard.tsx', 'utf8');
  content = content.replace(/export default function RistoranteCard\(\{ ristorante, onEdit, onDelete \}/, "export default function RistoranteCard({ ristorante, onEdit, onDelete, onUpdate }");
  if (!content.includes('import { useState')) {
     content = content.replace(/import React from 'react';/, "import React, { useState } from 'react';");
  }
  fs.writeFileSync('src/components/cards/RistoranteCard.tsx', content);

  // 3. ShoppingCard
  content = fs.readFileSync('src/components/cards/ShoppingCard.tsx', 'utf8');
  content = content.replace(/export default function ShoppingCard\(\{ shopping, onEdit, onDelete \}/, "export default function ShoppingCard({ shopping, onEdit, onDelete, onUpdate }");
  if (!content.includes('import { useState')) {
     content = content.replace(/import React from 'react';/, "import React, { useState } from 'react';");
  }
  // fix duplicate storageService
  const parts = content.split("import { storageService } from '../../storage/storageService';");
  if (parts.length > 2) {
      content = parts[0] + "import { storageService } from '../../storage/storageService';" + parts.slice(1).join("");
  }
  fs.writeFileSync('src/components/cards/ShoppingCard.tsx', content);

  // 4. AlloggioCard
  content = fs.readFileSync('src/components/cards/AlloggioCard.tsx', 'utf8');
  content = content.replace(/export default function AlloggioCard\(\{ accommodation, onEdit, onDelete \}/, "export default function AlloggioCard({ accommodation, onEdit, onDelete, onUpdate }");
  if (!content.includes('import UniversalCopilotaModal')) {
      content = content.replace(/import UniversalAttachmentModal from '\.\.\/modals\/UniversalAttachmentModal';/, "import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';\nimport UniversalCopilotaModal from '../modals/UniversalCopilotaModal';");
  }
  fs.writeFileSync('src/components/cards/AlloggioCard.tsx', content);

  // 5. TappaCard
  content = fs.readFileSync('src/components/cards/TappaCard.tsx', 'utf8');
  // fix duplicate imports
  const tparts = content.split("import { Camera, Mountain, MapPin } from 'lucide-react';");
  if (tparts.length > 2) {
      content = tparts[0] + "import { Camera, Mountain, MapPin } from 'lucide-react';" + tparts.slice(1).join("");
  }
  content = content.replace(/export default function TappaCard\(\{ tappa, onEdit, onDelete \}/, "export default function TappaCard({ tappa, onEdit, onDelete, onUpdate }");
  fs.writeFileSync('src/components/cards/TappaCard.tsx', content);

  // 6. UniversalAttachmentModal
  content = fs.readFileSync('src/components/modals/UniversalAttachmentModal.tsx', 'utf8');
  content = content.replace(/images=\{imageAttachments\.map\(img => img\.dataUrl\)\}/, "isOpen={true} items={imageAttachments}");
  content = content.replace(/import \{ Trash2, Plus, Download, FileText, Image as ImageIcon \} from 'lucide-react';/, "import { Trash2, Plus, Download, FileText } from 'lucide-react';");
  fs.writeFileSync('src/components/modals/UniversalAttachmentModal.tsx', content);
}
fix();
