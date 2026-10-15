const fs = require('fs');
const path = require('path');

const file = path.join('src', 'views', 'OggiView.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add UniversalCopilotaModal import
if (!content.includes('UniversalCopilotaModal')) {
  content = content.replace(
    /import InTransitBanner from '\.\.\/components\/common\/InTransitBanner';/,
    "import InTransitBanner from '../components/common/InTransitBanner';\nimport UniversalCopilotaModal from '../components/modals/UniversalCopilotaModal';"
  );
}

// 2. Add state for global copilot
if (!content.includes('isGlobalCopilotOpen')) {
  content = content.replace(
    /const \[isSavingCopilotNote, setIsSavingCopilotNote\] = useState\(false\);/,
    "const [isSavingCopilotNote, setIsSavingCopilotNote] = useState(false);\n  const [isGlobalCopilotOpen, setIsGlobalCopilotOpen] = useState(false);\n  const [globalCopilotNoteStr, setGlobalCopilotNoteStr] = useState('');\n  const [globalCopilotNoteId, setGlobalCopilotNoteId] = useState<string | null>(null);"
  );
}

// 3. Add effect to load the global copilot note for the selected date
if (!content.includes('fetchGlobalCopilotNote')) {
  content = content.replace(
    /const loadData = useCallback\(async \(\) => \{/,
    `const fetchGlobalCopilotNote = useCallback(async () => {
    try {
      const allNotes = await storageService.getNote();
      const dailyNote = allNotes.find(n => n.date === selectedDate && n.title === 'Note Copilota di Giornata');
      if (dailyNote) {
        setGlobalCopilotNoteId(dailyNote.id);
        setGlobalCopilotNoteStr(dailyNote.notes || '');
      } else {
        setGlobalCopilotNoteId(null);
        setGlobalCopilotNoteStr('');
      }
    } catch (err) {}
  }, [selectedDate]);

  const loadData = useCallback(async () => {
    fetchGlobalCopilotNote();`
  );
}

// 4. Add the FAB and Modal near the end
const replaceTarget = /\{\/\*\s*Modal Inserimento Link Maps Giornata\s*\*\/\}/;
if (content.match(replaceTarget)) {
  const replacement = `{/* Pulsante Floating Copilota (Global Day Note) */}
      <button
        type="button"
        onClick={() => setIsGlobalCopilotOpen(true)}
        className="fixed bottom-[90px] right-4 z-40 bg-[#FF6B5F] text-white p-3.5 rounded-full shadow-2xl flex items-center justify-center cursor-pointer hover:bg-[#e85c50] active:scale-95 transition-all border-2 border-white"
        title="Note Copilota"
      >
        <span className="text-xl leading-none">🧭</span>
      </button>

      {/* Modal Copilota Globale della giornata */}
      <UniversalCopilotaModal
        isOpen={isGlobalCopilotOpen}
        onClose={() => setIsGlobalCopilotOpen(false)}
        title={\`Giornata del \${selectedDate}\`}
        noteCopilota={globalCopilotNoteStr}
        canEdit={canEdit}
        onSave={async (notes) => {
          try {
            if (globalCopilotNoteId) {
              const allNotes = await storageService.getNote();
              const existing = allNotes.find(n => n.id === globalCopilotNoteId);
              if (existing) {
                await storageService.saveNote({ ...existing, notes: notes.trim(), updatedAt: Date.now() });
              }
            } else {
              await storageService.saveNote({
                id: 'note_' + Date.now(),
                title: 'Note Copilota di Giornata',
                notes: notes.trim(),
                date: selectedDate,
                type: 'info',
                createdAt: Date.now(),
                updatedAt: Date.now()
              } as any);
            }
            await fetchGlobalCopilotNote();
            setIsGlobalCopilotOpen(false);
          } catch (err) {
            console.error('Errore salvataggio nota copilota globale', err);
          }
        }}
      />

      {/* Modal Inserimento Link Maps Giornata */}`;
  
  content = content.replace(replaceTarget, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('OggiView successfully patched with FAB and Modal!');
} else {
  console.log('Target not found in OggiView!');
}
