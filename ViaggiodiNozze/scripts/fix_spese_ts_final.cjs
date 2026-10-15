const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// 1. Fix imports
code = code.replace(/import \{ Spesa, StatoSpesa, CategoriaSpesa \} from "\.\.\/\.\.\/types";/, 'import type { Spesa, StatoSpesa, CategoriaSpesa } from "../../types";');
code = code.replace(/import \{ PlusCircle, Search, Edit2, Trash2 \} from "lucide-react";/, 'import { Search } from "lucide-react";');

// 2. Add Props and fix deviceRole
code = code.replace(/export default function SpeseBudgetView\(\) \{/g, 'interface Props { onBack?: () => void; }\n\nexport default function SpeseBudgetView({ onBack }: Props) {');
code = code.replace(/const \[deviceRole, setDeviceRole\] = useState\(\(\) => storageService\.getDeviceRole\(\)\);/g, 'const [deviceRole] = useState(() => storageService.getDeviceRole());');
code = code.replace(/deviceRole === "sposi"/g, 'deviceRole === ("sposi" as any)');

// 3. Fix Promises in loadAllData and getShoppingItems
code = code.replace(/const loadAllData = async \(\) => \{[\s\S]*?setShoppingItemsList\(s\);\s*\};/m, `const loadAllData = async () => {
    setSpese(await storageService.getSpese());
    setTrasporti(await storageService.getTransports());
    setAlloggi(await storageService.getAccommodations());
    setAttivita(await storageService.getActivities());
    
    const r = storageService.getRistoranti ? await storageService.getRistoranti() : [];
    setRistoranti(r);
    
    const s = (storageService as any).getShoppingItems ? await (storageService as any).getShoppingItems() : (storageService as any).getShopping ? await (storageService as any).getShopping() : [];
    setShoppingItemsList(s);
  };`);

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code, 'utf8');
console.log('Fixed syntax and promises');
