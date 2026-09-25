const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminSupportChatTab.tsx', 'utf8');

const junkStart = code.indexOf('rap">Ответить</span>');
const formEnd = code.indexOf('</form>', junkStart) + 7;

if (junkStart !== -1 && formEnd !== -1) {
  code = code.substring(0, junkStart) + code.substring(formEnd);
}

fs.writeFileSync('src/components/admin/AdminSupportChatTab.tsx', code);
