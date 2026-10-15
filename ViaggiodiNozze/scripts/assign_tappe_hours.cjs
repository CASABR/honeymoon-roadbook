const fs = require('fs');
const path = require('path');

const seedTappePath = path.join(__dirname, '../src/storage/seedTappe.ts');
let content = fs.readFileSync(seedTappePath, 'utf8');

// Match each tappa object in the array
const tappaRegex = /\{\s*id:\s*'(tappa_\d+)',[\s\S]*?\n\s*\}/g;

// First pass: extract all tappe grouped by date
const rawTappe = [];
let match;
while ((match = tappaRegex.exec(content)) !== null) {
  const block = match[0];
  const id = match[1];
  const dateMatch = block.match(/date:\s*`([^`]+)`/);
  const orderMatch = block.match(/order:\s*(\d+)/);
  const noteMatch = block.match(/noteCopilota:\s*`([\s\S]*?)`/);
  const titleMatch = block.match(/titolo:\s*`([\s\S]*?)`/);
  
  rawTappe.push({
    id,
    date: dateMatch ? dateMatch[1] : '',
    order: orderMatch ? parseInt(orderMatch[1], 10) : 1,
    note: noteMatch ? noteMatch[1] : '',
    title: titleMatch ? titleMatch[1] : '',
    fullMatch: block
  });
}

// Group by date
const byDate = {};
for (const t of rawTappe) {
  if (!byDate[t.date]) byDate[t.date] = [];
  byDate[t.date].push(t);
}

// Determine default schedule per date based on count and specific notes
const defaultSchedules = {
  1: ['10:00'],
  2: ['10:00', '15:00'],
  3: ['09:30', '13:30', '16:30'],
  4: ['09:00', '11:30', '14:30', '17:00'],
  5: ['08:30', '10:30', '13:00', '15:30', '17:30'],
  6: ['08:30', '10:00', '12:00', '14:00', '16:00', '18:00'],
  7: ['08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:30']
};

const assignedHours = {};

for (const [date, tappeList] of Object.entries(byDate)) {
  tappeList.sort((a, b) => a.order - b.order);
  const count = tappeList.length;
  const baseTimes = defaultSchedules[count] || ['09:00', '11:00', '13:00', '15:00', '17:00'];
  
  tappeList.forEach((t, idx) => {
    let chosenTime = baseTimes[idx] || `${String(8 + idx * 2).padStart(2, '0')}:00`;
    
    // Check specific cues in noteCopilota or title
    const note = t.note.toLowerCase();
    const title = t.title.toLowerCase();
    
    if (t.id === 'tappa_01') chosenTime = '21:30'; // Sera dopo Starita
    else if (t.id === 'tappa_02') chosenTime = '08:30'; // Malpensa 08:30
    else if (t.id === 'tappa_03') chosenTime = '05:40'; // Pechino atterraggio
    else if (t.id === 'tappa_04') chosenTime = '10:30'; // Tienanmen
    else if (t.id === 'tappa_05') chosenTime = '19:30'; // Auckland arrivo sera
    else {
      // Check for explicit time pattern in note (e.g. "ore 08:30", "entro le 09:15", "dalle 14:00")
      const timeMatch = note.match(/(?:ore|entro le|dalle|alle)\s*(\d{1,2}[:.]\d{2})/);
      if (timeMatch) {
        chosenTime = timeMatch[1].replace('.', ':').padStart(5, '0');
      } else if (note.includes('tramonto') || note.includes('sunset') || note.includes('serale') || note.includes('cena')) {
        chosenTime = '18:30';
      } else if (note.includes('mattina presto') || note.includes('alba') || note.includes('sunrise')) {
        chosenTime = '06:30';
      } else if (note.includes('pranzo') || note.includes('lunch')) {
        chosenTime = '13:00';
      }
    }
    
    assignedHours[t.id] = chosenTime;
  });
}

// Now replace in content: insert orario right after order
let updatedContent = content.replace(
  /(\s*order:\s*\d+,)(\n\s*indirizzo:)/g,
  (m, orderLine, nextLine) => {
    // Find preceding id
    return orderLine + nextLine;
  }
);

// We replace each block with the added orario field
updatedContent = content.replace(tappaRegex, (block, id) => {
  const hour = assignedHours[id] || '10:00';
  if (block.includes('orario:')) {
    return block.replace(/orario:\s*`[^`]*`/, `orario: \`${hour}\``);
  }
  return block.replace(/(order:\s*\d+,)/, `$1\n    orario: \`${hour}\`,`);
});

fs.writeFileSync(seedTappePath, updatedContent, 'utf8');
console.log(`Updated ${Object.keys(assignedHours).length} tappe with orario!`);
