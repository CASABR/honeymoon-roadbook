const fs = require('fs');
let code = fs.readFileSync('src/components/forms/TrasportoForm.tsx', 'utf8');

// replace useState
code = code.replace(/  const \[depositoCauzionale, setDepositoCauzionale\] = useState\(''\);\n/g, '');
code = code.replace(/  const \[franchigia, setFranchigia\] = useState\(''\);\n/g, '');
code = code.replace(/  const \[politicaCarburante, setPoliticaCarburante\] = useState\(''\);\n/g, '');
code = code.replace(/  const \[sistemazioneTraghetto, setSistemazioneTraghetto\] = useState\(''\);\n/g, '');
code = code.replace(/  const \[veicoloTraghetto, setVeicoloTraghetto\] = useState\(''\);\n/g, '');
code = code.replace(/  const \[notes, setNotes\] = useState\(''\);\n/g, '  const [terminalGate, setTerminalGate] = useState(\'\');\n  const [checkinCutoff, setCheckinCutoff] = useState(\'\');\n');

// replace initialData loads
code = code.replace(/      setDepositoCauzionale\(initialData\.depositoCauzionale \|\| ''\);\n/g, '');
code = code.replace(/      setFranchigia\(initialData\.franchigia \|\| ''\);\n/g, '');
code = code.replace(/      setPoliticaCarburante\(initialData\.politicaCarburante \|\| ''\);\n/g, '');
code = code.replace(/      setSistemazioneTraghetto\(initialData\.sistemazioneTraghetto \|\| ''\);\n/g, '');
code = code.replace(/      setVeicoloTraghetto\(initialData\.veicoloTraghetto \|\| ''\);\n/g, '');
code = code.replace(/      setNotes\(initialData\.notes \|\| ''\);\n/g, '      setTerminalGate(initialData.terminalGate || \'\');\n      setCheckinCutoff(initialData.checkinCutoff || \'\');\n');

// replace resets
code = code.replace(/      setDepositoCauzionale\(''\);\n/g, '');
code = code.replace(/      setFranchigia\(''\);\n/g, '');
code = code.replace(/      setPoliticaCarburante\(''\);\n/g, '');
code = code.replace(/      setSistemazioneTraghetto\(''\);\n/g, '');
code = code.replace(/      setVeicoloTraghetto\(''\);\n/g, '');
code = code.replace(/      setNotes\(''\);\n/g, '      setTerminalGate(\'\');\n      setCheckinCutoff(\'\');\n');

// replace save data mapping
code = code.replace(/      depositoCauzionale: depositoCauzionale\.trim\(\),\n/g, '');
code = code.replace(/      franchigia: franchigia\.trim\(\),\n/g, '');
code = code.replace(/      politicaCarburante: politicaCarburante\.trim\(\),\n/g, '');
code = code.replace(/      sistemazioneTraghetto: sistemazioneTraghetto\.trim\(\),\n/g, '');
code = code.replace(/      veicoloTraghetto: veicoloTraghetto\.trim\(\),\n/g, '');
code = code.replace(/      notes: notes\.trim\(\),\n/g, '      terminalGate: terminalGate.trim(),\n      checkinCutoff: checkinCutoff.trim(),\n');

// Also UI inputs need to be replaced. For now I'll just remove the inputs entirely and add terminalGate / checkinCutoff.
// We can just use a regex block replace for the sections.

fs.writeFileSync('src/components/forms/TrasportoForm.tsx', code, 'utf8');
