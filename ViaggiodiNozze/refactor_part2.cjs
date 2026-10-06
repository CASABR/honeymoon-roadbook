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

const colorMap = [
    // Background Gradients
    { from: /bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950/g, to: 'bg-slate-900' },
    { from: /bg-gradient-to-r from-rose-500 via-violet-500 to-indigo-500/g, to: 'bg-slate-200 dark:bg-slate-700' },
    { from: /bg-gradient-to-tr from-rose-500\/15 to-violet-500\/15/g, to: 'bg-transparent' },
    { from: /bg-gradient-to-r from-emerald-500\/10 via-teal-500\/5 to-white/g, to: 'bg-white' },
    { from: /bg-gradient-to-r from-indigo-50\/70 via-white to-sky-50\/60/g, to: 'bg-white' },
    { from: /bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900/g, to: 'bg-slate-900' },
    { from: /bg-gradient-to-r from-slate-900 to-indigo-950/g, to: 'bg-slate-900' },
    { from: /bg-gradient-to-r from-sky-50\/60 to-indigo-50\/60/g, to: 'bg-[#F0FAF9]' },
    { from: /bg-gradient-to-br from-slate-50 via-sky-50\/40 to-indigo-50\/50/g, to: 'bg-slate-50' },
    { from: /bg-gradient-to-t from-slate-900\/15 via-transparent to-slate-900\/10/g, to: 'bg-transparent' },
    { from: /bg-gradient-to-t from-black\/75 via-black\/35 to-transparent/g, to: 'bg-black/60' },

    // Core Emerald replacement to Coral / Sky
    { from: /emerald-500\/10/g, to: '[#FF6B5F]/10' },
    { from: /emerald-500\/15/g, to: '[#FF6B5F]/15' },
    { from: /emerald-500\/20/g, to: '[#FF6B5F]/20' },
    { from: /emerald-500\/30/g, to: '[#FF6B5F]/30' },
    
    // Testi
    { from: /text-emerald-700/g, to: 'text-[#172033]' },
    { from: /text-emerald-800/g, to: 'text-[#172033]' },
    { from: /text-emerald-900/g, to: 'text-[#172033]' },
    { from: /text-emerald-600\/70/g, to: 'text-[#64748B]' },
    { from: /text-emerald-600/g, to: 'text-[#FF6B5F]' },
    { from: /text-emerald-500/g, to: 'text-[#FF6B5F]' },
    { from: /text-emerald-400/g, to: 'text-[#FF9A76]' },
    { from: /text-emerald-300/g, to: 'text-slate-400' },
    
    // Backgrounds & Borders
    { from: /bg-emerald-50/g, to: 'bg-[#FFF0ED]' }, // Coral tint
    { from: /bg-emerald-100/g, to: 'bg-[#FFF0ED]' },
    { from: /bg-emerald-200/g, to: 'bg-[#FFF0ED]' },
    { from: /bg-emerald-400/g, to: 'bg-[#FF9A76]' },
    { from: /bg-emerald-500/g, to: 'bg-[#FF6B5F]' },
    { from: /bg-emerald-600/g, to: 'bg-[#FF6B5F]' },
    { from: /bg-emerald-700/g, to: 'bg-[#e85c50]' },
    
    { from: /border-emerald-100/g, to: 'border-[#FFF0ED]' },
    { from: /border-emerald-200/g, to: 'border-slate-200' },
    { from: /border-emerald-300/g, to: 'border-slate-300' },
    { from: /border-emerald-400/g, to: 'border-slate-300' },
    { from: /border-emerald-500/g, to: 'border-[#FF6B5F]' },
    
    // Hover, focus, ring
    { from: /hover:bg-emerald-50/g, to: 'hover:bg-slate-50' },
    { from: /hover:bg-emerald-100/g, to: 'hover:bg-slate-100' },
    { from: /hover:bg-emerald-200/g, to: 'hover:bg-slate-200' },
    { from: /hover:bg-emerald-500/g, to: 'hover:bg-[#e85c50]' },
    { from: /hover:bg-emerald-600/g, to: 'hover:bg-[#e85c50]' },
    { from: /hover:bg-emerald-700/g, to: 'hover:bg-[#e85c50]' },
    
    { from: /focus:border-emerald-400/g, to: 'focus:border-[#FF6B5F]' },
    { from: /focus:border-emerald-500/g, to: 'focus:border-[#FF6B5F]' },
    { from: /focus:ring-emerald-200/g, to: 'focus:ring-[#FF6B5F]/20' },
    { from: /focus:ring-emerald-500\/30/g, to: 'focus:ring-[#FF6B5F]/30' },
    { from: /focus:ring-emerald-500/g, to: 'focus:ring-[#FF6B5F]' },
    
    { from: /hover:border-emerald-300/g, to: 'hover:border-slate-300' },
    
    { from: /shadow-emerald-500\/20/g, to: 'shadow-rose-500/20' },
    { from: /shadow-emerald-600\/20/g, to: 'shadow-rose-500/20' }
];

const filesToProcess = [
    'src/views/OggiView.tsx',
    'src/views/AltroView.tsx',
    'src/views/MappaView.tsx',
    'src/views/altro/SpeseBudgetView.tsx',
    'src/views/altro/LiveView.tsx',
    'src/views/altro/BagagliView.tsx',
    'src/views/altro/RistorantiView.tsx',
    'src/views/altro/NoteViaggioView.tsx',
    'src/views/OnboardingView.tsx'
];

filesToProcess.forEach(f => replaceInFile(f, colorMap));
