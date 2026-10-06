# Замер скиллов по семи правилам Anthropic — скрипт из anthropic-skills-guide.md владельца, без изменений (docs/skills.md).
# Только читает: python3 -I scripts/skill-check.py <папка скиллов или скилла>; --compare <копия> <скилл> — потерянные строки.
import os, re, sys
from pathlib import Path

def frontmatter(t):
    m = re.match(r'---\n(.*?)\n---\n?(.*)', t, re.S)
    if not m: return None, t
    fm = {}
    for k, v in re.findall(r'^([\w-]+):[ \t]*(.*(?:\n[ \t]+.*)*)', m.group(1), re.M):
        fm[k] = re.sub(r'\s+', ' ', v).strip().strip('"\'')
    return fm, m.group(2)

def md_links(text):
    return [l.split('#')[0] for l in re.findall(r'\]\(([^)\s]+)\)', text) if not re.match(r'(https?:|mailto:|#)', l)]

def check(skill):
    p = skill / 'SKILL.md'; t = p.read_text(encoding='utf-8'); fm, body = frontmatter(t); out = []
    if fm is None: return 0, 0, ['нет frontmatter']
    name, desc = fm.get('name', skill.name), fm.get('description', '')
    full = (desc + ' ' + fm.get('when_to_use', '')).strip()
    if not re.fullmatch(r'[a-z0-9-]{1,64}', name) or re.search(r'anthropic|claude', name): out.append(f'имя «{name}» вне правил')
    manual = fm.get('disable-model-invocation', '').lower() in ('true', 'yes', 'on', '1')
    if not desc: out.append('пустое описание')
    elif not manual and not re.search(r'when|trigger|\buse\b|когда|использ|применя|если|триггер|просьб|просит', full, re.I): out.append('в описании не видно, когда применять')
    elif len(desc) > 1024: out.append(f'описание {len(desc)} > 1024')
    if len(full) > 1536: out.append(f'описание + when_to_use {len(full)} > 1536')
    if re.search(r'\b(I can|I will|You can)\b|\b(я помогу|я могу|ты можешь|вы можете)\b', desc, re.I): out.append('описание не от третьего лица')
    lines = body.count('\n') + 1
    if lines > 500: out.append(f'SKILL.md {lines} строк > 500')
    files = [f for f in skill.rglob('*') if f.is_file() and f.suffix == '.md' and f.name != 'SKILL.md']
    named = lambda text, f: str(f.relative_to(skill)) in text or f.name in text
    linked = {f.resolve() for f in files if named(t, f)}
    for l in md_links(body):
        if not (skill / l).exists(): out.append(f'битая ссылка {l}')
    missing = [r for r in set(re.findall(r'(?<![\w./])(~/[\w./-]+|/(?:Users|home|opt|etc)/[\w./-]+)', t)) if not os.path.exists(os.path.expanduser(r.rstrip('.')))]
    out += [f'путь не существует {r}' for r in missing if '/skills/' in r]
    if any('/skills/' not in r for r in missing): out.append(f'(не найдено на этой машине, проверить вручную: {len([r for r in missing if "/skills/" not in r])} путей)')
    deep = {}
    for f in files:
        ft = f.read_text(encoding='utf-8', errors='ignore')
        for g in files:
            if g != f and g.resolve() not in linked and named(ft, g): deep.setdefault(g.resolve(), f.relative_to(skill))
    for f in files:
        ft = f.read_text(encoding='utf-8', errors='ignore'); rel = f.relative_to(skill)
        if f.resolve() in deep: out.append(f'{rel}: открывается только через {deep[f.resolve()]} (2-й уровень)')
        elif f.resolve() not in linked: out.append(f'{rel}: SKILL.md его не упоминает')
        if ft.count('\n') > 100 and not re.search(r'^#+\s*(Contents|Содержание|Оглавление)', '\n'.join(ft.splitlines()[:40]), re.M | re.I): out.append(f'{rel}: {ft.count(chr(10))} строк без оглавления')
    if '\\' in ''.join(md_links(body)): out.append('обратный слэш в путях')
    fence = '`' * 3
    code = '\n'.join(re.findall(fence + r'.*?\n(.*?)' + fence, t, re.S))
    for f in skill.rglob('*'):
        rel = str(f.relative_to(skill))
        if f.is_file() and f.suffix != '.md' and re.search(r'(?<![\w/}.~-])' + re.escape(rel) + r'(?![\w/-])', code):
            out.append(f'команда с {rel} без ${{CLAUDE_SKILL_DIR}}: сработает, только если Claude сам перейдёт в папку скилла')
    return lines, len(desc), out + (['(ручной вызов: описание не в контексте)'] if manual else [])

def compare(old, new):
    norm = lambda s: re.sub(r'\s+', ' ', s).strip()
    have = set()
    for f in Path(new).rglob('*.md'): have |= {norm(l) for l in f.read_text(encoding='utf-8').splitlines()}
    lost = [l for l in (Path(old) / 'SKILL.md').read_text(encoding='utf-8').splitlines() if norm(l) and norm(l) not in have and not norm(l).startswith('description:')]
    print(f'Потеряно строк: {len(lost)}'); [print('  -', l[:120]) for l in lost]

if __name__ == '__main__':
    if sys.argv[1] == '--compare': compare(sys.argv[2], sys.argv[3]); sys.exit()
    root = Path(sys.argv[1]).expanduser()
    skills = [root] if (root / 'SKILL.md').exists() else sorted(d for d in root.iterdir() if (d / 'SKILL.md').exists())
    total = 0
    for s in skills:
        lines, dlen, issues = check(s); n = sum(1 for i in issues if not i.startswith('('))
        total += n; print(f'{s.name:30} строк {lines:4}  описание {dlen:4}  нарушений {n}')
        for i in issues: print('   ·', i)
    print(f'\nСкиллов: {len(skills)}, нарушений: {total}')
