const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// 1 & 2 are already somewhat removed but tsc still found them?
code = code.replace(/const \[savingTransportId, setSavingTransportId\] = useState<string \| null>\([\s\S]*?\);/g, '');
code = code.replace(/const saveTransportCost = async \([\s\S]*?finally \{[\s\S]*?\}\n  \};/g, '');

// 3. Fix openItemEdit call
code = code.replace(/openItemEdit\(item\.id, costNum, acconto, isPaid \? 'saldato' : 'da_saldare'\)/g, "openItemEdit(item.id, costNum, isPaid ? 'saldato' : 'da_saldare')");

// 4. Fix unused 'status' parameters
code = code.replace(/handleUpdateRistorante = async \(id: string, cost: string, status: StatoSpesa\)/g, "handleUpdateRistorante = async (id: string, cost: string, _status?: StatoSpesa)");
code = code.replace(/handleUpdateShopping = async \(id: string, cost: string, status: StatoSpesa\)/g, "handleUpdateShopping = async (id: string, cost: string, _status?: StatoSpesa)");

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
console.log('Fixed typescript errors');
