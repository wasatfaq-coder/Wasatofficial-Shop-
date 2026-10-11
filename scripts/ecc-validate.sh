#!/bin/bash
# Проверки самого ECC для установленного плагина — после обновления ECC (docs/skills.md, «Проверки самого ECC»).
#   1. Плагин совпадает с клоном маркетплейса того же коммита: ECC стоит без правок (решение владельца 11.10).
#   2. Проверки ECC (scripts/ci/validate-*.js, check-*.js — как в его CI) на копии плагина.
#   3. Тесты ECC (tests/run-all.js, как `npm ci && npm test` в его CI; ECC_VALIDATE_TESTS=0 — без них, ≈ 7 минут) на копии
#      клона с .git. Тесты пишут в домашнюю папку (~/.claude/package-manager.json, журналы хуков, заготовки сессий), поэтому
#      у них свои HOME и TMPDIR во временной папке: иначе они засоряют ~/.claude сессии и мешают друг другу.
# Зависимости проверок (js-yaml, ajv — версии из package.json ECC) ставятся во временную папку. Код выхода 0 — всё прошло.
set -uo pipefail

INSTALLED="$HOME/.claude/plugins/installed_plugins.json"
MARKET="$HOME/.claude/plugins/marketplaces/ecc"
read -r ROOT COMMIT < <(node -e '
  try {
    const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const entry = ((data.plugins && data.plugins["ecc@ecc"]) || []).find(e => e.installPath);
    if (entry) process.stdout.write(`${entry.installPath} ${entry.gitCommitSha || "-"}\n`);
  } catch { /* нет файла — плагин не стоит */ }
' "$INSTALLED")
[ -d "${ROOT:-}/scripts/ci" ] || { echo "ECC не установлен — проверять нечего." >&2; exit 1; }

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT
failed=0

if [ "$(git -C "$MARKET" rev-parse HEAD 2>/dev/null)" != "$COMMIT" ]; then
  echo "ОШИБКА  нет клона ECC ${COMMIT:0:7} в $MARKET — не с чем сверить плагин и негде запустить тесты"
  exit 1
fi
# .in_use — отметка Claude Code в папке плагина, не файл ECC.
if diff_out="$(diff -rq -x .git -x .in_use "$ROOT" "$MARKET" 2>&1)"; then
  echo "ок      плагин совпадает с ECC ${COMMIT:0:7} — правок нет"
else
  echo "ОШИБКА  плагин отличается от ECC ${COMMIT:0:7} ($(echo "$diff_out" | wc -l) различий):"
  echo "$diff_out" | head -5 | sed 's/^/        /'
  failed=1
fi

cp -R "$ROOT" "$TMP/ecc"
npm install --silent --no-save --no-package-lock --prefix "$TMP/deps" js-yaml@4.3.2 ajv@8.20.0 >/dev/null 2>&1 \
  || { echo "Не поставились js-yaml и ajv (сеть?) — проверки ECC не запущены." >&2; exit 1; }

for check in "$TMP"/ecc/scripts/ci/validate-*.js "$TMP"/ecc/scripts/ci/check-*.js; do
  name="$(basename "$check" .js)"
  if out="$(cd "$TMP/ecc" && CLAUDE_PLUGIN_ROOT="$TMP/ecc" NODE_PATH="$TMP/deps/node_modules" node "$check" 2>&1)"; then
    echo "ок      $name: $(echo "$out" | tail -1 | cut -c1-100)"
  else
    echo "ОШИБКА  $name:"; echo "$out" | tail -10 | sed 's/^/        /'
    failed=1
  fi
done

if [ "${ECC_VALIDATE_TESTS:-1}" = 1 ]; then
  # Копия клона с .git: часть тестов ECC работает с git репозитория.
  cp -R "$MARKET" "$TMP/tests"
  mkdir -p "$TMP/home" "$TMP/tmp"
  # Зависимости ECC по его package-lock.json, как `npm ci` в его CI: без них ≈ 100 тестов падают на sql.js, @iarna/toml
  # и typescript. Плагин их не ставит — в Claude Code они нужны только части команд ECC (ECC сам об этом предупреждает).
  if ! (cd "$TMP/tests" && HOME="$TMP/home" npm ci --no-audit --no-fund --loglevel=error >"$TMP/npm-ci.log" 2>&1); then
    echo "ОШИБКА  тесты ECC: npm ci не прошёл (сеть?):"; tail -5 "$TMP/npm-ci.log" | sed 's/^/        /'
    exit 1
  fi
  # Окружение — чистое (env -i), как в CI ECC: переменные облачной сессии меняют поведение хуков в тестах
  # (CLAUDE_CODE_ENTRYPOINT=remote — observe.sh выходит сразу, ECC_* — выключенный GateGuard).
  # PID 1 облачного контейнера (process_api) не забирает осиротевшие процессы: завершённый процесс остаётся зомби, и тест
  # install-sh «leader exit cannot hide an owned descendant» считает его живым. Поэтому тесты идут под сборщиком —
  # процессом с PR_SET_CHILD_SUBREAPER, который забирает их сам.
  cat >"$TMP/reaper.py" <<'REAPER'
import ctypes, os, sys
ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0)  # PR_SET_CHILD_SUBREAPER
main = os.fork()
if main == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
while True:
    pid, status = os.waitpid(-1, 0)
    if pid == main:
        sys.exit(os.waitstatus_to_exitcode(status) % 256)
REAPER
  (cd "$TMP/tests" && env -i PATH="$PATH" LANG=C.UTF-8 HOME="$TMP/home" TMPDIR="$TMP/tmp" CLAUDE_PLUGIN_ROOT="$TMP/tests" \
    GIT_AUTHOR_NAME=ecc-test GIT_AUTHOR_EMAIL=ecc-test@example.com \
    GIT_COMMITTER_NAME=ecc-test GIT_COMMITTER_EMAIL=ecc-test@example.com \
    python3 -I "$TMP/reaper.py" node tests/run-all.js >"$TMP/tests.log" 2>&1)
  code=$?
  # «файл: тест» каждой упавшей проверки из журнала run-all
  fails="$(awk '/^━━━ Running /{f=$3} /^  ✗ /{sub(/^  ✗ /,""); print f": "$0} /^✗ /{print $2": (файл)"}' "$TMP/tests.log" | sort -u)"
  if [ "$code" = 0 ] && [ -z "$fails" ]; then
    echo "ок      тесты ECC: $(grep -cE '^  ✓ ' "$TMP/tests.log") прошли, ни один не упал"
  else
    # run-all.js выходит с 1, если упал тест; другой код без упавших тестов — прогон оборвался (память, сигнал).
    echo "ОШИБКА  тесты ECC (код выхода $code) — упали $(printf '%s' "$fails" | grep -c .):"
    if [ -n "$fails" ]; then echo "$fails" | head -20 | sed 's/^/        /'; else tail -5 "$TMP/tests.log" | sed 's/^/        /'; fi
    [ -n "${ECC_VALIDATE_LOG:-}" ] && cp "$TMP/tests.log" "$ECC_VALIDATE_LOG"
    failed=1
  fi
fi

exit "$failed"
