// Fills the emulator with the 300-product shop (catalog300.ts), and with `VISIT_ORDERS=1` half a year of orders and
// customers (orders1800.ts, `bun run measure:admin`). Emulator only: emulator.ts talks to 127.0.0.1
import { assertEmulatorsRunning, clearEmulators, writeDocs } from '../e2e/emulator';
import { catalogBatches, drawPreviews } from './catalog300';
import { orders, profiles } from './orders1800';

await assertEmulatorsRunning();
await clearEmulators();
let n = 0;
const previews = await drawPreviews();
const banners = await drawPreviews(3, 1000, 500);
// full photos as processImageFiles keeps them: 1 000 px long side, JPEG 0.8, ≈ 260 000 characters
const photos = await drawPreviews(4, 750, 1000, 0.8);
for (const batch of catalogBatches(previews, banners, photos)) {
  await writeDocs(batch);
  n += Object.keys(batch).length;
}
if (process.env.VISIT_ORDERS) {
  const list = orders();
  for (let i = 0; i < list.length; i += 100) {
    // JSON drops undefined fields, as sanitizeForFirestore does before the write
    const batch = Object.fromEntries(list.slice(i, i + 100).map((o) => [`orders/${o.id}`, JSON.parse(JSON.stringify(o))]));
    await writeDocs(batch);
    n += Object.keys(batch).length;
  }
  const people = profiles();
  await writeDocs(people);
  n += Object.keys(people).length;
}
console.log(`В эмуляторе ${n} документов`);
