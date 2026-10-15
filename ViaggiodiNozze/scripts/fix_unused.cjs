const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// 1. Remove duplicate export default
const parts = code.split('export default SpeseBudgetView;');
if (parts.length > 2) {
  code = parts[0] + '\nexport default SpeseBudgetView;\n';
} else if (parts.length === 2 && code.includes('export default SpeseBudgetView;')) {
  // Check if it's exported at line 113. Let's just remove the first one if it's there.
  // Wait, let's remove ALL exports and add ONE at the end.
  code = code.replace(/export default SpeseBudgetView;/g, '');
  code += '\nexport default SpeseBudgetView;\n';
} else {
  code += '\nexport default SpeseBudgetView;\n';
}

// 2. Remove unused state variables
code = code.replace(/const \[editingTransportCost, setEditingTransportCost\] = useState\(""\);\r?\n?/g, '');
code = code.replace(/const \[editingTransportAcconto, setEditingTransportAcconto\] = useState\(""\);\r?\n?/g, '');

// 3. Remove unused 'status' argument
code = code.replace(/const handleUpdateRistorante = async \(id: string, cost: string, status\?: StatoSpesa\) => {/g, 'const handleUpdateRistorante = async (id: string, cost: string) => {');
code = code.replace(/const handleUpdateShopping = async \(id: string, cost: string, status\?: StatoSpesa\) => {/g, 'const handleUpdateShopping = async (id: string, cost: string) => {');

// 4. In `renderItemRow` usage, pass only 2 arguments to updateHandler for shopping and ristorante
// Actually, they are typed as (id, cost, status) in config. I'll just change the handler signature in config!
code = code.replace(/config: \{ icon: string; bg: string; text: string; border: string; label: string; deleteHandler: \(id: string\) => void; updateHandler: \(id: string, cost: string, status: StatoSpesa\) => void \}/g, 'config: { icon: string; bg: string; text: string; border: string; label: string; deleteHandler: (id: string) => void; updateHandler: (id: string, cost: string, status: StatoSpesa) => void | Promise<void> | any }');
code = code.replace(/const handleUpdateRistorante = async \(id: string, cost: string\) => {/g, 'const handleUpdateRistorante = async (id: string, cost: string, _status?: StatoSpesa) => {');
code = code.replace(/const handleUpdateShopping = async \(id: string, cost: string\) => {/g, 'const handleUpdateShopping = async (id: string, cost: string, _status?: StatoSpesa) => {');
code = code.replace(/const handleUpdateRistorante = async \(id: string, cost: string, status\?: StatoSpesa\) => {/g, 'const handleUpdateRistorante = async (id: string, cost: string, _status?: StatoSpesa) => {');
code = code.replace(/const handleUpdateShopping = async \(id: string, cost: string, status\?: StatoSpesa\) => {/g, 'const handleUpdateShopping = async (id: string, cost: string, _status?: StatoSpesa) => {');

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
console.log('Fixed TS errors');
