const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminInventoryTab.tsx', 'utf8');

code = code.replace(
  "import { Product, ProductSKU, StockMovementLog } from '../../types';",
  "import { Product, ProductSKU, StockMovementLog } from '../../types';\nimport { NeumorphicSelect } from '../NeumorphicSelect';"
);
fs.writeFileSync('src/components/admin/AdminInventoryTab.tsx', code);
