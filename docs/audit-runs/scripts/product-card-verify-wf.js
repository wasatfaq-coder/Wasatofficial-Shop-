export const meta = {
  name: 'product-card-verify',
  description: 'Проверка групп аудита карточки товара, не выполненная из-за лимита: три линзы («код», «владелец», «воспроизведение») на каждую группу; только чтение',
  whenToUse: 'Продолжение wf_34478ab5-101 после лимита; записи групп — в docs/audit-runs/product-card-verify-input.json',
  phases: [{ title: 'Проверка', detail: 'каждая группа тремя линзами; неполно при менее двух голосах, отброшено при двух опровержениях' }],
}

const S_VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['подтверждено', 'опровергнуто', 'уточнено'] }, severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, reason: { type: 'string' } }, required: ['verdict', 'severity', 'reason'] }

const LENSES = {
  код: 'Проверь по коду: открой файлы и строку, пройди путь выполнения от кнопки или поля до проблемы. Подтверждено, если проблема есть как описано; опровергнуто, если код делает иначе или путь недостижим.',
  владелец: 'Проверь, важна ли это проблема владельцу, который заводит товар на телефоне. Сверься с решениями владельца (CLAUDE.md, docs/*) и правилами магазина. Если это сознательное решение, зафиксированное в документах, или вкус без последствий для владельца и покупателя, верни опровергнуто.',
  воспроизведение: 'Опиши точные шаги владельца и то, что он увидит или не сможет сделать. Если подтвердить можно только отрисовкой в браузере, верни уточнено и в reason напиши, что именно проверить в браузере. Опровергнуто только если по коду шаги невозможны.',
}

const verifyPrompt = (id, lens) => 'Проверка находки аудита формы товара Wasat Shop. Только чтение, код не менять. Линза: ' + lens + '. ' + LENSES[lens] + '\n'
  + 'Запись группы: id = ' + id + ' в файле ' + args.file + ' (поля title, file, line, what_happens, owner_impact, evidence, proposed_fix, severity). Прочитай запись из этого файла, затем открой указанный файл и строку.\n'
  + 'Верни verdict, свою severity (P0–P3) и reason с цитатой или шагами. Отвечай по-русски.'

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
