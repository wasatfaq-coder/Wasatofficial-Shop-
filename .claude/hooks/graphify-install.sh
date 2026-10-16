#!/bin/bash
# Ставит Graphify для скилла graph-pilot (.claude/skills/graph-pilot) в облачных сессиях Claude Code.
# Пакет на PyPI — graphifyy (две «y»), команда — graphify. Версия закреплена: её код прочитан перед
# установкой; новую версию — отдельным PR, снова прочитав код.
# Ставится в фоне, чтобы не задерживать начало сессии; `--now` — поставить сразу и дождаться.
set -euo pipefail

VERSION=0.9.75

if [ "${1:-}" != "--now" ]; then
  [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
  echo '{"async": true, "asyncTimeout": 300000}'
fi

if command -v graphify >/dev/null 2>&1 && [ "$(graphify --version 2>/dev/null)" = "graphify $VERSION" ]; then
  exit 0
fi

if command -v uv >/dev/null 2>&1; then
  uv tool install --force "graphifyy==$VERSION" >&2
elif command -v pipx >/dev/null 2>&1; then
  pipx install --force "graphifyy==$VERSION" >&2
else
  python3 -m pip install --user "graphifyy==$VERSION" >&2
fi
