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

// AlloggioCard
replaceInFile('src/components/cards/AlloggioCard.tsx', [
    { from: /import \{ useDeviceRole \} from '\.\.\/\.\.\/utils\/useDeviceRole';/g, to: "import { useDeviceRole } from '../../utils/useDeviceRole';\nimport { storageService } from '../../storage/storageService';\nimport UniversalAttachmentModal from '../modals/UniversalAttachmentModal';\nimport UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\nimport { Compass } from 'lucide-react';" },
    { from: /const \[showPin, setShowPin\] = useState\(false\);/g, to: "const [showPin, setShowPin] = useState(false);\n  const [showPassModal, setShowPassModal] = useState(false);\n  const [showCopilotaModal, setShowCopilotaModal] = useState(false);\n\n  const handleSaveAttachments = async (newAttachments: any[]) => {\n    const updated = { ...accommodation, attachments: newAttachments };\n    await storageService.saveAlloggio(updated);\n    if (onUpdate) onUpdate();\n  };\n\n  const handleSaveCopilota = async (notes: string) => {\n    const updated = { ...accommodation, noteCopilota: notes };\n    await storageService.saveAlloggio(updated);\n    if (onUpdate) onUpdate();\n  };" },
    { from: /<div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700\/50">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/m, 
      to: `<div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex flex-wrap sm:grid sm:grid-cols-2 gap-2 flex-1">
            <a 
              href={resolveMapUrl(accommodation.location || accommodation.address)} 
              target="_blank" 
              rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-[40%] py-2 text-xs sm:text-sm font-bold text-[#172033] bg-[#DDF4F5] hover:bg-[#cdeef0] dark:bg-[#164E63] dark:text-[#E0F2FE] dark:hover:bg-[#1f637a] rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <span className="text-sm">📍</span> Maps
            </a>
            
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPassModal(true);
              }}
              className={\`flex-1 min-w-[40%] py-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors rounded-xl \${
                accommodation.attachments?.length
                  ? 'bg-[#FF6B5F] hover:bg-[#e85c50] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }\`}
            >
              <span className="text-sm">🎫</span> 
              {accommodation.attachments?.length ? 'Pass/QR' : '+ Pass'}
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
                accommodation.noteCopilota
                  ? 'bg-[#FF6B5F] text-white hover:bg-[#e85c50] shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }\`}
            >
              <Compass className={\`w-4 h-4 \${accommodation.noteCopilota ? 'text-white' : 'text-slate-400'}\`} />
              {accommodation.noteCopilota ? 'Copilota' : '+'}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex-1 sm:flex-none py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700"
            >
              {canEdit ? '✎ Mod' : 'ℹ️ Info'}
            </button>
          </div>
        </div>
      </div>
      
      <UniversalAttachmentModal
        isOpen={showPassModal}
        onClose={() => setShowPassModal(false)}
        title={\`Prenotazione - \${accommodation.name}\`}
        attachments={accommodation.attachments || []}
        onSave={handleSaveAttachments}
        canEdit={canEdit}
      />
      
      <UniversalCopilotaModal
        isOpen={showCopilotaModal}
        onClose={() => setShowCopilotaModal(false)}
        title={accommodation.name}
        noteCopilota={accommodation.noteCopilota || ''}
        onSave={handleSaveCopilota}
        canEdit={canEdit}
      />
    </div>`
    }
]);

// RistoranteCard
replaceInFile('src/components/cards/RistoranteCard.tsx', [
    { from: /import \{ useDeviceRole \} from '\.\.\/\.\.\/utils\/useDeviceRole';/g, to: "import { useDeviceRole } from '../../utils/useDeviceRole';\nimport { storageService } from '../../storage/storageService';\nimport UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\nimport { Compass } from 'lucide-react';" },
    { from: /const \{ canEdit \} = useDeviceRole\(\);/g, to: "const { canEdit } = useDeviceRole();\n  const [showCopilotaModal, setShowCopilotaModal] = useState(false);\n\n  const handleSaveCopilota = async (notes: string) => {\n    const updated = { ...ristorante, noteCopilota: notes };\n    await storageService.saveRistorante(updated);\n    if (onUpdate) onUpdate();\n  };" },
    { from: /<div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700\/50">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/m, 
      to: `<div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex flex-wrap sm:grid sm:grid-cols-2 gap-2 flex-1">
            <a 
              href={resolveMapUrl(ristorante.indirizzo || ristorante.nome)} 
              target="_blank" 
              rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()}
              className="flex-1 py-2 text-xs sm:text-sm font-bold text-[#172033] bg-[#DDF4F5] hover:bg-[#cdeef0] dark:bg-[#164E63] dark:text-[#E0F2FE] dark:hover:bg-[#1f637a] rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <span className="text-sm">📍</span> Maps
            </a>
            
            <a 
              href={ristorante.linkPrenotazione || (ristorante.telefono ? \`tel:\${ristorante.telefono}\` : '#')} 
              target={ristorante.linkPrenotazione ? "_blank" : undefined}
              rel={ristorante.linkPrenotazione ? "noopener noreferrer" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (!ristorante.linkPrenotazione && !ristorante.telefono) e.preventDefault();
              }}
              className={\`flex-1 py-2 text-xs sm:text-sm font-bold text-white bg-[#FF6B5F] hover:bg-[#e85c50] rounded-xl flex items-center justify-center gap-1.5 transition-colors \${(!ristorante.linkPrenotazione && !ristorante.telefono) ? 'opacity-50 pointer-events-none' : ''}\`}
            >
              <span className="text-sm">{ristorante.linkPrenotazione ? '🔗' : '📞'}</span> 
              {ristorante.linkPrenotazione ? 'Sito web' : 'Chiama'}
            </a>
          </div>
          
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowCopilotaModal(true);
              }}
              className={\`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors \${
                ristorante.noteCopilota
                  ? 'bg-[#FF6B5F] text-white hover:bg-[#e85c50] shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }\`}
            >
              <Compass className={\`w-4 h-4 \${ristorante.noteCopilota ? 'text-white' : 'text-slate-400'}\`} />
              {ristorante.noteCopilota ? 'Copilota' : '+'}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex-1 sm:flex-none py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700"
            >
              {canEdit ? '✎ Mod' : 'ℹ️ Info'}
            </button>
          </div>
        </div>
      </div>
      
      <UniversalCopilotaModal
        isOpen={showCopilotaModal}
        onClose={() => setShowCopilotaModal(false)}
        title={ristorante.nome}
        noteCopilota={ristorante.noteCopilota || ''}
        onSave={handleSaveCopilota}
        canEdit={canEdit}
      />
    </div>`
    }
]);

// TappaCard (just wire the UniversalCopilotaModal)
replaceInFile('src/components/cards/TappaCard.tsx', [
    { from: /import \{ useDeviceRole \} from '\.\.\/\.\.\/utils\/useDeviceRole';/g, to: "import { useDeviceRole } from '../../utils/useDeviceRole';\nimport { storageService } from '../../storage/storageService';\nimport UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\nimport { Compass } from 'lucide-react';" },
    { from: /const \[showCopilota, setShowCopilota\] = useState\(false\);/g, to: "const [showCopilotaModal, setShowCopilotaModal] = useState(false);\n  const handleSaveCopilota = async (notes: string) => {\n    const updated = { ...tappa, noteCopilota: notes };\n    await storageService.saveTappa(updated);\n    if (onUpdate) onUpdate();\n  };" },
    { from: /onClick=\{.*?setShowCopilota\(true\).*?\}/g, to: "onClick={(e) => { e.stopPropagation(); setShowCopilotaModal(true); }}" },
    { from: /<Compass className="w-3.5 h-3.5" \/>/g, to: `<Compass className={\`w-4 h-4 \${hasNote ? 'text-white' : 'text-slate-400'}\`} />\n              {hasNote ? 'Copilota' : '+'}` },
    { from: /\{showCopilota && \([\s\S]*?<\/div>\s*<\/div>\s*\)\}/m, 
      to: `<UniversalCopilotaModal
        isOpen={showCopilotaModal}
        onClose={() => setShowCopilotaModal(false)}
        title={tappa.titolo}
        noteCopilota={tappa.noteCopilota || ''}
        onSave={handleSaveCopilota}
        canEdit={canEdit}
      />`
    }
]);
