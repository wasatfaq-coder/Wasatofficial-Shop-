const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminProductsTab.tsx', 'utf8');
code = code.replace(
  "import { AdminBulkOperationsModal } from './AdminBulkOperationsModal';",
  "import { AdminBulkOperationsModal } from './AdminBulkOperationsModal';\nimport { NeumorphicSelect } from '../NeumorphicSelect';"
);
fs.writeFileSync('src/components/admin/AdminProductsTab.tsx', code);
