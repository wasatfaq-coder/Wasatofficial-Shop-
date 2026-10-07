#!/bin/bash
# Проверки самого ECC (scripts/ci/ в его репозитории) для установленного плагина — после обновления ECC или правки
# .claude/hooks/ecc-skill-fixes.py. Правка убирает скиллы и команды в каталог (….md.catalog), и проверки ECC на месте
# видят «Missing SKILL.md» и ссылки на «несуществующие» команды. Поэтому проверяется копия во временной папке, где файлам
# каталога возвращены прежние имена: так проверяется сам ECC с правками формы. Отдельно — что у каждой записи каталога
# (.claude/skills/finding-skills/catalog.md) есть файл, и тесты ECC (ECC_VALIDATE_TESTS=0 — без них). Зависимости
# проверок (js-yaml, ajv — версии из package.json ECC) ставятся в ту же временную папку. Код выхода 0 — всё прошло.
set -uo pipefail

ROOT="$(node -e '
  try {
    const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const entry = ((data.plugins && data.plugins["ecc@ecc"]) || []).find(e => e.installPath);
    if (entry) process.stdout.write(entry.installPath);
  } catch { /* нет файла — плагин не стоит */ }
' "$HOME/.claude/plugins/installed_plugins.json")"
[ -d "$ROOT/scripts/ci" ] || { echo "ECC не установлен — проверять нечего." >&2; exit 1; }
CATALOG="$(cd "$(dirname "$0")/.." && pwd)/.claude/skills/finding-skills/catalog.md"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$ROOT" "$TMP/ecc"
find "$TMP/ecc/skills" "$TMP/ecc/commands" -name '*.md.catalog' | while read -r f; do mv "$f" "${f%.catalog}"; done
npm install --silent --no-save --no-package-lock --prefix "$TMP/deps" js-yaml@4.3.2 ajv@8.20.0 >/dev/null 2>&1 \
  || { echo "Не поставились js-yaml и ajv (сеть?) — проверки ECC не запущены." >&2; exit 1; }

failed=0
# Манифест триггеров скиллов (manifests/context-packs/skill-triggers@1.json) хранит отпечаток всех файлов всех скиллов,
# и любая правка формы делает его «устаревшим». Сами триггеры ECC строит только из name и description скилла, а их правка
# не меняет — поэтому, если они совпадают с чистым ECC той же версии (клон маркетплейса), отпечаток пересчитывается в копии:
# это и есть перегенерация манифеста. Отличается хоть одно описание — проверка падает.
MARKET="$HOME/.claude/plugins/marketplaces/ecc"
if out="$(cd "$TMP/ecc" && NODE_PATH="$TMP/deps/node_modules" node - "$TMP/ecc" "$MARKET" 2>&1 <<'JS'
const fs = require('fs');
const path = require('path');
const [copy, market] = process.argv.slice(2);
if (!fs.existsSync(path.join(market, 'scripts/lib/context-pack-registry.js'))) throw new Error(`нет чистого ECC в ${market}`);
const load = root => require(path.join(root, 'scripts/lib/context-pack-registry')).loadContextRegistry({ repoRoot: root });
const fixed = load(copy);
const pristine = load(market);
const meta = registry => new Map(registry.entries.map(e => [e.id, JSON.stringify([e.name, e.description])]));
const a = meta(fixed);
const b = meta(pristine);
const differ = [...new Set([...a.keys(), ...b.keys()])].filter(id => a.get(id) !== b.get(id));
if (differ.length) throw new Error(`name или description отличаются от ECC: ${differ.slice(0, 5).join(', ')}`);
const file = path.join(copy, 'manifests/context-packs/skill-triggers@1.json');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (manifest.registryDigest !== pristine.registryDigest) throw new Error('манифест триггеров устарел уже в самом ECC');
manifest.registryDigest = fixed.registryDigest;
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
console.log(`name и description ${a.size} скиллов совпадают с ECC — отпечаток манифеста триггеров пересчитан`);
JS
)"; then
  echo "ок      триггеры: $out"
else
  echo "ОШИБКА  триггеры:"; echo "$out" | tail -5 | sed 's/^/        /'
  failed=1
fi

for check in "$TMP"/ecc/scripts/ci/validate-*.js "$TMP"/ecc/scripts/ci/check-*.js; do
  name="$(basename "$check" .js)"
  # CLAUDE_PLUGIN_ROOT — иначе часть проверок ищет плагин по установленному пути, где скиллы каталога переименованы.
  if out="$(cd "$TMP/ecc" && CLAUDE_PLUGIN_ROOT="$TMP/ecc" NODE_PATH="$TMP/deps/node_modules" node "$check" 2>&1)"; then
    echo "ок      $name: $(echo "$out" | tail -1 | cut -c1-100)"
  else
    echo "ОШИБКА  $name:"; echo "$out" | tail -10 | sed 's/^/        /'
    failed=1
  fi
done

# Тесты ECC (tests/run-all.js — как `npm test` в его CI) на копии с правкой и на чистом клоне той же версии. Часть
# тестов падает и на чистом ECC — от окружения (выключенный GateGuard, нет git-пользователя), поэтому ошибка — только тест,
# который падает с правкой и проходит без неё. ≈ 7 минут: копии проверяются одновременно.
fails() {  # «файл: тест» каждой упавшей проверки из журнала run-all
  awk '/^━━━ Running /{f=$3} /^  ✗ /{sub(/^  ✗ /,""); print f": "$0} /^✗ /{print $2": (файл)"}' "$1" | sort -u
}
if [ "${ECC_VALIDATE_TESTS:-1}" = 1 ]; then
  cp -R "$MARKET" "$TMP/pristine" && rm -rf "$TMP/pristine/.git"  # копия плагина тоже без .git: иначе git-тесты ECC расходятся
  for tree in ecc pristine; do
    (cd "$TMP/$tree" && env -u ECC_DISABLED_HOOKS -u ECC_SKIP_LLM_SUMMARY CLAUDE_PLUGIN_ROOT="$TMP/$tree" \
      NODE_PATH="$TMP/deps/node_modules" node tests/run-all.js >"$TMP/$tree.log" 2>&1) &
  done
  wait
  new="$(comm -23 <(fails "$TMP/ecc.log") <(fails "$TMP/pristine.log"))"
  if [ -z "$new" ]; then
    echo "ок      тесты ECC: с правкой не падает ничего сверх чистого ECC ($(fails "$TMP/pristine.log" | wc -l) падают и там — окружение)"
  else
    echo "ОШИБКА  тесты ECC падают только с правкой:"; echo "$new" | head -20 | sed 's/^/        /'
    failed=1
  fi
fi

missing=0
if [ -f "$CATALOG" ]; then
  base="$(grep -o -m1 '~/[^`]*/skills/<имя>' "$CATALOG" | sed "s|^~|$HOME|; s|/skills/<имя>||")"
  while read -r kind name; do
    case "$kind" in
      скилл) f="$base/skills/$name/SKILL.md.catalog" ;;
      *) f="$base/commands/$name.md.catalog"; [ -f "$f" ] || f="$base/commands/$name.md" ;;
    esac
    [ -f "$f" ] || { echo "НЕТ ФАЙЛА: $kind $name ($f)"; missing=1; }
  done < <(grep -o -E '^- `[^`]+` \((скилл|команда)' "$CATALOG" | sed -E 's/^- `([^`]+)` \((.+)$/\2 \1/')
  [ "$missing" = 0 ] && echo "ок      каталог: у всех $(grep -c '^- `' "$CATALOG") записей есть файл"
fi

exit $(( failed || missing ))
