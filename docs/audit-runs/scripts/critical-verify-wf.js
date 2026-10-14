export const meta = {
  name: 'critical-verify',
  description: 'Досрочная проверка находок критического аудита, оборванной лимитом: две линзы («код», «владелец») на каждую группу; только чтение',
  whenToUse: 'Продолжение wf_00712200-5ff после лимита; записи находок — в docs/audit-runs/critical-verify-input.json',
  phases: [{ title: 'Проверка', detail: 'каждая находка двумя линзами; спорно при одном опровержении, отброшено при двух, неполно при менее двух голосах' }],
}

const S_VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['подтверждено', 'опровергнуто', 'уточнено'] }, severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, reason: { type: 'string' } }, required: ['verdict', 'severity', 'reason'] }

const LEVEL_BY_AREA = {
  silent: 'Уровни P0 и P1 (как в исходном аудите).',
  react: 'Уровни P0 и P1 (как в исходном аудите).',
  data: 'Уровни P0 и P1 (как в исходном аудите).',
  product: 'Уровни P0 и P1 (как в исходном аудите).',
  a11y: 'Уровни P1 (блокер WCAG AA) и P2 (неудобство на 390 px). P0 и P3 не назначать.',
  'neu-rules': 'Уровни P2 и P3. P0 и P1 не назначать: это другая область.',
}

const LENSES = {
  код: 'Открой файл и строку, пройди путь от действия владельца или покупателя до проблемы. Подтверждено, если путь реален; опровергнуто, если код делает иначе или путь недостижим.',
  владелец: 'Оцени, важна ли проблема владельцу и покупателю, с учётом решений в CLAUDE.md и docs/. Если это осознанное решение, зафиксированное в документах, опровергнуто. Если проблема реальна, но мелкая, понизь severity.',
}

const areaOf = (id) => id.replace(/-\d+$/, '')

const verifyPrompt = (id, lens) => 'Проверка находки критического аудита Wasat Shop. Только чтение, код не менять. Линза: ' + lens + '. ' + LENSES[lens] + '\n'
  + 'Запись находки: id = ' + id + ' в файле ' + args.file + ' (поля title, file, line, what_happens, owner_impact, evidence, proposed_fix, severity). Прочитай запись из этого файла, затем открой указанный файл и строку.\n'
  + (LEVEL_BY_AREA[areaOf(id)] || '') + '\n'
  + 'Верни verdict, свою severity и reason с цитатой или шагами. Отвечай по-русски.'

phase('Проверка')
const checked = await pipeline(args.ids, async (id) => {
  const votes = await parallel(Object.keys(LENSES).map(l => () => {
    const opts = { label: 'проверка:' + l + ':' + id, phase: 'Проверка', schema: S_VERDICT, model: 'opus' }
    if (l === 'код') opts.agentType = 'ecc:code-reviewer'
    return agent(verifyPrompt(id, l), opts)
  }))
  const vs = votes.filter(Boolean)
  const refute = vs.filter(v => v.verdict === 'опровергнуто').length
  const sevCount = {}
  vs.forEach(v => { sevCount[v.severity] = (sevCount[v.severity] || 0) + 1 })
  const severity = Object.keys(sevCount).sort((a, b) => sevCount[b] - sevCount[a])[0] || null
  const status = vs.length < 2 ? 'неполно' : refute === 0 ? 'выжило' : refute === 1 ? 'спорно' : 'отброшено'
  return { id: id, status: status, severity: severity, votes: vs.map(v => ({ verdict: v.verdict, severity: v.severity, reason: v.reason })) }
})
return checked
