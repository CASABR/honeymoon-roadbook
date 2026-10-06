const fs = require('fs');
const glob = require('glob');

function refactorCardClicks() {
    const files = glob.sync('src/components/cards/*Card.tsx');

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf8');

        // 1. Rimuovere il blocco "Modifica / Elimina"
        // I bottoni modifica e elimina sono di solito contenuti in un div con "flex items-center gap-0.5" o simile
        // Cerchiamo di matchare in modo sicuro
        const editDeleteBlockRegex = /\{canEdit && \(\s*<div className="flex items-center gap-[^>]*>[\s\S]*?✏️ Modifica[\s\S]*?<\/div>\s*\)\}/g;
        content = content.replace(editDeleteBlockRegex, '');

        // Match alternative without canEdit wrapper
        const editDeleteBlockRegex2 = /<div className="flex items-center gap-[^>]*>[\s\S]*?✏️ Modifica[\s\S]*?<\/div>/g;
        if (content.match(editDeleteBlockRegex2)) {
             // Let's be careful not to delete something else. We check if it has "Modifica" and "Elimina"
             if (content.includes('✏️ Modifica') && content.includes('onDelete')) {
                // Not ideal, let's just use manual string replacements for the known structures
             }
        }
        
        // Manual cleanup just to be safe
        content = content.replace(/\{canEdit && \(\s*<div className="flex items-center[^>]*>[\s\S]*?onEdit[\s\S]*?onDelete[\s\S]*?<\/div>\s*\)\}/, '');
        content = content.replace(/\{canEdit && \(\s*<div className="flex gap-2">[\s\S]*?onEdit[\s\S]*?onDelete[\s\S]*?<\/div>\s*\)\}/, '');
        content = content.replace(/<div className="flex items-center gap-2 mt-4 pt-4 border-t[^>]*>[\s\S]*?onEdit[\s\S]*?onDelete[\s\S]*?<\/div>/, '');

        // 2. Aggiungere onClick={onEdit} e cursor-pointer al div principale
        // Cerchiamo il tag di apertura del contenitore principale (quello restituito dal return)
        // Solitamente è un div con className="... bg-white border ..." 
        if (content.includes('return (') && content.includes('<div className={`rounded')) {
            content = content.replace(/<div className={`rounded-([a-z0-9]+) /g, '<div onClick={onEdit} className={`cursor-pointer rounded-$1 ');
        } else if (content.includes('<div className="rounded-')) {
            content = content.replace(/<div className="rounded-([a-z0-9]+) /g, '<div onClick={onEdit} className="cursor-pointer rounded-$1 ');
        } else if (content.includes('return (\n    <div className=')) {
            content = content.replace(/return \(\n    <div className="/, 'return (\n    <div onClick={onEdit} className="cursor-pointer ');
            content = content.replace(/return \(\n    <div className={`/, 'return (\n    <div onClick={onEdit} className={`cursor-pointer ');
        } else if (content.includes('return (\n      <div className=')) {
            content = content.replace(/return \(\n      <div className="/, 'return (\n      <div onClick={onEdit} className="cursor-pointer ');
            content = content.replace(/return \(\n      <div className={`/, 'return (\n      <div onClick={onEdit} className={`cursor-pointer ');
        }
        
        if (file.includes('TrasportoCard')) {
            content = content.replace(/<div className={`w-full overflow-hidden/, '<div onClick={onEdit} className={`cursor-pointer w-full overflow-hidden');
            content = content.replace(/\{canEdit && \(\s*<div className="bg-slate-50 dark:bg-slate-800\/50 px-4 py-2\.5 border-t[^>]*>[\s\S]*?onEdit[\s\S]*?onDelete[\s\S]*?<\/div>\s*\)\}/, '');
        }

        // 3. Aggiungere e.stopPropagation() a tutti i onClick interni che non lo hanno
        // Trova tutti gli onClick={(e) => { ... }} o onClick={() => ...} e aggiunge e.stopPropagation();
        // E' meglio aggiungere e.stopPropagation(); all'inizio della callback
        content = content.replace(/onClick=\{\(e\) => {/g, 'onClick={(e) => { e.stopPropagation();');
        content = content.replace(/onClick=\{\(\) => {/g, 'onClick={(e) => { e.stopPropagation();');
        // Quelli scritti come onClick={() => setAlgo(...)}
        content = content.replace(/onClick=\{\(\) => ([^}]+)\}/g, 'onClick={(e) => { e.stopPropagation(); $1; }}');
        
        // Quelli con un nome di funzione (es. onClick={handleSave}) non possono essere sostituiti facilmente,
        // ma di solito nei card ci sono chiamate dirette o handleShareLive.
        if (content.includes('const handleToggleComplete = async (e: React.MouseEvent) => {') && !content.includes('e.stopPropagation();', content.indexOf('handleToggleComplete'))) {
             content = content.replace(/const handleToggleComplete = async \(e: React.MouseEvent\) => {/, 'const handleToggleComplete = async (e: React.MouseEvent) => {\n    e.stopPropagation();');
        }

        // Clean double e.stopPropagation()
        content = content.replace(/e\.stopPropagation\(\);\s*e\.stopPropagation\(\);/g, 'e.stopPropagation();');

        // TrasportoCard ha `onClick={() => setIsTicketsOpen(true)}` che diventerà `onClick={(e) => { e.stopPropagation(); setIsTicketsOpen(true); }}` che è corretto!

        // Remove unused onEdit, onDelete imports or variables if TS complains later
        // Actually, we need onEdit for the main div. We can remove onDelete prop from the cards if it's unused.
        // Wait, onDelete is unused now! So let's delete it from props.
        content = content.replace(/onDelete: \(\) => void;\n/g, '');
        content = content.replace(/, onDelete\b/g, '');

        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    }
}

refactorCardClicks();
