const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/components/forms/**/*.tsx');

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  if (!content.includes('usePresence')) {
    // 1. Add import
    content = content.replace(/(import .*? from 'react';)/, "$1\nimport { usePresence } from '../../hooks/usePresence';");
    
    // 2. Add hook inside the component
    // We look for `export default function <Name>({ initialData, ... }: Props) {`
    // or similar
    content = content.replace(/(export default function \w+Form\([^)]+\) {)/, "$1\n  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);\n");

    // 3. Add banner inside <form>
    const banner = `
      {isLockedByOther && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
          <span className="text-base animate-pulse">⚠️</span>
          <span>Attenzione: il dispositivo "{lockedBy}" sta già modificando questo elemento in tempo reale. Le tue modifiche potrebbero sovrascriversi.</span>
        </div>
      )}
`;
    content = content.replace(/(<form[^>]*className="space-y-4"[^>]*>)/, `$1\n${banner}`);

    fs.writeFileSync(f, content);
    console.log('Injected presence into', f);
  }
});
