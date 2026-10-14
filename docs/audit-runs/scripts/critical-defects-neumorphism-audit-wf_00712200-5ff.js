export const meta = {
  name: 'critical-defects-neumorphism-audit',
  description: 'Расширенный аудит критических дефектов кода (ECC-агенты по областям) и проверка соответствия неоморфизму и WCAG AA; только чтение, каждая находка проверяется двумя линзами',
  whenToUse: 'Перед релизом или после крупных правок; только чтение, код не меняет',
  phases: [
    { title: 'Поиск', detail: '6 областей критических дефектов: профильные ECC-агенты' },
    { title: 'Неоморфизм', detail: 'правила классов и доступность поверхностей neu-*' },
    { title: 'Дедупликация', detail: 'одна сводка по всем находкам' },
    { title: 'Проверка', detail: 'каждая находка двумя линзами; спорно при одном опровержении, отброшено при двух' },
  ],
}

const S_FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, kind: { type: 'string', enum: ['ошибка', 'безопасность', 'данные', 'доступность', 'дизайн'] }, file: { type: 'string' }, line: { type: 'integer' }, what_happens: { type: 'string' }, owner_impact: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, proposed_fix: { type: 'string' }, needs_browser: { type: 'boolean' } }, required: ['title', 'kind', 'file', 'what_happens', 'owner_impact', 'evidence', 'severity', 'proposed_fix', 'needs_browser'] } } }, required: ['findings'] }
const S_VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['подтверждено', 'опровергнуто', 'уточнено'] }, severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, reason: { type: 'string' } }, required: ['verdict', 'severity', 'reason'] }
const S_DEDUP = { type: 'object', properties: { groups: { type: 'array', items: { type: 'object', properties: { keep: { type: 'string' }, merge: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } }, required: ['keep', 'merge'] } } }, required: ['groups'] }

const NEU_RULES = 'Правила неоморфизма (CLAUDE.md, разделы «Стили и цвета» и «Окна и выпадающие списки»): классы neu-* объявлены вне слоёв и перебивают утилиты, поэтому рядом с neu-* не должно быть shadow-*, bg-*, hover:bg-*, active:scale-*; цветная подложка статуса — элемент без neu-* (bg-danger-soft border); одна neu-button-accent на экран; удаление — neu-button-danger и ConfirmDialog; neu-button только у нажимаемого, статичное — neu-flat или neu-flat-sm; выбранный вариант вдавлен (neu-pill-active), невыбранный выпуклый; disabled — neu-button-disabled, не вдавленный; статусы только токенами success, warning, danger и их *-soft, не emerald, rose, amber, sky, slate, gray; хексы в классах не писать (палитра в @theme); заголовки font-bold или font-extrabold, font-black не работает; текст не мельче text-[11px], абзацы от text-xs; окна через ModalPortal и useDialogA11y, свой обработчик Escape не писать; вместо нативного select — NeumorphicSelect. Неоморфизм не обязателен (решение владельца 07.10): плоский элемент с обводкой допустим, если причина записана в коде или в PR. Плоский элемент без причины — находка P3.'

const AREAS = [
  { key: 'orders', phase: 'Поиск', agent: 'ecc:code-reviewer', levels: 'critical', title: 'Заказы, суммы и склад', files: 'src/shared/ (orderPricing.ts, orderApi.ts, orderLine.ts, packLines.ts, wholesalePricing.ts, sizePacks.ts), src/utils/inventory.ts, src/app/useCheckout.ts, src/app/useCart.ts, functions/ (без node_modules)', focus: 'сумма в браузере и на сервере расходится; списание склада не транзакцией или без записи в stock_movements; заказ записан частично; снятый или удалённый товар попадает в заказ; деление цены ростовки и скидка за объём; промокод считает не те строки' },
  { key: 'security', phase: 'Поиск', agent: 'ecc:security-reviewer', levels: 'critical', title: 'Права доступа, правила, секреты', files: 'firestore.rules, src/firebase.ts, src/context/AuthContext.tsx, src/utils/firebaseSync.ts, src/app/useAccountData.ts, src/app/useAdminActions.ts, index.html, public/', focus: 'правила пускают запись не тому (чужой заказ, профиль, отзыв, товар с полем себестоимости или закупки); права администратора проверяются только в клиенте; себестоимость, закупка или ключи в публичных документах и в коде; пользовательский текст вставляется как разметка (dangerouslySetInnerHTML, innerHTML); ссылки без проверки схемы' },
  { key: 'silent', phase: 'Поиск', agent: 'ecc:silent-failure-hunter', levels: 'critical', title: 'Молчаливые сбои', files: 'src/utils/firebaseSync.ts, src/utils/firestoreErrors.ts, src/utils/errorReporter.ts, src/utils/loadFailures.ts, src/app/ (useToasts, useCheckout, useCustomerOrders, useProfile)', focus: 'ошибка записи, о которой не узнаёт владелец или покупатель; «Сохранено» показано до ответа базы; пустой catch или catch без пути для пользователя; подписка упала, а экран выглядит пустым' },
  { key: 'react', phase: 'Поиск', agent: 'ecc:react-reviewer', levels: 'critical', title: 'Хуки и состояние React', files: 'src/App.tsx, src/app/, src/views/, src/components/admin/', focus: 'подписка без отписки; устаревшее замыкание в обработчике, который пишет в базу; setState во время рендера; эффект, который меняет состояние без конца; ключи списков, из-за которых теряется введённое' },
  { key: 'data', phase: 'Поиск', agent: 'ecc:typescript-reviewer', levels: 'critical', title: 'Данные на границах', files: 'src/utils/ (особенно cartStorage.ts, guestOrders.ts, csvHelpers.ts, sizeChart.ts, productShipping.ts), src/shared/', focus: 'разбор localStorage и JSON без try/catch: одна битая запись ломает экран; данные из базы или CSV принимаются без проверки типа и диапазона (отрицательная цена, NaN, пустой id); приведение типов и утверждения non-null там, где значения может не быть' },
  { key: 'product', phase: 'Поиск', agent: 'ecc:code-reviewer', levels: 'critical', title: 'Форма товара: потеря данных', files: 'src/components/admin/products/, src/components/admin/AdminProductsTab.tsx, src/utils/productPhotos.ts, src/utils/productPreviews.ts', focus: 'частичная запись (фото без товара, превью без фото); удаление фото до записи товара; ошибка записи, после которой введённое теряется; копия товара делит документы; проверка пропускает пустую цену, дубликат артикула или штрихкода' },
  { key: 'neu-rules', phase: 'Неоморфизм', agent: 'ecc:code-reviewer', levels: 'neu', title: 'Неоморфизм: правила классов', files: 'src/index.css, src/components/, src/views/', focus: NEU_RULES },
  { key: 'a11y', phase: 'Неоморфизм', agent: 'ecc:a11y-architect', levels: 'access', title: 'Неоморфизм: контраст, нажатие, фокус', files: 'src/index.css, src/components/, src/views/', focus: 'контраст текста и подписей на неоморфных поверхностях (токены --neu-* и цвета текста в index.css, WCAG AA 4.5:1); фокус виден (:focus-visible не отключён); зона нажатия не меньше 24 px, частые действия покупателя 32 px; у переключателей и выбора верные role и aria-checked; disabled читается не только прозрачностью; окна с useDialogA11y' },
]

const LEVELS = {
  critical: 'Нужны уровни P0 (теряются деньги, данные или доступ; покупатель не может оформить заказ) и P1 (сбой, неверная цена или остаток, владелец или покупатель не видит проблему). P2 и P3 не пиши.',
  access: 'Нужны уровни P1 (блокер WCAG AA: экранный чтец или клавиатура не могут выполнить действие, контраст текста ниже 4.5:1, нажатие меньше 24 px) и P2 (неудобство на 390 px). P0 и P3 не пиши.',
  neu: 'Нужны уровни P2 (правило неоморфизма нарушено и меняет вид или читаемость) и P3 (косметика, плоский элемент без причины). P0 и P1 не пиши: это другая область.',
}

const LENSES = {
  код: 'Открой файл и строку, пройди путь от действия владельца или покупателя до проблемы. Подтверждено, если путь реален; опровергнуто, если код делает иначе или путь недостижим.',
  владелец: 'Оцени, важна ли проблема владельцу и покупателю, с учётом решений в CLAUDE.md и docs/. Если это осознанное решение, зафиксированное в документах, опровергнуто. Если проблема реальна, но мелкая, понизь severity.',
}

const finderPrompt = (a) => 'Аудит Wasat Shop (интернет-магазин мужской одежды, React 19, Firebase). Только чтение, код не менять.\n'
  + 'Область: ' + a.title + '. Файлы: ' + a.files + '.\n'
  + 'На что смотреть: ' + a.focus + '.\n'
  + LEVELS[a.levels] + '\n'
  + 'Для каждой находки: title, kind, file и line, what_happens (что видит владелец или покупатель), owner_impact (коротко, по-русски), evidence (цитата кода), severity, proposed_fix, needs_browser (true только если видно на экране). Не придумывай проблем ради количества: если область чистая, верни пустой список. Отвечай по-русски.'

const dedupPrompt = (items) => 'Сведи находки аудита. Каждая строка: id | область | серьёзность | заголовок | файл.\n'
  + items.map(f => f.id + ' | ' + f.dimension + ' | ' + f.severity + ' | ' + f.title + ' | ' + f.file + (f.line ? ':' + f.line : '')).join('\n') + '\n'
  + 'Объедини дубликаты: одна и та же проблема в разных областях или файлах. Для каждой группы: keep (id лучшей формулировки), merge (id, которые ей равны, может быть пустым), reason. Разные проблемы не объединяй. Каждый id попадает ровно в одну группу. Одиночные — группа с пустым merge.'

const verifyPrompt = (f, lens) => 'Проверка находки аудита Wasat Shop. Линза: ' + lens + '. ' + LENSES[lens] + '\n'
  + 'Находка: ' + f.title + '\nФайл: ' + f.file + (f.line ? ':' + f.line : '') + '\nЧто происходит: ' + f.what_happens + '\nДля владельца: ' + f.owner_impact + '\nДоказательство: ' + f.evidence + '\nПредлагаемая серьёзность: ' + f.severity + '\n'
  + 'Верни verdict, свою severity (P0–P3) и reason с цитатой или шагами. Отвечай по-русски.'

// ---------- Поиск и неоморфизм ----------
phase('Поиск')
const areaRes = await parallel(AREAS.map(a => () => agent(finderPrompt(a), { label: 'поиск:' + a.key, phase: a.phase, schema: S_FIND, model: 'opus', agentType: a.agent })))
const raw = []
areaRes.forEach((r, i) => {
  const a = AREAS[i]
  if (!r) { log('ПОТЕРЯНО: область ' + a.key + ' не вернула результат'); return }
  r.findings.forEach((f, fi) => raw.push(Object.assign({}, f, { id: a.key + '-' + (fi + 1), dimension: a.title })))
})
log('Находок сырых: ' + raw.length + ' из ' + AREAS.length + ' областей')

// ---------- Дедупликация ----------
phase('Дедупликация')
const byId = {}
raw.forEach(f => { byId[f.id] = f })
const dd = raw.length ? await agent(dedupPrompt(raw), { label: 'дедупликация', phase: 'Дедупликация', schema: S_DEDUP, model: 'haiku' }) : { groups: [] }
const placed = new Set()
const groups = []
if (dd) {
  dd.groups.forEach(g => {
    if (!byId[g.keep] || placed.has(g.keep)) return
    placed.add(g.keep)
    const merged = g.merge.filter(id => byId[id] && !placed.has(id))
    merged.forEach(id => placed.add(id))
    groups.push({ f: byId[g.keep], merged: merged })
  })
} else {
  log('ПОТЕРЯНО: дедупликация не вернула результат; каждая находка проверяется отдельно')
}
raw.forEach(f => { if (!placed.has(f.id)) { placed.add(f.id); groups.push({ f: f, merged: [] }) } })
const rank = { P0: 0, P1: 1, P2: 2, P3: 3 }
groups.sort((x, y) => rank[x.f.severity] - rank[y.f.severity])
log('После дедупликации: ' + groups.length + ' групп')

// ---------- Проверка ----------
const CHECK_CAP = 20
const toCheck = groups.slice(0, CHECK_CAP)
const notChecked = groups.slice(CHECK_CAP)
if (notChecked.length) log('Не проверено (лимит ' + CHECK_CAP + ' групп, отсечены самые мелкие): ' + notChecked.map(g => g.f.id + ' ' + g.f.severity + ' ' + g.f.title).join('; '))

phase('Проверка')
const checked = await pipeline(toCheck, async (g) => {
  const votes = await parallel(Object.keys(LENSES).map(l => () => {
    const opts = { label: 'проверка:' + l + ':' + g.f.id, phase: 'Проверка', schema: S_VERDICT, model: 'opus' }
    if (l === 'код') opts.agentType = 'ecc:code-reviewer'
    return agent(verifyPrompt(g.f, l), opts)
  }))
  const vs = votes.filter(Boolean)
  const refute = vs.filter(v => v.verdict === 'опровергнуто').length
  const sevCount = {}
  vs.forEach(v => { sevCount[v.severity] = (sevCount[v.severity] || 0) + 1 })
  const sevTop = Object.keys(sevCount).sort((a, b) => sevCount[b] - sevCount[a])[0] || g.f.severity
  const status = vs.length < 2 ? 'неполно' : refute === 0 ? 'выжило' : refute === 1 ? 'спорно' : 'отброшено'
  return { id: g.f.id, dimension: g.f.dimension, title: g.f.title, kind: g.f.kind, file: g.f.file, line: g.f.line, what_happens: g.f.what_happens, owner_impact: g.f.owner_impact, proposed_fix: g.f.proposed_fix, merged: g.merged, severity: sevTop, status: status, verdicts: vs.map(v => v.verdict + ' (' + v.severity + '): ' + v.reason) }
})
const ok = checked.filter(Boolean)
const lost = checked.filter(x => !x).length
if (lost) log('ПОТЕРЯНО в проверке: ' + lost + ' групп')
const survivors = ok.filter(x => x.status === 'выжило')
const disputed = ok.filter(x => x.status === 'спорно')
const incomplete = ok.filter(x => x.status === 'неполно')
const rejected = ok.filter(x => x.status === 'отброшено')
log('Проверка: выжило ' + survivors.length + ', спорно ' + disputed.length + ', неполно ' + incomplete.length + ', отброшено ' + rejected.length)

return {
  areas: AREAS.map((a, i) => ({ key: a.key, title: a.title, agent: a.agent, findings: areaRes[i] ? areaRes[i].findings.length : null })),
  survivors: survivors,
  disputed: disputed,
  incomplete: incomplete,
  rejected: rejected,
  not_checked: notChecked.map(g => ({ id: g.f.id, severity: g.f.severity, title: g.f.title })),
  counts: { сырых: raw.length, групп: groups.length, проверено: toCheck.length, выжило: survivors.length, спорно: disputed.length, отброшено: rejected.length, не_проверено: notChecked.length },
}
