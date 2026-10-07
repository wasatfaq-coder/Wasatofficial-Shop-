#!/usr/bin/env python3
"""Правит форму скиллов плагина ECC по руководству Anthropic по скиллам (docs/skills.md, «Скиллы не из репозитория»).

ECC ставится в каждой облачной сессии заново (.claude/hooks/ecc-install.sh), поэтому правка хранится здесь и
повторяется после установки. Меняется только оформление — то, что руководство разрешает без решения владельца:
  1. SKILL.md длиннее 500 строк — крупные разделы дословно в reference/<раздел>.md, на месте раздела — ссылка
     (первый раздел, обычно «When to use», остаётся);
  2. путь ~/.claude/skills/<скилл>/… к файлу плагина — ${CLAUDE_SKILL_DIR}/…: плагин лежит не в ~/.claude/skills;
  3. скрипт скилла в команде — ${CLAUDE_SKILL_DIR}/…: команды выполняются из папки проекта, а не скилла;
  4. файл скилла, о котором SKILL.md молчит, — ссылка из SKILL.md;
  5. файл длиннее 100 строк — оглавление «## Contents» в начале;
  6. скиллы и команды ECC не из .claude/ecc-visible.txt уходят в каталог: SKILL.md → SKILL.md.catalog, имя.md →
     имя.md.catalog. Claude Code такие файлы не грузит, и список скиллов, который видит Claude (~30 000 знаков), вмещает
     описания всех остальных — проекта, Anthropic и нужных магазину ECC. Каталог с описаниями —
     .claude/skills/finding-skills/catalog.md: по нему Claude подбирает и выполняет скилл по просьбе (решение владельца
     07.10). skillOverrides в настройках для скиллов плагинов Claude Code не читает — поэтому правка в файлах. Команды,
     которые автор ECC сам сделал ручными (disable-model-invocation), остаются на месте и в каталоге помечены.
Имена скиллов, тексты правил, команды и флаги, скрипты и хуки ECC не меняются. Повторный запуск ничего не меняет.

Запуск: python3 -I ecc-skill-fixes.py [папка skills …] — без аргументов берёт плагин ecc@ecc из
~/.claude/plugins/installed_plugins.json и пишет каталог; с папкой (проверка на копии) каталог не пишет.
В stdout — число изменённых файлов, сообщения — в stderr.
"""
import json
import re
import sys
from pathlib import Path

LIMIT = 500    # строк тела SKILL.md — предел из руководства
TARGET = 480   # выносить, пока не станет меньше: запас под строки-ссылки
TOC_MIN = 100  # файл длиннее — нужно оглавление
FENCE = re.compile(r'^\s*(```|~~~)')
TOC_HEAD = re.compile(r'^#+\s*(Contents|Содержание|Оглавление)', re.I)
SHELL_LANGS = {'', 'bash', 'sh', 'shell', 'zsh', 'console'}
LOCAL_LINK = re.compile(r'\]\((?!https?:|mailto:|#|/|\$\{|~)([^)\s]+)\)')


def split_frontmatter(text):
    m = re.match(r'(---\n.*?\n---\n?)(.*)', text, re.S)
    return (m.group(1), m.group(2)) if m else ('', text)


def code_mask(lines):
    """Для каждой строки — внутри блока кода или нет (сами ограды ``` считаются внутри)."""
    inside, mask = False, []
    for line in lines:
        if FENCE.match(line):
            mask.append(True)
            inside = not inside
        else:
            mask.append(inside)
    return mask


def write(path, old, new):
    if new == old:
        return 0
    path.write_text(new, encoding='utf-8')
    return 1


def first_heading(path):
    for line in path.read_text(encoding='utf-8', errors='ignore').splitlines()[:60]:
        if re.match(r'#{1,3}\s', line):
            return line.lstrip('#').strip()
    return ''


def slugify(title, n):
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:50].strip('-')
    return slug or f'section-{n}'


def split_long(skill):
    """1. Крупные разделы длинного SKILL.md — дословно в отдельные файлы."""
    path = skill / 'SKILL.md'
    text = path.read_text(encoding='utf-8')
    head, body = split_frontmatter(text)
    if body.count('\n') + 1 <= LIMIT:
        return 0
    lines = body.split('\n')
    mask = code_mask(lines)
    starts = [i for i, line in enumerate(lines) if line.startswith('## ') and not mask[i]]
    sections = [(s, starts[k + 1] if k + 1 < len(starts) else len(lines)) for k, s in enumerate(starts)]
    refdir = 'references' if (skill / 'references').is_dir() else 'reference'
    total, moved, taken = len(lines), {}, set()
    for start, end in sorted(sections[1:], key=lambda s: s[1] - s[0], reverse=True):
        if total <= TARGET or end - start < 10:
            break
        name = slugify(lines[start][3:].strip(), start)
        rel, k = f'{refdir}/{name}.md', 2
        while (skill / rel).exists() or rel in taken:
            rel, k = f'{refdir}/{name}-{k}.md', k + 1
        taken.add(rel)
        moved[start] = (end, rel)
        total -= end - start - 4
    out, files, i = [], 0, 0
    while i < len(lines):
        if i not in moved:
            out.append(lines[i])
            i += 1
            continue
        end, rel = moved[i]
        part = lines[i:end]
        part_mask = mask[i:end]

        def relink(m):
            target = m.group(1)
            return f'](../{target})' if (skill / target.split('#')[0]).exists() else m.group(0)

        part = [line if part_mask[j] else LOCAL_LINK.sub(relink, line) for j, line in enumerate(part)]
        (skill / rel).parent.mkdir(parents=True, exist_ok=True)
        (skill / rel).write_text('\n'.join(part).rstrip('\n') + '\n', encoding='utf-8')
        files += 1
        out += [lines[i], '',
                f'Moved verbatim to [{rel}]({rel}) to keep SKILL.md under {LIMIT} lines; read it when this part is needed.',
                '']
        i = end
    return files + write(path, text, head + '\n'.join(out))


def fix_skill_paths(skill, root):
    """2. ~/.claude/skills/<скилл>/… → ${CLAUDE_SKILL_DIR}/… для файлов, которые есть в плагине."""
    path = skill / 'SKILL.md'
    text = path.read_text(encoding='utf-8')

    def repl(m):
        name, rest = m.group(1), m.group(2)
        target = root / name / rest
        if name == skill.name:
            # Путь к самому SKILL.md — это куда копировать скилл при ручной установке, а не файл плагина.
            if rest in ('', 'SKILL.md') or not (target.exists() or target.parent.is_dir()):
                return m.group(0)
            return '${CLAUDE_SKILL_DIR}/' + rest
        if (root / name / 'SKILL.md').is_file() and target.exists():
            return '${CLAUDE_SKILL_DIR}/../' + name + '/' + rest
        return m.group(0)

    new = re.sub(r'(?:~|\$HOME)/\.claude/skills/([\w.-]+)/([\w./-]*)', repl, text)
    return write(path, text, new)


def fix_script_paths(skill):
    """3. Файл скилла в блоке кода SKILL.md — через ${CLAUDE_SKILL_DIR}."""
    path = skill / 'SKILL.md'
    text = path.read_text(encoding='utf-8')
    rels = sorted((f.relative_to(skill).as_posix() for f in skill.rglob('*') if f.is_file() and f.suffix != '.md'),
                  key=len, reverse=True)
    if not rels:
        return 0
    out, in_code, lang = [], False, ''
    for line in text.split('\n'):
        if FENCE.match(line):
            if not in_code:
                info = line.strip()[3:].strip().lower()
                lang = info.split()[0] if info else ''
            in_code = not in_code
            out.append(line)
            continue
        if in_code:
            for rel in rels:
                def repl(m, rel=rel, line=line):
                    before = line[m.start() - 1] if m.start() else ''
                    if lang in SHELL_LANGS and before not in '"\'':
                        return f'"${{CLAUDE_SKILL_DIR}}/{rel}"'
                    return f'${{CLAUDE_SKILL_DIR}}/{rel}'
                line = re.sub(r'(?<![\w/}.~-])' + re.escape(rel) + r'(?![\w/-])', repl, line)
        out.append(line)
    return write(path, text, '\n'.join(out))


def link_unmentioned(skill):
    """4. Ссылка из SKILL.md на каждый .md скилла, который SKILL.md не называет."""
    path = skill / 'SKILL.md'
    text = path.read_text(encoding='utf-8')
    missing = [f for f in sorted(skill.rglob('*.md'))
               if f.name != 'SKILL.md' and f.relative_to(skill).as_posix() not in text and f.name not in text]
    if not missing:
        return 0
    items = []
    for f in missing:
        rel, title = f.relative_to(skill).as_posix(), first_heading(f)
        items.append(f'- [{rel}]({rel})' + (f' — {title}' if title else ''))
    block = '\n## Files in this skill\n\nNot referenced above; open the one the task needs.\n\n' + '\n'.join(items) + '\n'
    return write(path, text, text.rstrip('\n') + '\n' + block)


def add_tocs(skill):
    """5. Оглавление в начале каждого .md длиннее 100 строк (кроме SKILL.md — он читается целиком)."""
    files = 0
    for f in sorted(skill.rglob('*.md')):
        if f.name == 'SKILL.md':
            continue
        text = f.read_text(encoding='utf-8', errors='ignore')
        lines = text.split('\n')
        if text.count('\n') <= TOC_MIN or any(TOC_HEAD.match(line) for line in lines[:40]):
            continue
        mask = code_mask(lines)

        def heads(level):
            return [line[level + 1:].strip() for j, line in enumerate(lines)
                    if not mask[j] and re.match('#' * level + r'\s', line)]

        items = heads(2) if len(heads(2)) >= 2 else heads(3) if len(heads(3)) >= 2 else heads(2) + heads(3)
        if not items:
            items = ['One section without subheadings — read from the top.']
        start = 0
        if lines and lines[0].strip() == '---':
            start = next((j + 1 for j in range(1, len(lines)) if lines[j].strip() == '---'), 0)
        pos = start
        for j in range(start, min(len(lines), 35)):
            if not mask[j] and lines[j].startswith('# '):
                pos = j + 1
                break
        lines[pos:pos] = ['', '## Contents', ''] + [f'- {h}' for h in items] + ['']
        files += write(f, text, '\n'.join(lines))
    return files


CLAUDE_DIR = Path(__file__).resolve().parent.parent
VISIBLE_LIST = CLAUDE_DIR / 'ecc-visible.txt'
CATALOG = CLAUDE_DIR / 'skills/finding-skills/catalog.md'
HIDDEN = '.catalog'
OLD_MARK = '# wasat: скрыт от модели, вызов /ecc:имя; видимые — .claude/ecc-visible.txt'  # пометка версии 06.10

# Разделы каталога: (заголовок, регулярное выражение по имени или по «имя описание»). Первый совпавший — раздел скилла.
FOREIGN_STACKS = (r'^(django|laravel|kotlin|quarkus|spring|golang|go-|rust|cpp|csharp|fsharp|dotnet|swift|dart|flutter|'
                  r'android|compose|perl|pytorch|angular|vue|nuxt|nextjs|nestjs|rails|fastapi|java|jpa|gradle|clickhouse|'
                  r'mysql|postgres|redis|prisma|kubernetes|python|php|ruby|elixir|scala|harmonyos|arkts|tinystruct|flox|'
                  r'windows|ui-to-vue|generating-python)')
FOREIGN_FIELDS = (r'^(homelab|network|cisco|netmiko|healthcare|hipaa|defi|evm|nodejs-keccak|prediction|ito-|scientific|'
                  r'investor|energy|customs|carrier|logistics|production-scheduling|quality-nonconformance|remotion|manim|'
                  r'videodb|video|tasteforge|taste|blender|liquid-glass|ios|foundation-models|esign|master-agreement|visa|'
                  r'uncloud|nanoclaw|nasiko|openclaw|recsys|mle|ml-|rag-|agent-payment|llm-trading|jira|x-api)')
TOPICS = [
    ('Другие языки и фреймворки (не стек магазина)', 'name', FOREIGN_STACKS),
    ('Другие области', 'name', FOREIGN_FIELDS),
    ('Безопасность', 'any', r'secur|secret|vulnerab|owasp|sast|agentshield|threat|pentest|privacy|gdpr'),
    ('Тесты и проверки', 'any', r'\btest|tdd|e2e|\bqa\b|verif|\bevals?\b|coverage|playwright|benchmark|smoke'),
    ('Данные, API и бэкенд', 'any', r'\bapi\b|database|\bsql|backend|server|cache|queue|schema|firebase|\bdata\b|'
                                    r'migration|storage'),
    ('Фронтенд, дизайн и анимация', 'any', r'react|frontend|\bui\b|\bux\b|css|tailwind|design|motion|animat|a11y|'
                                           r'accessib|figma|landing|visual|typograph|slides'),
    ('Git, PR, CI, публикация и инфраструктура', 'any', r'\bgit|pull request|\bprs?\b|review|\bci\b|deploy|release|'
                                                        r'canary|commit|changelog|docker|devops|infra'),
    ('Документы, исследования и маркетинг', 'any', r'research|\bdocs?\b|documentation|content|marketing|\bseo\b|brand|'
                                                   r'social|writing|article|email|copy|launch'),
    ('Claude Code, агенты и скиллы', 'any', r'claude|agent|skill|hook|harness|\bloop|context|compact|\bmcp\b|prompt|'
                                            r'workflow|orchestr|\becc\b|session|token'),
]
SHOWN_ORDER = [5, 3, 2, 6, 4, 8, 7, None, 0, 1]  # магазину нужное — первым, чужие стеки и области — в конце


def visible_names():
    try:
        lines = VISIBLE_LIST.read_text(encoding='utf-8').splitlines()
    except OSError:
        return None  # нет списка — ничего не убираем в каталог
    return {line.strip() for line in lines if line.strip() and not line.startswith('#')}


def field(fm, key):
    m = re.search(rf'^{key}:[ \t]*(.*(?:\n[ \t]+.*)*)', fm, re.M)
    if not m:
        return ''
    value = re.sub(r'\s+', ' ', re.sub(r'^[>|][-+]?', '', m.group(1).strip())).strip()
    return value[1:-1] if len(value) > 1 and value[0] == value[-1] and value[0] in '"\'' else value


def drop_old_mark(path):
    """Пометка «только ручной вызов» версии 06.10 больше не нужна: скрытое уходит в каталог."""
    text = path.read_text(encoding='utf-8')
    m = re.match(r'---\n(.*?)\n---', text, re.S)
    lines = m.group(1).split('\n') if m else []
    if OLD_MARK not in lines:
        return 0
    i = lines.index(OLD_MARK)
    del lines[i:i + 2]
    return write(path, text, '---\n' + '\n'.join(lines) + '\n---' + text[m.end():])


def entries(root):
    """(вид, имя, путь .md) каждого скилла и команды плагина — и тех, что уже в каталоге."""
    for d in sorted(root.iterdir()):
        path = d / 'SKILL.md'
        if path.is_file() or Path(str(path) + HIDDEN).is_file():
            yield 'скилл', d.name, path
    commands = root.parent / 'commands'
    names = {p.name[:-len(HIDDEN)] if p.name.endswith(HIDDEN) else p.name for p in commands.glob('*.md*')}
    for name in sorted(n for n in names if n.endswith('.md')):
        yield 'команда', name[:-3], commands / name


def place(path, visible):
    """6. Видимый — под своим именем, остальные — с .catalog на конце: такой файл Claude Code не грузит."""
    hidden = Path(str(path) + HIDDEN)
    src, dst = (hidden, path) if visible else (path, hidden)
    if not src.is_file() or dst.exists():
        return 0
    src.rename(dst)
    return 1


def fix_visibility(root):
    """Раскладывает скиллы и команды между списком и каталогом; возвращает (изменено файлов, строки каталога)."""
    names = visible_names()
    if names is None:
        return 0, None
    changed, rows = 0, []
    for kind, name, path in entries(root):
        current = path if path.is_file() else Path(str(path) + HIDDEN)
        changed += drop_old_mark(current)
        text = current.read_text(encoding='utf-8')
        m = re.match(r'---\n(.*?)\n---', text, re.S)
        fm = m.group(1) if m else ''
        desc = ' — '.join(v for v in (field(fm, 'description'), field(fm, 'when_to_use')) if v)
        if re.search(r'^disable-model-invocation:\s*true', fm, re.M):
            changed += place(path, True)  # автор ECC сам оставил его ручным — на месте, в каталоге с пометкой
            rows.append((kind, name, desc, True))
            continue
        changed += place(path, name in names)
        if name not in names:
            rows.append((kind, name, desc, False))
    return changed, rows


def topic(name, desc):
    """Раздел каталога: сначала по имени (оно точнее), потом по описанию; не нашёлся — «Прочее»."""
    for target in (name, f'{name} {desc}'.lower()):
        for i, (_, where, pattern) in enumerate(TOPICS):
            if (where == 'any' or target is name) and re.search(pattern, target):
                return i
    return None


def write_catalog(rows, root):
    """Каталог скиллов и команд, которых нет в списке Claude, — с описаниями, по разделам."""
    base = str(root.parent).replace(str(Path.home()), '~', 1)
    groups = {i: [] for i in SHOWN_ORDER}
    for kind, name, desc, manual in sorted(rows, key=lambda r: (r[1], r[0])):
        note = f', только ручной вызов `/ecc:{name}`' if manual else ''
        groups[topic(name, desc)].append(f'- `{name}` ({kind}{note}) — {desc or "без описания"}')
    title = {i: TOPICS[i][0] if i is not None else 'Прочее' for i in SHOWN_ORDER}
    skills = sum(1 for r in rows if r[0] == 'скилл')
    out = ['# Каталог скиллов и команд ECC вне списка', '',
           f'Сгенерирован `.claude/hooks/ecc-skill-fixes.py` из ECC {root.parent.name} и `.claude/ecc-visible.txt` — '
           'руками не править. Здесь скиллы и команды, которых нет в списке скиллов Claude; те, что в списке, '
           'Claude видит сам. Строка: `имя` (вид) — описание автора ECC.', '',
           f'Скиллов {skills}, команд {len(rows) - skills}. Файлы:', '',
           f'- скилл — `{base}/skills/<имя>/SKILL.md{HIDDEN}`',
           f'- команда — `{base}/commands/<имя>.md{HIDDEN}` (ручная — `{base}/commands/<имя>.md`)', '',
           '## Contents', '']
    out += [f'- {title[i]} ({len(groups[i])})' for i in SHOWN_ORDER if groups[i]]
    for i in SHOWN_ORDER:
        if groups[i]:
            out += ['', f'## {title[i]}', ''] + groups[i]
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    old = CATALOG.read_text(encoding='utf-8') if CATALOG.exists() else ''
    return write(CATALOG, old, '\n'.join(out) + '\n')


def fix_skill(skill, root):
    # Порядок важен: сначала вынос разделов (пути в вынесенном тексте ${CLAUDE_SKILL_DIR} не получат —
    # Claude Code подставляет его только в SKILL.md), потом пути, ссылки и оглавления, в том числе новых файлов.
    return (split_long(skill) + fix_skill_paths(skill, root) + fix_script_paths(skill)
            + link_unmentioned(skill) + add_tocs(skill))


def plugin_roots():
    try:
        data = json.loads((Path.home() / '.claude/plugins/installed_plugins.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []
    return [Path(e['installPath']) / 'skills' for e in data.get('plugins', {}).get('ecc@ecc', []) if e.get('installPath')]


def main():
    installed = not sys.argv[1:]
    roots = [Path(a) for a in sys.argv[1:]] or plugin_roots()
    changed = 0
    for root in roots:
        if not root.is_dir():
            print(f'ecc-skill-fixes: нет папки {root}', file=sys.stderr)
            continue
        for skill in sorted(d for d in root.iterdir() if (d / 'SKILL.md').is_file()):
            try:
                changed += fix_skill(skill, root)
            except (OSError, UnicodeError) as error:
                print(f'ecc-skill-fixes: {skill.name} пропущен: {error}', file=sys.stderr)
        try:
            moved, rows = fix_visibility(root)
            changed += moved
            if installed and rows is not None:
                changed += write_catalog(rows, root)
        except (OSError, UnicodeError) as error:
            print(f'ecc-skill-fixes: каталог не обновлён: {error}', file=sys.stderr)
    print(f'ecc-skill-fixes: изменено файлов {changed}', file=sys.stderr)
    print(changed)


if __name__ == '__main__':
    main()
