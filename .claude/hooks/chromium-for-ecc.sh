#!/bin/bash
# Сервер chrome-devtools из плагина ECC (.mcp.json плагина: chrome-devtools-mcp) ищет Google Chrome в
# /opt/google/chrome/chrome. В облачном контейнере Claude Code его нет — есть Chromium Playwright в /opt/pw-browsers,
# поэтому инструменты chrome-devtools падали с «Could not find Google Chrome executable». Хук кладёт на место Chrome
# обёртку над этим Chromium: без песочницы (под root Chrome иначе не стартует; Playwright в e2e запускает его так же)
# и без экрана (--headless=new). Ничего не скачивает; `--now` — поставить и вне облака.
set -euo pipefail

CHROME=/opt/google/chrome/chrome
CHROMIUM=/opt/pw-browsers/chromium

if [ "${1:-}" != "--now" ]; then
  [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
fi

# Настоящий Chrome уже стоит или Chromium нет — делать нечего.
[ -e "$CHROME" ] && exit 0
[ -x "$CHROMIUM" ] || exit 0

mkdir -p "$(dirname "$CHROME")"
cat > "$CHROME" <<EOF
#!/bin/sh
exec $CHROMIUM --no-sandbox --headless=new "\$@"
EOF
chmod +x "$CHROME"
