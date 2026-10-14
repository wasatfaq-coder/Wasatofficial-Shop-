export const meta = {
  name: 'product-card-gaps',
  description: 'Критик полноты аудита карточки товара и зонды по пробелам (до 6), каждая находка зонда тремя линзами; только чтение',
  whenToUse: 'Продолжение wf_34478ab5-101 после проверки групп; карта формы — docs/audit-runs/product-card-formmap.md',
  phases: [{ title: 'Критик', detail: 'поиск пробелов в покрытии аудита' }, { title: 'Зонды', detail: 'до 6 пробелов, находки проверяются тремя линзами' }],
}

const S_FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, kind: { type: 'string', enum: ['ошибка', 'ux', 'доступность', 'функция', 'текст', 'данные'] }, file: { type: 'string' }, line: { type: 'integer' }, what_happens: { type: 'string' }, owner_impact: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, proposed_fix: { type: 'string' }, needs_browser: { type: 'boolean' } }, required: ['title', 'kind', 'file', 'what_happens', 'owner_impact', 'evidence', 'severity', 'proposed_fix', 'needs_browser'] } } }, required: ['findings'] }
const S_VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['подтверждено', 'опровергнуто', 'уточнено'] }, severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, reason: { type: 'string' } }, required: ['verdict', 'severity', 'reason'] }
const S_CRIT = { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { area: { type: 'string' }, why: { type: 'string' }, probe: { type: 'string' } }, required: ['area', 'probe'] } }, unverified: { type: 'array', items: { type: 'string' } } }, required: ['gaps', 'unverified'] }

const LENSES = {
  код: 'Проверь по коду: открой файлы и строку, пройди путь выполнения от кнопки или поля до проблемы. Подтверждено, если проблема есть как описано; опровергнуто, если код делает иначе или путь недостижим.',
  владелец: 'Проверь, важна ли это проблема владельцу, который заводит товар на телефоне. Сверься с решениями владельца (CLAUDE.md, docs/*) и правилами магазина. Если это сознательное решение, зафиксированное в документах, или вкус без последствий для владельца и покупателя, верни опровергнуто.',
  воспроизведение: 'Опиши точные шаги владельца и то, что он увидит или не сможет сделать. Если подтвердить можно только отрисовкой в браузере, верни уточнено и в reason напиши, что именно проверить в браузере. Опровергнуто только если по коду шаги невозможны.',
}

const RULES = 'Правила проекта (CLAUDE.md уже в контексте): телефон 390 и 320 px, WCAG AA, покупателю не показываются выдуманные данные, подсказки AdminHint, ConfirmDialog при удалении, persist-тосты, несохранённые правки, useDialogA11y, классы lg: для 1024 px и шире.'

const criticPrompt = () => 'Критик полноты аудита формы товара Wasat Shop. Только чтение, код не менять.\n'
  + 'Карта формы (фаза «Карта»): файл ' + args.mapFile + '. Группы карты — ' + args.areas.join('; ') + '. Измерения — ' + args.dims.join('; ') + '. Источники требований — покупатель, документы владельца, отраслевой минимум. Итог: ' + args.counts + '.\n'
  + 'Найди, что НЕ покрыто: экраны и потоки, которых нет в картах (копирование товара, восстановление после ошибки, работа с клавиатуры числовых полей, загрузка фото с телефона, поведение на 320 px, связь формы с CSV-импортом, предпросмотр карточки как у покупателя), измерения, которые не проверены, и утверждения, которые опираются только на предположение. Для каждого пробела дай probe: точный вопрос аудитору (что открыть и что проверить). Не больше 6 пробелов. Отвечай по-русски.'

const probePrompt = (p) => 'Аудитор UI/UX и функций раздела создания карточки товара в админке Wasat Shop. Только чтение, код не менять.\n'
  + 'Пробел аудита: ' + p.area + '. Вопрос: ' + p.probe + '\n'
  + 'Карта формы (фаза «Карта»): файл ' + args.mapFile + ' (прочитай его целиком).\n'
  + RULES + '\n'
  + 'Найди до 12 реальных проблем. Для каждой: title, kind (ошибка, ux, доступность, функция, текст, данные), file и line, what_happens, owner_impact (по-русски и коротко), evidence (цитата кода или точная ссылка на поле из карты), severity (P0–P3), proposed_fix, needs_browser. Не придумывай проблем ради количества: если пробел пустой, верни пустой список. Отвечай по-русски.'

const verifyPrompt = (f, lens) => 'Проверка находки аудита формы товара. Линза: ' + lens + '. ' + LENSES[lens] + '\n'
  + 'Находка: ' + f.title + '\nФайл: ' + f.file + (f.line ? ':' + f.line : '') + '\nЧто происходит: ' + f.what_happens + '\nДля владельца: ' + f.owner_impact + '\nДоказательство: ' + f.evidence + '\nПредлагаемая серьёзность: ' + f.severity + '\n'
  + 'Верни verdict, свою severity (P0–P3) и reason с цитатой или шагами. Отвечай по-русски.'

phase('Критик')
const crit = await agent(criticPrompt(), { label: 'критик полноты', phase: 'Критик', schema: S_CRIT, model: 'haiku' })
const probes = crit ? crit.gaps.slice(0, 6) : []
if (crit && crit.gaps.length > 6) log('Критик предложил ' + crit.gaps.length + ' пробелов; взяты первые 6: ' + crit.gaps.slice(6).map(g => g.area).join('; '))

phase('Зонды')
const probeRes = await parallel(probes.map((p, i) => () => agent(probePrompt(p), { label: 'зонд:' + (i + 1), phase: 'Зонды', schema: S_FIND, model: 'haiku' })))
const probeFindings = []
probeRes.forEach((r, i) => {
  if (!r) { log('ПОТЕРЯНО: зонд ' + (i + 1) + ' не вернул результат'); return }
  r.findings.forEach((f, fi) => probeFindings.push(Object.assign({}, f, { id: 'P' + (i + 1) + '-' + (fi + 1), dimension: 'Пробел аудита: ' + probes[i].area })))
})

const checked = await pipeline(probeFindings, async (f) => {
  const votes = await parallel(Object.keys(LENSES).map(l => () => agent(verifyPrompt(f, l), { label: 'проверка-зонд:' + l + ':' + f.id, phase: 'Зонды', schema: S_VERDICT, model: 'haiku' })))
  const vs = votes.filter(Boolean)
  const refute = vs.filter(v => v.verdict === 'опровергнуто').length
  const status = vs.length < 2 ? 'неполно' : refute === 0 ? 'выжило' : refute === 1 ? 'спорно' : 'отброшено'
  return { id: f.id, dimension: f.dimension, title: f.title, kind: f.kind, file: f.file, line: f.line, what_happens: f.what_happens, owner_impact: f.owner_impact, proposed_fix: f.proposed_fix, severity: f.severity, status: status, votes: vs.map(v => ({ verdict: v.verdict, severity: v.severity, reason: v.reason })) }
})

return { critic: crit, probes: probes, probe_findings_raw: probeFindings.length, checked: checked }
