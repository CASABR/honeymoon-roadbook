const fs = require('fs');

function fixCopilotNotes() {
    let oggi = fs.readFileSync('src/views/OggiView.tsx', 'utf8');
    oggi = oggi.replace(/\bcopilotNotes\b/g, 'noteCopilota');
    fs.writeFileSync('src/views/OggiView.tsx', oggi);

    let storage = fs.readFileSync('src/storage/storageService.ts', 'utf8');
    storage = storage.replace(/\bcopilotNotes\b/g, 'noteCopilota');
    fs.writeFileSync('src/storage/storageService.ts', storage);

    let attivitaForm = fs.readFileSync('src/components/forms/AttivitaForm.tsx', 'utf8');
    attivitaForm = attivitaForm.replace(/\bcopilotNotes\b/g, 'noteCopilota');
    fs.writeFileSync('src/components/forms/AttivitaForm.tsx', attivitaForm);
    console.log("Fixed copilotNotes");
}

fixCopilotNotes();
