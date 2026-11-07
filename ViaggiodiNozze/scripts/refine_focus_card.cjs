const fs = require('fs');
const path = require('path');

const oggiPath = path.resolve(__dirname, '../src/views/OggiView.tsx');
let content = fs.readFileSync(oggiPath, 'utf8');

// Replace in visibleCards.map
const cardRegex = /<div\s+key=\{item\.id\}\s+ref=\{\(el\)\s*=>\s*\{\s*timelineItemRefs\.current\[item\.id\]\s*=\s*el;\s*\}\}\s+className="hounigo-timeline-item"/;

const newCardWrapper = `<div
                        key={item.id}
                        id={\`timeline-card-\${item.id}\`}
                        ref={(el) => { timelineItemRefs.current[item.id] = el; }}
                        className={\`hounigo-timeline-item transition-all duration-300 \${highlightedCardId === item.id ? 'hounigo-card-highlighted' : ''}\``;

content = content.replace(cardRegex, newCardWrapper);

// Replace in tonightsAccommodation
const accRegex = /\{tonightsAccommodation \?\s*\(\s*<div\s+ref=\{\(el\)\s*=>\s*\{\s*timelineItemRefs\.current\[`lodging_\$\{tonightsAccommodation\.id\}`\]\s*=\s*el;\s*\}\}\s*>/;

const newAccWrapper = `{tonightsAccommodation ? (
                  <div
                    id={\`timeline-card-lodging_\${tonightsAccommodation.id}\`}
                    ref={(el) => {
                      timelineItemRefs.current[\`lodging_\${tonightsAccommodation.id}\`] = el;
                      timelineItemRefs.current[tonightsAccommodation.id] = el;
                    }}
                    className={\`transition-all duration-300 \${(highlightedCardId === tonightsAccommodation.id || highlightedCardId === \`lodging_\${tonightsAccommodation.id}\`) ? 'hounigo-card-highlighted' : ''}\`}
                  >`;

content = content.replace(accRegex, newAccWrapper);

fs.writeFileSync(oggiPath, content, 'utf8');
console.log('Cards wrappers updated successfully!');
