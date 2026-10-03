/**
 * Заглушка пакета `re2js` (аудит 02.10, находка 36). Firestore тянет его ради выражений pipelines (`like`,
 * `regex_contains`, `regex_match`) — магазин ими не пользуется, а пакет занимал ≈ 43 КБ gzip главного чанка. Firestore
 * вызывает RE2JS только внутри try/catch этих выражений: ошибка здесь вернула бы ошибку выражения, а не сломала сайт.
 * Подключается в vite.config.ts (`resolve.alias`).
 */
export class RE2JS {
  static compile(): never {
    throw new Error('re2js is not bundled: Firestore pipelines with regular expressions are not used by this site');
  }
}

export default RE2JS;
