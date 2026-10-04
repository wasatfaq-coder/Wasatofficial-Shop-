// Fills the emulator with the 300-product shop (catalog300.ts). Emulator only: emulator.ts talks to 127.0.0.1
import { assertEmulatorsRunning, clearEmulators, writeDocs } from '../e2e/emulator';
import { catalogBatches } from './catalog300';

await assertEmulatorsRunning();
await clearEmulators();
let n = 0;
for (const batch of catalogBatches()) {
  await writeDocs(batch);
  n += Object.keys(batch).length;
}
console.log(`В эмуляторе ${n} документов`);
