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

// 1. index.html
replaceInFile('index.html', [
    { from: /content="#10b981"/g, to: 'content="#FF6B5F"' }
]);

// 2. index.css
replaceInFile('src/index.css', [
    { from: /#10b981/g, to: '#FF6B5F' }, // emerald-500 to Coral
    { from: /#059669/g, to: '#e85c50' }, // emerald-600 to Coral hover
    { from: /#047857/g, to: '#172033' }, // emerald-700 to Navy
    // Convert dark mode variables
    { from: /#064e3b/g, to: '#1E293B' }
]);

// 3. AddMenu.tsx
replaceInFile('src/components/common/AddMenu.tsx', [
    { from: /bg-gradient-to-r from-violet-600 to-indigo-600/g, to: 'bg-[#FF6B5F]' },
    { from: /shadow-violet-500\/20/g, to: 'shadow-rose-500/20' }
]);

// 4. NavBar.tsx
replaceInFile('src/components/NavBar.tsx', [
    { from: /bg-gradient-to-r from-violet-600 to-indigo-600/g, to: 'bg-[#FF6B5F]' },
    { from: /shadow-violet-500\/30/g, to: 'shadow-rose-500/30' },
    { from: /bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600/g, to: 'text-white' }, // Text inside coral bg should be white
    { from: /text-emerald-600/g, to: 'text-[#FF6B5F]' },
    { from: /text-emerald-500/g, to: 'text-[#FF6B5F]' }
]);

// 5. SmartInsertModal.tsx
replaceInFile('src/components/modals/SmartInsertModal.tsx', [
    { from: /bg-gradient-to-r from-violet-600 to-indigo-600/g, to: 'bg-[#FF6B5F]' },
    { from: /shadow-violet-500\/20/g, to: 'shadow-rose-500/20' },
    { from: /hover:from-violet-500 hover:to-indigo-500/g, to: 'hover:bg-[#e85c50]' },
    
    { from: /bg-gradient-to-r from-emerald-500 to-teal-600/g, to: 'bg-[#FF6B5F]' },
    { from: /shadow-emerald-500\/20/g, to: 'shadow-rose-500/20' },
    
    { from: /bg-violet-50 border-violet-100/g, to: 'bg-[#F0FAF9] border-[#DDF4F5]' },
    { from: /text-violet-700/g, to: 'text-[#172033]' },
    { from: /text-violet-600/g, to: 'text-[#172033]' },
    
    { from: /bg-violet-100/g, to: 'bg-[#DDF4F5]' },
    { from: /text-violet-800/g, to: 'text-[#172033]' },
    
    { from: /bg-violet-600/g, to: 'bg-[#FF6B5F]' },
    { from: /bg-violet-500/g, to: 'bg-[#FF6B5F]' },
    { from: /ring-violet-500\/20/g, to: 'ring-[#FF6B5F]/20' }
]);

// 6. TrasportoCard.tsx
replaceInFile('src/components/cards/TrasportoCard.tsx', [
    { from: /bg-\[#F0F7FF\]/g, to: 'bg-[#F0FAF9]' }, // Azure to Sky Tint
    { from: /border-\[#D8E8FC\]/g, to: 'border-[#DDF4F5]' },
    { from: /dark:bg-\[#182638\]/g, to: 'dark:bg-slate-800/40' }
]);

// 7. ShoppingForm.tsx
replaceInFile('src/components/forms/ShoppingForm.tsx', [
    { from: /bg-gradient-to-r from-pink-50 to-orange-50/g, to: 'bg-[#F0FAF9]' },
    { from: /border-pink-100/g, to: 'border-[#DDF4F5]' },
    { from: /text-pink-600/g, to: 'text-[#172033]' },
    { from: /text-orange-500/g, to: 'text-[#172033]' }
]);
