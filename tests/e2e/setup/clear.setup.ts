import { test as setup } from '@playwright/test';
import { clearEmulators } from '../emulator';

setup('пустая база', async () => {
  await clearEmulators();
});
