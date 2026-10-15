const fs = require('fs');

const file = 'src/views/OggiView.tsx';
let content = fs.readFileSync(file, 'utf8');

// Aggiungi import di UniversalCopilotaModal se non esiste
if (!content.includes('UniversalCopilotaModal')) {
  content = content.replace(
    /import InTransitBanner from '\.\.\/components\/common\/InTransitBanner';/,
    `import InTransitBanner from '../components/common/InTransitBanner';\nimport UniversalCopilotaModal from '../components/modals/UniversalCopilotaModal';`
  );
}

// Sostituisci il popover inline
const regex = /\{\/\*\s*Popover \/ Modale Note del Co-pilota[^]*?\{\/\*\s*Modale Walkthrough/m;

const replacement = `{/* Popover / Modale Note del Co-pilota tramite componente dedicato */}
      <UniversalCopilotaModal
        isOpen={!!copilotPopoverActivity}
        onClose={() => setCopilotPopoverActivity(null)}
        title={copilotPopoverActivity?.title || 'Dettaglio'}
        noteCopilota={copilotPopoverActivity?.noteCopilota || ''}
        canEdit={canEdit}
        onSave={async (notes) => {
          if (!copilotPopoverActivity) return;
          try {
            setIsSavingCopilotNote(true);
            const updated = {
              ...copilotPopoverActivity,
              noteCopilota: notes.trim(),
              copilota: Boolean(notes.trim()) || copilotPopoverActivity.copilota,
              updatedAt: Date.now()
            };
            await storageService.saveActivity(updated as any);
            await fetchTimeline();
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
              detail: { entityType: 'activity', action: 'update', data: updated }
            }));
            // Non chiudiamo automaticamente per dare il feedback
          } catch (err) {
            console.error('Errore salvataggio nota copilota:', err);
          } finally {
            setIsSavingCopilotNote(false);
          }
        }}
      />

      {/* Modale Walkthrough`;

if (content.match(regex)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('OggiView patched');
} else {
  console.log('Regex non matchata in OggiView!');
}
