const fs = require('fs');
let code = fs.readFileSync('src/components/forms/TrasportoForm.tsx', 'utf8');

code = code.replace(/  const \[checkinCutoff, setCheckinCutoff\] = useState\(''\);\n/g, '  const [checkinCutoff, setCheckinCutoff] = useState(\'\');\n  const [noteCopilota, setNoteCopilota] = useState(\'\');\n');

code = code.replace(/      setCheckinCutoff\(initialData\.checkinCutoff \|\| ''\);\n/g, '      setCheckinCutoff(initialData.checkinCutoff || \'\');\n      setNoteCopilota(initialData.noteCopilota || initialData.notes || \'\');\n');

code = code.replace(/      setCheckinCutoff\(''\);\n/g, '      setCheckinCutoff(\'\');\n      setNoteCopilota(\'\');\n');

code = code.replace(/      notes: notes\.trim\(\) \|\| undefined,\n/g, '      noteCopilota: noteCopilota.trim() || undefined,\n      terminalGate: terminalGate.trim() || undefined,\n      checkinCutoff: checkinCutoff.trim() || undefined,\n');

code = code.replace(/value=\{notes\}/g, 'value={noteCopilota}');
code = code.replace(/onChange=\{\(e\) => setNotes\(e\.target\.value\)\}/g, 'onChange={(e) => setNoteCopilota(e.target.value)}');
code = code.replace(/Note \/ Promemoria/g, 'Note Copilota (Istruzioni Operative)');

fs.writeFileSync('src/components/forms/TrasportoForm.tsx', code, 'utf8');
