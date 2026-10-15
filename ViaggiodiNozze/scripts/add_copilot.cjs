const fs = require('fs');
let code = fs.readFileSync('src/components/common/SettingsMenu.tsx', 'utf8');

const copilotButton = `
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('open_smart_insert', { detail: { mode: 'copilot' } }));
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer border-t border-slate-100"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🤖</span>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800">Copilota AI</span>
                    <span className="block text-[10px] text-slate-400 font-normal">Chiedi al Concierge intelligente</span>
                  </div>
                </div>
                <span className="text-slate-400 text-xs">›</span>
              </button>
`;

// There are multiple `<span className="text-slate-400 text-xs">›</span>\n              </button>` in the file.
// I will find the one right after "Cerca in Gmail" block.
const gmailBlockIdx = code.indexOf('Cerca in Gmail');
if (gmailBlockIdx !== -1) {
  const buttonEndIdx = code.indexOf('</button>', gmailBlockIdx);
  if (buttonEndIdx !== -1) {
    code = code.substring(0, buttonEndIdx + 9) + copilotButton + code.substring(buttonEndIdx + 9);
    fs.writeFileSync('src/components/common/SettingsMenu.tsx', code);
    console.log('Added Copilot button');
  }
}
