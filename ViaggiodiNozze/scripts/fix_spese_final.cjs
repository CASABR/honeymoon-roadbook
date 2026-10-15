const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// Fix the unclosed <>
code = code.replace(
  '            );\r\n          })\r\n        )}',
  '            );\r\n          })}\r\n          </>\r\n        )}'
);
code = code.replace(
  '            );\n          })\n        )}',
  '            );\n          })}\n          </>\n        )}'
);
// In case the map closure was already fixed but </> was missing:
code = code.replace(
  '            );\r\n          })}\r\n        )}',
  '            );\r\n          })}\r\n          </>\r\n        )}'
);
code = code.replace(
  '            );\n          })}\n        )}',
  '            );\n          })}\n          </>\n        )}'
);

const startAlloggiStr = '{/* Voci da Alloggi (se categoria alloggi) */}';
const alloggiIdx = code.indexOf(startAlloggiStr);
const modalFooterIdx = code.indexOf('{/* Azioni del modale */}');

if (alloggiIdx !== -1 && modalFooterIdx !== -1) {
  // Find the exact closing div before Azioni del modale that closes the scrolling container
  const endDivIdx = code.lastIndexOf('</div>', modalFooterIdx);
  
  const drillDownUIRenderers = `
                  {/* Voci da Attivita */}
                  {attivitaItems.map((att: any) => renderItemRow(att, 'attivita', {icon: '🎟️', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Attività', deleteHandler: handleDeleteAttivita, updateHandler: handleUpdateAttivita}))}
                  {/* Voci da Ristoranti */}
                  {ristorantiItems.map((rist: any) => renderItemRow(rist, 'ristorante', {icon: '🍽️', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', label: 'Ristorante', deleteHandler: handleDeleteRistorante, updateHandler: handleUpdateRistorante}))}
                  {/* Voci da Shopping */}
                  {shoppingItems.map((sh: any) => renderItemRow(sh, 'shopping', {icon: '🛍️', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', label: 'Shopping', deleteHandler: handleDeleteShopping, updateHandler: handleUpdateShopping}))}
                  {/* Voci da Alloggi */}
                  {alloggiItems.map((acc: any) => renderItemRow(acc, 'alloggio', {icon: '🏨', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Alloggio', deleteHandler: handleDeleteAlloggio, updateHandler: handleUpdateAlloggio}))}
                  {/* Voci da Trasporti */}
                  {trasportiItems.map((tr: any) => renderItemRow(tr, 'trasporto', {icon: '✈️', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', label: 'Trasporto', deleteHandler: handleDeleteTransport, updateHandler: () => {} }))}
                </div>`;
                
  code = code.substring(0, alloggiIdx) + drillDownUIRenderers.trim() + '\n                ' + code.substring(endDivIdx + 6);
  fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
  console.log('Fixed drillDown and closure');
} else {
  console.log('Could not find alloggi or modal footer');
}
