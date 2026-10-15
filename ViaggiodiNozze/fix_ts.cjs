const fs = require('fs');
const path = require('path');

const file = path.join('src', 'views', 'OggiView.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/storageService\.getNote\(\)/g, "storageService.getNote()");
content = content.replace(/dailyNote\.notes \|\| ''/g, "dailyNote.content || ''");
content = content.replace(/n\.date === selectedDate/g, "n.id === 'copilota_' + selectedDate");
content = content.replace(/n => n\.id === globalCopilotNoteId/g, "n => n.id === globalCopilotNoteId");
content = content.replace(/storageService\.saveNote/g, "storageService.saveNota");
content = content.replace(/notes: notes\.trim\(\)/g, "content: notes.trim()");
content = content.replace(
/id: 'note_' \+ Date\.now\(\),\s*title: 'Note Copilota di Giornata',\s*notes: notes\.trim\(\),\s*date: selectedDate,\s*type: 'info',/g,
"id: 'copilota_' + selectedDate,\n                title: 'Note Copilota di Giornata',\n                content: notes.trim(),\n                color: 'blue',"
);


fs.writeFileSync(file, content, 'utf8');
console.log('OggiView fixed');
