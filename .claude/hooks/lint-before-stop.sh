#!/usr/bin/env bash
# Stop-хук: если в рабочей копии есть непроверенные правки, запускает `bun run lint` (tsc --noEmit).
# Ошибки типов возвращаются Claude как причина не останавливаться (exit 2).
# Пропускает проверку, если правок нет, зависимости не установлены или сам Claude уже продолжает работу
# после прошлой остановки (stop_hook_active): так хук не зацикливается.

input=$(cat)
if printf '%s' "$input" | grep -q '"stop_hook_active": *true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if git diff --quiet HEAD -- . && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

if [ ! -x node_modules/.bin/tsc ] || ! command -v bun >/dev/null 2>&1; then
  exit 0
fi

if ! output=$(bun run lint 2>&1); then
  printf '%s\n' "$output" | tail -40 >&2
  echo "bun run lint не прошёл: исправь ошибки типов до завершения." >&2
  exit 2
fi

exit 0
