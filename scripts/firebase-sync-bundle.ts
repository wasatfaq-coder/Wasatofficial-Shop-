// Код сайта для теста правил (аудит 07.10, находка 40): тест вызывает записи `src/utils/firebaseSync.ts` (отмена, возврат
// на склад, «Я получил», чек, передача гостя, склад админки) со своей базой эмулятора (`targetDb`), а не их копии.
// Запускается перед `bun run test:rules`, пишет tests/.generated/firebase-sync.mjs — ES-модуль для `node --test`.
//
// `src/firebase.ts` в сборку не входит: он запустил бы приложение Firebase с настройками боевого проекта. Вместо него —
// заглушка без базы: вызов без `targetDb` сразу падает, а не уходит в настоящую базу магазина.
// `firebase/*` остаётся внешним: тест и сборка должны делить один экземпляр SDK, иначе база из
// @firebase/rules-unit-testing не подойдёт к `doc()` сборки.
import { mkdirSync } from 'node:fs';

const STUB = `
export const db = null;
export enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
// the site's handleFirestoreError logs and throws a new Error; the test needs the original one (its code)
export function handleFirestoreError(error: unknown): never { throw error; }
`;

// The root package has no Bun types (the site is checked with DOM types): only the part of Bun.build used here
interface BunBuild {
  build(options: {
    entrypoints: string[];
    outdir: string;
    naming: string;
    target: 'node';
    format: 'esm';
    external: string[];
    plugins: {
      name: string;
      setup(build: {
        onLoad(options: { filter: RegExp }, load: () => { contents: string; loader: 'ts' }): void;
      }): void;
    }[];
  }): Promise<{ success: boolean; logs: unknown[] }>;
}
const { Bun } = globalThis as unknown as { Bun: BunBuild };

mkdirSync('tests/.generated', { recursive: true });
const result = await Bun.build({
  entrypoints: ['src/utils/firebaseSync.ts'],
  outdir: 'tests/.generated',
  naming: 'firebase-sync.mjs',
  target: 'node',
  format: 'esm',
  external: ['firebase', 'firebase/*', '@firebase/*'],
  plugins: [
    {
      name: 'no-firebase-app',
      setup(build) {
        build.onLoad({ filter: /[\\/]src[\\/]firebase\.ts$/ }, () => ({ contents: STUB, loader: 'ts' }));
      },
    },
  ],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log('firebaseSync for the rules test: tests/.generated/firebase-sync.mjs');
