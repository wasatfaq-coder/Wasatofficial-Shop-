#!/usr/bin/env python3
"""Правит форму скиллов плагина ECC по руководству Anthropic по скиллам (docs/skills.md, «Скиллы не из репозитория»).

ECC ставится в каждой облачной сессии заново (.claude/hooks/ecc-install.sh), поэтому правка хранится здесь и
повторяется после установки. Меняется только оформление — то, что руководство разрешает без решения владельца:
  1. SKILL.md длиннее 500 строк — крупные разделы дословно в reference/<раздел>.md, на месте раздела — ссылка
     (первый раздел, обычно «When to use», остаётся);
  2. путь ~/.claude/skills/<скилл>/… к файлу плагина — ${CLAUDE_SKILL_DIR}/…: плагин лежит не в ~/.claude/skills;
  3. скрипт скилла в команде — ${CLAUDE_SKILL_DIR}/…: команды выполняются из папки проекта, а не скилла;
  4. файл скилла, о котором SKILL.md молчит, — ссылка из SKILL.md;
  5. файл длиннее 100 строк — оглавление «## Contents» в начале.
Имена скиллов, тексты правил, команды и флаги, скрипты и хуки ECC не меняются. Повторный запуск ничего не меняет.

Запуск: python3 -I ecc-skill-fixes.py [папка skills …] — без аргументов берёт плагин ecc@ecc из
~/.claude/plugins/installed_plugins.json. В stdout — число изменённых файлов, сообщения — в stderr.
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
    print(f'ecc-skill-fixes: изменено файлов {changed}', file=sys.stderr)
    print(changed)


if __name__ == '__main__':
    main()
