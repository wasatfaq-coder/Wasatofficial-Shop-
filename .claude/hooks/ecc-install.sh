#!/bin/bash
# Ставит плагин ECC (https://github.com/affaan-m/ECC: скиллы ecc:*, агенты, команды и хуки) в облачных сессиях
# Claude Code. Плагин включён в .claude/settings.json (enabledPlugins), но облачная сессия начинается в чистом
# контейнере и сама его не скачивает. Версия закреплена тегом и проверяется по коммиту: код этой версии прочитан
# перед установкой; новую версию — отдельным PR, снова прочитав хуки (scripts/hooks/ в репозитории ECC).
# Скиллы и команды появляются в этой же сессии (reloadSkills), агенты и хуки ECC — со следующего запуска сессии.
# Скиллы и команды ECC не правятся (решение владельца 11.10): плагин стоит так, как его выпустил автор.
# `--now` — поставить и вне облака.
set -euo pipefail

TAG=v2.2.3
COMMIT=c05b2d6614f62f6db0047669aa4eefb223d478f9
INSTALLED="$HOME/.claude/plugins/installed_plugins.json"
SETTINGS="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/settings.json"
MARKET="$HOME/.claude/plugins/marketplaces/ecc"

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

# До 11.10 хук правил скиллы и команды ECC (.claude/hooks/ecc-skill-fixes.py, отпечаток — .wasat-skill-fixes в папке
# плагина) и убирал большую часть в каталог (….md.catalog). Контейнер облачной сессии бывает прежним, и в нём плагин остался
# бы правленым — поэтому скиллы и команды берутся заново из клона маркетплейса того же коммита. В stdout — 1, если вернули.
restore_pristine() {
  local root="$1"
  [ -f "$root/.wasat-skill-fixes" ] || [ -n "$(find "$root/skills" "$root/commands" -name '*.md.catalog' -print -quit 2>/dev/null)" ] \
    || { echo 0; return 0; }
  if [ "$(git -C "$MARKET" rev-parse HEAD 2>/dev/null)" != "$COMMIT" ] || [ -n "$(git -C "$MARKET" status --porcelain -- skills commands)" ]; then
    echo "Нет чистого клона ECC $TAG в $MARKET — скиллы ECC остались правлеными; поставь плагин заново." >&2
    echo 0
    return 0
  fi
  local part
  for part in skills commands; do
    rm -rf "${root:?}/$part"
    cp -R "$MARKET/$part" "$root/$part" || {
      echo "Не удалось вернуть $part ECC из $MARKET — поставь плагин заново." >&2
      echo 0
      return 0
    }
  done
  rm -f "$root/.wasat-skill-fixes"
  echo "Скиллы и команды ECC возвращены к $TAG без правок." >&2
  echo 1
}

install_path() {
  node -e '
    try {
      const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const entry = ((data.plugins && data.plugins["ecc@ecc"]) || []).find(e => e.installPath);
      if (entry) process.stdout.write(entry.installPath);
    } catch { /* нет файла — плагин не стоит */ }
  ' "$INSTALLED"
}

# Правила ECC (решение владельца 07.10): плагин их не ставит, README ECC велит копировать rules/common и пакеты своего
# стека папками целиком (между пакетами относительные ссылки) в ~/.claude/rules/ecc/ или .claude/rules/ecc/ проекта.
# Выбран проект: память Claude читает до хуков, и в новом облачном контейнере правила из ~/.claude не действовали бы.
# Копия лежит в репозитории; хук сверяет её с плагином закреплённой версии и обновляет, только если ECC сменился —
# разница попадёт в PR новой версии. Где правила расходятся с CLAUDE.md (названия коммитов и PR, покрытие 80 %), верен CLAUDE.md.
RULE_PACKS="common typescript react web"
RULES_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/rules/ecc"
sync_rules() {
  local root pack
  root="$(install_path)"
  [ -d "$root/rules" ] || { echo "Правила ECC не найдены в плагине — копия в репозитории не сверена." >&2; return 0; }
  mkdir -p "$RULES_DIR"
  for pack in $RULE_PACKS; do
    if ! diff -rq "$root/rules/$pack" "$RULES_DIR/$pack" >/dev/null 2>&1; then
      rm -rf "${RULES_DIR:?}/$pack"
      cp -R "$root/rules/$pack" "$RULES_DIR/"
      echo "Правила ECC ($pack) обновлены из плагина $TAG — проверь разницу в .claude/rules/ecc/ и закоммить." >&2
    fi
  done
  # Лицензия MIT требует уведомления рядом с копией; без .md — иначе Claude Code прочитает её как правило.
  cmp -s "$root/LICENSE" "$RULES_DIR/LICENSE" || cp "$root/LICENSE" "$RULES_DIR/LICENSE"
}

# Разрешения для ECC — в настройки пользователя: разрешения из .claude/settings.json проекта в облачной сессии не действуют
# (проект не отмечен доверенным; правило на ~/.claude к тому же в списке чувствительных путей). Чтение папки плагина — для
# файлов скиллов ECC (references/, примеры, скрипты); серверы MCP из .mcp.json — для агентов и скиллов ECC (gan-evaluator,
# knowledge-ops, docs-lookup).
allow_plugin_reads() {
  python3 -I - "$HOME/.claude/settings.json" "Read(/$HOME/.claude/plugins/cache/ecc/**)" \
    mcp__playwright mcp__memory mcp__context7 <<'PY'
import json, sys
from pathlib import Path
path, rules = Path(sys.argv[1]), sys.argv[2:]
try:
    data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
except (OSError, ValueError):
    sys.exit(f'{path} не читается — разрешения для ECC не добавлены.')
allow = data.setdefault('permissions', {}).setdefault('allow', [])
missing = [rule for rule in rules if rule not in allow]
if missing:
    allow.extend(missing)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
}

# Несколько скиллов ECC (skill-stocktake, rules-distill, continuous-learning, continuous-learning-v2, ck) запускают свои скрипты
# по пути ~/.claude/skills/<скилл>/… — так их кладёт ручная установка ECC, а плагин лежит в ~/.claude/plugins/cache/. Чтобы
# скрипты находились без правки ECC, в ~/.claude/skills/<скилл>/ кладутся ссылки на файлы скилла из плагина — все, кроме
# SKILL.md: без него Claude Code папку скиллом не считает, и скилл в списке не задваивается. Скилл выбирается по тексту самого
# ECC (упоминает ~/.claude/skills/<своё имя>/), чужую установку с настоящим SKILL.md хук не трогает. Ссылки — заново при
# каждом старте: новая версия ECC — новый путь плагина; ссылки на пропавшие файлы убираются.
link_skill_files() {
  local root="$1" skills="$HOME/.claude/skills" dir name target entry link
  [ -d "$root/skills" ] || return 0
  for dir in "$root"/skills/*/; do
    name="$(basename "$dir")"
    grep -rqE "(~|\$HOME)/\.claude/skills/$name/" "$dir" 2>/dev/null || continue
    target="$skills/$name"
    if [ -e "$target/SKILL.md" ] && [ ! -L "$target/SKILL.md" ]; then continue; fi
    for entry in "$dir"*; do
      [ "$(basename "$entry")" = SKILL.md ] && continue
      link="$target/$(basename "$entry")"
      if [ -e "$link" ] && [ ! -L "$link" ]; then continue; fi
      mkdir -p "$target"
      ln -sfn "$entry" "$link"
    done
    [ -d "$target" ] && find "$target" -maxdepth 1 -xtype l -delete
  done
  return 0
}

if installed_commit | grep -qx "$COMMIT"; then
  # Плагин уже стоит (контейнер не новый): перечитываем скиллы, только если вернули их к выпуску автора.
  sync_rules
  allow_plugin_reads || true
  restored="$(restore_pristine "$(install_path)")"
  link_skill_files "$(install_path)" || true
  if [ "$restored" != "0" ]; then
    echo '{"hookSpecificOutput": {"hookEventName": "SessionStart", "reloadSkills": true}}'
  fi
  exit 0
fi

# --scope project пишет в .claude/settings.json те же значения, что уже лежат там, но переставляет ключи — и файл висел
# незакоммиченной правкой в каждой новой сессии. Если по смыслу ничего не изменилось, возвращаем файл из репозитория;
# если изменилось — оставляем правку CLI и предупреждаем.
same_settings() {
  python3 -I - "$SETTINGS.ecc-before" "$SETTINGS" <<'PY'
import json, sys
from pathlib import Path
try:
    before, after = (json.loads(Path(p).read_text(encoding='utf-8')) for p in sys.argv[1:3])
except (OSError, ValueError):
    sys.exit(1)
sys.exit(0 if before == after else 1)
PY
}
# Снимок сверяется и при сбое claude plugin (trap), чтобы перестановка не осталась и тогда; нет файла — нечего сверять.
restore_settings() {
  [ -f "$SETTINGS.ecc-before" ] || return 0
  if same_settings; then
    mv "$SETTINGS.ecc-before" "$SETTINGS"
  else
    rm -f "$SETTINGS.ecc-before"
    echo "claude plugin изменил .claude/settings.json по смыслу — проверь разницу и закоммить." >&2
  fi
}
if [ -f "$SETTINGS" ]; then cp "$SETTINGS" "$SETTINGS.ecc-before"; fi
trap restore_settings EXIT
claude plugin marketplace add "affaan-m/ECC@$TAG" --scope project >&2
claude plugin install ecc@ecc --scope project >&2
restore_settings

if ! installed_commit | grep -qx "$COMMIT"; then
  # Тег указывает не на прочитанный коммит: такой код не запускаем.
  # uninstall выключает плагин в .claude/settings.json — возвращаем файл, чтобы правка не попала в коммит.
  cp "$SETTINGS" "$SETTINGS.ecc-backup"
  claude plugin uninstall ecc@ecc --scope project >&2 || true
  mv "$SETTINGS.ecc-backup" "$SETTINGS"
  echo "ECC $TAG указывает не на коммит $COMMIT — плагин удалён, нужна проверка новой версии." >&2
  exit 1
fi

sync_rules
allow_plugin_reads || true
link_skill_files "$(install_path)" || true
echo '{"hookSpecificOutput": {"hookEventName": "SessionStart", "reloadSkills": true}}'
