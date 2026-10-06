const fs = require('fs');
const path = require('path');

function refactorShopping() {
    const file = path.join(__dirname, 'src/components/cards/ShoppingCard.tsx');
    let content = fs.readFileSync(file, 'utf8');

    content = content.replace(/import \{ useDeviceRole \} from '\.\.\/\.\.\/utils\/useDeviceRole';/g, "import { useDeviceRole } from '../../utils/useDeviceRole';\nimport { storageService } from '../../storage/storageService';\nimport UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\nimport { Compass } from 'lucide-react';");
    content = content.replace(/const \{ canEdit \} = useDeviceRole\(\);/g, "const { canEdit } = useDeviceRole();\n  const [showCopilotaModal, setShowCopilotaModal] = useState(false);\n\n  const handleSaveCopilota = async (notes: string) => {\n    const updated = { ...shopping, noteCopilota: notes };\n    await storageService.saveShopping(updated);\n    if (onUpdate) onUpdate();\n  };");
    
    const footerRegex = /<div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700\/50">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/m;
    const newFooter = `<div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex flex-wrap sm:grid sm:grid-cols-2 gap-2 flex-1">
            <a
              href={mapTarget ? resolveMapUrl(mapTarget) : '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                if (!mapTarget) e.preventDefault();
              }}
              className={\`flex-1 py-2 text-xs sm:text-sm font-bold text-[#172033] bg-[#DDF4F5] hover:bg-[#cdeef0] dark:bg-[#164E63] dark:text-[#E0F2FE] dark:hover:bg-[#1f637a] rounded-xl flex items-center justify-center gap-1.5 transition-colors \${!mapTarget ? 'opacity-50 pointer-events-none' : ''}\`}
            >
              <span className="text-sm">📍</span>
              Maps
            </a>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex-1 py-2 text-xs sm:text-sm font-bold text-white bg-[#FF6B5F] hover:bg-[#e85c50] rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <span className="text-sm">📋</span>
              Lista
            </button>
          </div>
          
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowCopilotaModal(true);
              }}
              className={\`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors \${
                shopping.noteCopilota
                  ? 'bg-[#FF6B5F] text-white hover:bg-[#e85c50] shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }\`}
            >
              <Compass className={\`w-4 h-4 \${shopping.noteCopilota ? 'text-white' : 'text-slate-400'}\`} />
              {shopping.noteCopilota ? 'Copilota' : '+'}
            </button>
          </div>
        </div>
      </div>
      
      <UniversalCopilotaModal
        isOpen={showCopilotaModal}
        onClose={() => setShowCopilotaModal(false)}
        title={shopping.nome || 'Shopping'}
        noteCopilota={shopping.noteCopilota || ''}
        onSave={handleSaveCopilota}
        canEdit={canEdit}
      />
    </div>`;

    content = content.replace(footerRegex, newFooter);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ShoppingCard.tsx');
}

refactorShopping();
