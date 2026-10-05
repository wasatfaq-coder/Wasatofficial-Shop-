import { test as setup } from '@playwright/test';
import { assertEmulatorsRunning, clearEmulators, loadRules, writeDocs } from '../emulator';
import { catalogIndexDocs, storeDocs } from '../store';

setup('магазин с товарами, доставкой и оплатой', async () => {
  await assertEmulatorsRunning();
  await clearEmulators();
  await loadRules();
  await writeDocs(storeDocs());
  await writeDocs(await catalogIndexDocs());
});
