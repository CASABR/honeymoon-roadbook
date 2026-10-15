const fs = require('fs');
const path = require('path');

const formsDir = path.join('src', 'components', 'forms');

// 1. TrasportoForm
let tf = path.join(formsDir, 'TrasportoForm.tsx');
if (fs.existsSync(tf)) {
    let content = fs.readFileSync(tf, 'utf8');
    // Replace the checkbox onChange/onClick logic
    content = content.replace(/<div className="flex items-center gap-2 cursor-pointer" onClick=\{[^}]*\}\>/, 
        `<div className="flex items-center gap-2 cursor-pointer" onClick={() => {
            const newVal = !isSaldato;
            setIsSaldato(newVal);
            if (newVal && cost) {
                setDepositPaid(cost);
            } else if (!newVal) {
                setDepositPaid('0');
            }
        }}>`);
    // Replace status assignment in handleSubmit
    content = content.replace(/status:\s*initialData\?\.status\s*\|\|\s*'pianificato'\s*as\s*StatoTrasporto,/, "status: isSaldato ? 'completato' : (initialData?.status || 'prenotato') as StatoTrasporto,");
    fs.writeFileSync(tf, content, 'utf8');
}

// 2. AlloggioForm
let af = path.join(formsDir, 'AlloggioForm.tsx');
if (fs.existsSync(af)) {
    let content = fs.readFileSync(af, 'utf8');
    // We need to modify onChange of the checkbox
    content = content.replace(/onChange=\{\(e\) => setPaymentStatus\(e\.target\.checked \? 'saldato' : 'da_saldare'\)\}/, 
        `onChange={(e) => {
            const checked = e.target.checked;
            setPaymentStatus(checked ? 'saldato' : 'da_saldare');
            if (checked && cost) {
                setAcconto(cost);
            } else {
                setAcconto('0');
            }
        }}`);
    
    // In handleSubmit, inject `completed` and `status` correctly
    // Alloggio doesn't have status, or does it? `StatoAlloggio` is 'da_prenotare' | 'prenotato' | 'completato'.
    // We look for where it saves. It saves all properties.
    content = content.replace(/cost:\s*cost\.trim\(\)\s*\|\|\s*undefined,/, `cost: cost.trim() || undefined,
        completed: paymentStatus === 'saldato',
        status: (paymentStatus === 'saldato' ? 'completato' : 'prenotato') as any,`);
    fs.writeFileSync(af, content, 'utf8');
}

// 3. AttivitaForm
let atf = path.join(formsDir, 'AttivitaForm.tsx');
if (fs.existsSync(atf)) {
    let content = fs.readFileSync(atf, 'utf8');
    content = content.replace(/onChange=\{\(e\) => setPaymentStatus\(e\.target\.checked \? 'saldato' : 'da_saldare'\)\}/, 
        `onChange={(e) => {
            const checked = e.target.checked;
            setPaymentStatus(checked ? 'saldato' : 'da_saldare');
            if (checked && cost) {
                setAcconto(cost);
            } else {
                setAcconto('0');
            }
            setStatus(checked ? 'prenotato' : 'da_valutare'); // 'prenotato' in Attivita means confirmed basically. Or 'completato' if it exists.
        }}`);

    // In handleSubmit
    content = content.replace(/status,\s*attachments:/, `status: paymentStatus === 'saldato' ? 'prenotato' : status,
        attachments:`);
    fs.writeFileSync(atf, content, 'utf8');
}

console.log('Forms updated.');
