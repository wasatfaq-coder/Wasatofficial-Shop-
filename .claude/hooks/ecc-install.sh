#!/bin/bash
# Ставит плагин ECC (https://github.com/affaan-m/ECC: скиллы ecc:*, агенты, команды и хуки) в облачных сессиях
# Claude Code. Плагин включён в .claude/settings.json (enabledPlugins), но облачная сессия начинается в чистом
# контейнере и сама его не скачивает. Версия закреплена тегом и проверяется по коммиту: код этой версии прочитан
# перед установкой; новую версию — отдельным PR, снова прочитав хуки (scripts/hooks/ в репозитории ECC).
# Скиллы и команды появляются в этой же сессии (reloadSkills), агенты и хуки ECC — со следующего запуска сессии.
# `--now` — поставить и вне облака.
set -euo pipefail

TAG=v2.2.3
COMMIT=c05b2d6614f62f6db0047669aa4eefb223d478f9
INSTALLED="$HOME/.claude/plugins/installed_plugins.json"
SETTINGS="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/settings.json"

if [ "${1:-}" != "--now" ]; then
  [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
fi

installed_commit() {
  node -e '
    try {
      const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const entries = (data.plugins && data.plugins["ecc@ecc"]) || [];
      process.stdout.write(entries.map(e => e.gitCommitSha || "").join("\n"));
    } catch { /* нет файла — плагин не стоит */ }
  ' "$INSTALLED"
}

if installed_commit | grep -qx "$COMMIT"; then
  exit 0
fi

# --scope project пишет в .claude/settings.json те же строки, что уже лежат там, поэтому файл не меняется.
claude plugin marketplace add "affaan-m/ECC@$TAG" --scope project >&2
claude plugin install ecc@ecc --scope project >&2

if ! installed_commit | grep -qx "$COMMIT"; then
  # Тег указывает не на прочитанный коммит: такой код не запускаем.
  # uninstall выключает плагин в .claude/settings.json — возвращаем файл, чтобы правка не попала в коммит.
  cp "$SETTINGS" "$SETTINGS.ecc-backup"
  claude plugin uninstall ecc@ecc --scope project >&2 || true
  mv "$SETTINGS.ecc-backup" "$SETTINGS"
  echo "ECC $TAG указывает не на коммит $COMMIT — плагин удалён, нужна проверка новой версии." >&2
  exit 1
fi

echo '{"hookSpecificOutput": {"hookEventName": "SessionStart", "reloadSkills": true}}'
