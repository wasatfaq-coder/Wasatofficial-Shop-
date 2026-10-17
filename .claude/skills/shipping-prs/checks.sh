#!/usr/bin/env bash
# Проверки перед коммитом — те же команды, что в CI (.github/workflows/ci.yml), но только нужные изменённым файлам.
# Изменённые файлы — относительно origin/main: коммиты ветки, правки в рабочей копии и новые файлы.
#
#   bash "${CLAUDE_SKILL_DIR}/checks.sh"            — выбрать и запустить
#   bash "${CLAUDE_SKILL_DIR}/checks.sh" --dry-run  — только показать, что будет запущено и почему
#   bash "${CLAUDE_SKILL_DIR}/checks.sh" --all      — всё, как CI
#
# Останавливается на первой упавшей проверке и пишет, какая упала. Код выхода 0 — всё нужное прошло.
set -uo pipefail

dry=0; all=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    --all) all=1 ;;
    *) echo "Неизвестный флаг: $arg (есть --dry-run и --all)"; exit 2 ;;
  esac
done

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Не репозиторий git: запусти из папки магазина"; exit 2; }
cd "$root"

if ! git fetch -q origin main 2>/dev/null; then
  echo "! origin/main не обновлён (нет сети?) — сравниваю с последним полученным"
fi
changed=$( { git diff --name-only origin/main...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u)

if [ -z "$changed" ] && [ "$all" = 0 ]; then
  echo "Изменений относительно origin/main нет — проверять нечего"
  exit 0
fi

# Совпадает ли хоть один изменённый файл с шаблоном (grep -E по путям от корня)
touches() { [ "$all" = 1 ] || grep -qE "$1" <<<"$changed"; }

# Код, который читают тесты правил и функций: src/shared/ и src/types.ts напрямую, а src/utils/ — через
# импорты functions/test и scripts/client-order-sample.ts (не только прямые, поэтому берём папку целиком)
shared='^(src/shared/|src/utils/|src/types\.ts)'

steps=()
reasons=()
add() { steps+=("$1"); reasons+=("$2"); }

add "bun run lint" "всегда (CI: Typecheck & build)"
add "bun run build" "всегда (CI: Typecheck & build)"
if touches "^(firestore\.rules|tests/firestore\.rules\.test\.mjs|tests/audit-attacks\.test\.mjs|scripts/client-order-sample\.ts)|$shared"; then
  add "bun run test:rules" "правила, их тесты или код, из которого собирается образец заказа"
fi
if touches "^functions/|$shared"; then
  [ -d functions/node_modules ] || add "npm ci --prefix functions" "у functions/ свои пакеты, их ещё нет"
  add "npm run typecheck --prefix functions" "Cloud Functions или общий с ними код"
  add "npm run build --prefix functions" "Cloud Functions или общий с ними код"
  add "bun run test:functions" "Cloud Functions или общий с ними код"
fi
if touches '^(src/|tests/e2e/|playwright\.config\.ts|index\.html|vite\.config\.ts|package\.json|bun\.lock|firebase\.json|firestore\.rules)'; then
  add "bun run test:e2e" "экраны, правила или сборка: сценарии покупателя и админки"
fi

echo "Изменено файлов: $(grep -c . <<<"$changed")"
for i in "${!steps[@]}"; do echo "  · ${steps[$i]} — ${reasons[$i]}"; done
[ "$dry" = 1 ] && exit 0

# Без пакетов lint и build падают с непонятной ошибкой — ставим заранее, как CI
if [ ! -d node_modules ]; then
  echo "→ bun install --frozen-lockfile (папки node_modules нет)"
  bun install --frozen-lockfile || { echo "✗ bun install не прошёл"; exit 1; }
fi
# Тесты правил, функций и сценарии идут в эмуляторах Firebase, а им нужна Java
if [[ " ${steps[*]} " == *"test:"* ]] && ! command -v java >/dev/null; then
  echo "✗ Нет Java: тесты в эмуляторах не запустить. Здесь их проверит CI — скажи об этом в отчёте"
  exit 1
fi

for cmd in "${steps[@]}"; do
  echo "→ $cmd"
  start=$SECONDS
  if ! bash -c "$cmd"; then
    echo "✗ Упало: $cmd (через $((SECONDS - start)) с)"
    exit 1
  fi
  echo "✓ $cmd ($((SECONDS - start)) с)"
done
echo "Все нужные проверки прошли"
