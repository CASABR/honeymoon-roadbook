const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// 1. Update NavBar.tsx: label 'Viaggio' and fixed GPU stabilization
const navBarPath = path.join(root, 'src', 'components', 'NavBar.tsx');
let navBarCode = fs.readFileSync(navBarPath, 'utf8');

navBarCode = navBarCode.replace(
  "label: 'La giornata',",
  "label: 'Viaggio',"
);

navBarCode = navBarCode.replace(
  '<nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center bg-[#F8F7F3]/95 dark:bg-[#172033]/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800 px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(23,32,51,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]">',
  '<nav style={{ WebkitTransform: "translate3d(0,0,0)", transform: "translate3d(0,0,0)", WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" }} className="fixed bottom-0 left-0 right-0 z-40 flex justify-center bg-[#F8F7F3]/95 dark:bg-[#172033]/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800 px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(23,32,51,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]">'
);

fs.writeFileSync(navBarPath, navBarCode, 'utf8');
console.log('NavBar updated to "Viaggio" and stabilized nav style.');

// 2. Update App.tsx: mainScrollContainerRef, scroll reset on tab change, fixed bottom wrapper
const appPath = path.join(root, 'src', 'App.tsx');
let appCode = fs.readFileSync(appPath, 'utf8');

// Add mainScrollContainerRef
if (!appCode.includes('mainScrollContainerRef')) {
  appCode = appCode.replace(
    'const mainSwipeStartRef = useRef<{ x: number; y: number } | null>(null);',
    'const mainScrollContainerRef = useRef<HTMLDivElement>(null);\n  const mainSwipeStartRef = useRef<{ x: number; y: number } | null>(null);'
  );
}

// Reset scroll in handleTabChange
appCode = appCode.replace(
  `  const handleTabChange = (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => {
    setActiveTab(tab);
    setIsCategorieOpen(false);`,
  `  const handleTabChange = (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => {
    setActiveTab(tab);
    setIsCategorieOpen(false);
    if (mainScrollContainerRef.current) {
      mainScrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    window.scrollTo({ top: 0, behavior: 'instant' });`
);

// Also for CRLF
appCode = appCode.replace(
  `  const handleTabChange = (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => {\r\n    setActiveTab(tab);\r\n    setIsCategorieOpen(false);`,
  `  const handleTabChange = (tab: SectionTab, categoria?: CategoriaTab, subView?: any) => {\r\n    setActiveTab(tab);\r\n    setIsCategorieOpen(false);\r\n    if (mainScrollContainerRef.current) {\r\n      mainScrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });\r\n    }\r\n    window.scrollTo({ top: 0, behavior: 'instant' });`
);

// Reset scroll in handleSelectCategoria
appCode = appCode.replace(
  `  const handleSelectCategoria = (cat: CategoriaTab) => {
    setActiveCategoria(cat);
    setActiveTab('categorie');
    setIsCategorieOpen(false);`,
  `  const handleSelectCategoria = (cat: CategoriaTab) => {
    setActiveCategoria(cat);
    setActiveTab('categorie');
    setIsCategorieOpen(false);
    if (mainScrollContainerRef.current) {
      mainScrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    window.scrollTo({ top: 0, behavior: 'instant' });`
);

appCode = appCode.replace(
  `  const handleSelectCategoria = (cat: CategoriaTab) => {\r\n    setActiveCategoria(cat);\r\n    setActiveTab('categorie');\r\n    setIsCategorieOpen(false);`,
  `  const handleSelectCategoria = (cat: CategoriaTab) => {\r\n    setActiveCategoria(cat);\r\n    setActiveTab('categorie');\r\n    setIsCategorieOpen(false);\r\n    if (mainScrollContainerRef.current) {\r\n      mainScrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });\r\n    }\r\n    window.scrollTo({ top: 0, behavior: 'instant' });`
);

// Attach ref and 100dvh on main content container
appCode = appCode.replace(
  `<div className={\`flex-1 flex flex-col min-w-0 \${isForcedMobileView ? 'w-full max-w-md min-h-screen shadow-2xl border-x border-slate-200/80 dark:border-slate-800 bg-[#F8F7F3] dark:bg-[#172033] relative pb-20' : 'h-screen overflow-y-auto bg-[#F8F7F3] dark:bg-[#172033]'}\`}>`,
  `<div ref={mainScrollContainerRef} className={\`flex-1 flex flex-col min-w-0 \${isForcedMobileView ? 'w-full max-w-md min-h-screen shadow-2xl border-x border-slate-200/80 dark:border-slate-800 bg-[#F8F7F3] dark:bg-[#172033] relative pb-20' : 'h-[100vh] h-[100dvh] overflow-y-auto bg-[#F8F7F3] dark:bg-[#172033]'}\`}>`
);

// Stabilize mobile bottom bar wrapper to be permanently fixed at viewport bottom
appCode = appCode.replace(
  `<div className={\`block \${isForcedMobileView ? 'fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40' : 'md:hidden'}\`}>`,
  `<div className={\`block fixed bottom-0 left-0 right-0 z-40 pointer-events-none \${isForcedMobileView ? 'left-1/2 -translate-x-1/2 max-w-md w-full' : 'md:hidden'}\`} style={{ WebkitTransform: 'translate3d(0,0,0)', transform: 'translate3d(0,0,0)' }}>\n        <div className="pointer-events-auto w-full">`
);

appCode = appCode.replace(
  `        {/* Dock orizzontale Categorie su Mobile */}
        {isCategorieOpen && (
          <CategorieBar
            activeCategoria={activeCategoria}
            onSelectCategoria={handleSelectCategoria}
            onClose={handleCloseCategorie}
          />
        )}
      </div>`,
  `        </div>\n        {/* Dock orizzontale Categorie su Mobile */}\n        {isCategorieOpen && (\n          <div className="pointer-events-auto w-full">\n            <CategorieBar\n              activeCategoria={activeCategoria}\n              onSelectCategoria={handleSelectCategoria}\n              onClose={handleCloseCategorie}\n            />\n          </div>\n        )}\n      </div>`
);

// CRLF variant
appCode = appCode.replace(
  `        {/* Dock orizzontale Categorie su Mobile */}\r\n        {isCategorieOpen && (\r\n          <CategorieBar\r\n            activeCategoria={activeCategoria}\r\n            onSelectCategoria={handleSelectCategoria}\r\n            onClose={handleCloseCategorie}\r\n          />\r\n        )}\r\n      </div>`,
  `        </div>\r\n        {/* Dock orizzontale Categorie su Mobile */}\r\n        {isCategorieOpen && (\r\n          <div className="pointer-events-auto w-full">\r\n            <CategorieBar\r\n              activeCategoria={activeCategoria}\r\n              onSelectCategoria={handleSelectCategoria}\r\n              onClose={handleCloseCategorie}\r\n            />\r\n          </div>\r\n        )}\r\n      </div>`
);

fs.writeFileSync(appPath, appCode, 'utf8');
console.log('App.tsx updated with scroll reset and fixed bottom bar stabilization!');

