const fs = require('fs');
const path = require('path');
const f = path.join('src', 'components', 'cards', 'AlloggioCard.tsx');
let c = fs.readFileSync(f, 'utf8');
c = c.replace(/import React, \{ useState \} from 'react';\r?\nimport \{ useState \} from 'react';/, "import React, { useState } from 'react';");
fs.writeFileSync(f, c, 'utf8');
console.log('Fixed AlloggioCard imports');
