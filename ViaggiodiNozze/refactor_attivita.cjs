const fs = require('fs');
const path = require('path');

function refactorAttivitaCard() {
    const file = path.join(__dirname, 'src/components/cards/AttivitaCard.tsx');
    let content = fs.readFileSync(file, 'utf8');

    // 1. Imports
    content = content.replace(/import AttivitaTicketsModal from '\.\.\/modals\/AttivitaTicketsModal';/, 
        "import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';\nimport UniversalCopilotaModal from '../modals/UniversalCopilotaModal';");
    content = content.replace(/import QRCodeModal from '\.\.\/modals\/QRCodeModal';/, ""); 
    content = content.replace(/import UniversalAttachmentModal[\s\S]*?import QRCodeModal/m, "import UniversalAttachmentModal from '../modals/UniversalAttachmentModal';\nimport UniversalCopilotaModal from '../modals/UniversalCopilotaModal';\nimport QRCodeModal");

    // 2. State and handlers
    content = content.replace(/const \[isTicketsOpen, setIsTicketsOpen\] = useState\(false\);/, 
        "const [showPassModal, setShowPassModal] = useState(false);");
    content = content.replace(/const \[isCopilotPopoverOpen, setIsCopilotPopoverOpen\] = useState\(false\);/, 
        "const [showCopilotaModal, setShowCopilotaModal] = useState(false);");
    
    // Remove old copilot state
    content = content.replace(/const \[editingCopilotNotes, setEditingCopilotNotes\][\s\S]*?const hasCopilotNotes = Boolean\(activity\.copilotNotes\?\.trim\(\)\);/m, 
        "const hasCopilotNotes = Boolean((activity.copilotNotes || activity.noteCopilota)?.trim());");

    // Add handlers
    content = content.replace(/const mapTarget = activity\.address \|\| activity\.location;/m, 
        `const handleSaveAttachments = async (newAttachments: any[]) => {
    const updated = { ...activity, attachments: newAttachments };
    await storageService.saveActivity(updated as any);
    if (onUpdate) onUpdate(updated);
  };

  const handleSaveCopilota = async (notes: string) => {
    const updated = { ...activity, noteCopilota: notes, copilotNotes: notes };
    await storageService.saveActivity(updated as any);
    if (onUpdate) onUpdate(updated);
  };

  const mapTarget = activity.address || activity.location;`);

    // 3. Footer actions
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
                className={\`flex-1 min-w-[40%] py-2 text-xs sm:text-sm font-bold text-[#172033] bg-[#DDF4F5] hover:bg-[#cdeef0] dark:bg-[#164E63] dark:text-[#E0F2FE] dark:hover:bg-[#1f637a] rounded-xl flex items-center justify-center gap-1.5 transition-colors \${!mapTarget ? 'opacity-50 pointer-events-none' : ''}\`}
              >
                <span className="text-sm">📍</span> Maps
              </a>
              
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasQRCode) setIsQRModalOpen(true);
                  else setShowPassModal(true);
                }}
                className={\`flex-1 min-w-[40%] py-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors rounded-xl \${
                  canHavePass
                    ? 'bg-[#FF6B5F] hover:bg-[#e85c50] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }\`}
              >
                <span className="text-sm">🎫</span>
                {canHavePass ? 'Pass / QR' : '+ Pass'}
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
                  hasCopilotNotes
                    ? 'bg-[#FF6B5F] text-white hover:bg-[#e85c50] shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }\`}
              >
                <Compass className={\`w-4 h-4 \${hasCopilotNotes ? 'text-white' : 'text-slate-400'}\`} />
                {hasCopilotNotes ? 'Copilota' : '+'}
              </button>
            </div>
          </div>
        </div>
      </div>`;
    content = content.replace(footerRegex, newFooter);

    // 4. Replace old Modals with new Modals
    const modalsRegex = /\{\/\* Modal Biglietti & File Attività \*\/\}[\s\S]*/m;
    const newModals = `{/* Modals */}
      <UniversalAttachmentModal
        isOpen={showPassModal}
        onClose={() => setShowPassModal(false)}
        title={\`Biglietti - \${activity.title}\`}
        attachments={activity.attachments || []}
        onSave={handleSaveAttachments}
        canEdit={canEdit}
      />

      <UniversalCopilotaModal
        isOpen={showCopilotaModal}
        onClose={() => setShowCopilotaModal(false)}
        title={activity.title}
        noteCopilota={activity.copilotNotes || activity.noteCopilota || ''}
        onSave={handleSaveCopilota}
        canEdit={canEdit}
      />

      {activity.qrCode && (
        <QRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          code={activity.qrCode}
          title={activity.title}
          subtitle="Pass / Biglietto Attività"
        />
      )}
    </>
  );
}`;
    content = content.replace(modalsRegex, newModals);

    fs.writeFileSync(file, content, 'utf8');
    console.log("Updated AttivitaCard.tsx");
}

refactorAttivitaCard();
