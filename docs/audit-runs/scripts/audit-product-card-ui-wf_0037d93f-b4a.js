export const meta = {
  name: 'audit-product-card-ui',
  description: 'Аудит UI/UX и функций раздела создания карточки товара в админке Wasat Shop: карта полей, требования, поиск по 9 измерениям, дедупликация, проверка тремя линзами, критик полноты',
  whenToUse: 'Аудит формы товара перед правками; только чтение кода',
  phases: [
    { title: 'Карта', detail: 'поля, блоки и потоки формы по 5 группам файлов' },
    { title: 'Требования', detail: 'что нужно карточке: покупатель, документы владельца, отраслевой минимум' },
    { title: 'Поиск', detail: '9 измерений UI/UX и функций' },
    { title: 'Дедупликация', detail: 'одна сводка по всем находкам' },
    { title: 'Проверка', detail: 'каждая находка тремя линзами; отбрасываем при двух опровержениях' },
    { title: 'Пробелы', detail: 'критик полноты и дополнительные зонды' },
  ],
}

const S_FIELD = { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, block: { type: 'string' }, control: { type: 'string' }, required: { type: 'string' }, default: { type: 'string' }, validation: { type: 'string' }, saved_to: { type: 'string' }, hint: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' } }, required: ['id', 'label', 'block', 'control', 'file'] }
const S_MAP = { type: 'object', properties: { area: { type: 'string' }, fields: { type: 'array', items: S_FIELD }, flows: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } }, dead_ends: { type: 'array', items: { type: 'string' } } }, required: ['name', 'steps'] } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['area', 'fields', 'flows'] }
const S_REQ = { type: 'object', properties: { requirements: { type: 'array', items: { type: 'object', properties: { need: { type: 'string' }, source: { type: 'string' }, source_kind: { type: 'string', enum: ['код', 'документ', 'отрасль'] }, present_in_form: { type: 'string', enum: ['да', 'частично', 'нет'] }, form_where: { type: 'string' }, evidence: { type: 'string' } }, required: ['need', 'source', 'source_kind', 'present_in_form'] } } }, required: ['requirements'] }
const S_FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, kind: { type: 'string', enum: ['ошибка', 'ux', 'доступность', 'функция', 'текст', 'данные'] }, file: { type: 'string' }, line: { type: 'integer' }, what_happens: { type: 'string' }, owner_impact: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, proposed_fix: { type: 'string' }, needs_browser: { type: 'boolean' } }, required: ['title', 'kind', 'file', 'what_happens', 'owner_impact', 'evidence', 'severity', 'proposed_fix', 'needs_browser'] } } }, required: ['findings'] }
const S_VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['подтверждено', 'опровергнуто', 'уточнено'] }, severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, reason: { type: 'string' } }, required: ['verdict', 'severity', 'reason'] }
const S_DEDUP = { type: 'object', properties: { groups: { type: 'array', items: { type: 'object', properties: { keep: { type: 'string' }, merge: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } }, required: ['keep', 'merge'] } } }, required: ['groups'] }
const S_CRIT = { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { area: { type: 'string' }, why: { type: 'string' }, probe: { type: 'string' } }, required: ['area', 'probe'] } }, unverified: { type: 'array', items: { type: 'string' } } }, required: ['gaps', 'unverified'] }

const MAP_GROUPS = [
  { key: 'shell', title: 'Оболочка и поток', files: ['src/components/admin/products/ProductFormModal.tsx', 'src/components/admin/products/ProductFormBlock.tsx', 'src/components/admin/products/useProductForm.tsx', 'src/components/admin/AdminProductsTab.tsx', 'src/components/admin/products/ProductInspectModal.tsx', 'src/components/admin/AdminHint.tsx'] },
  { key: 'variants', title: 'Варианты, остатки, ростовки, размерная сетка', files: ['src/components/admin/products/ProductFormVariants.tsx', 'src/components/admin/products/ProductFormSizePacks.tsx', 'src/components/admin/products/ProductFormSizeChart.tsx', 'src/utils/sizeChart.ts', 'src/utils/sizeChartEditing.ts', 'src/utils/colorCode.ts', 'src/utils/colorPhotos.ts', 'src/utils/sizePackEditing.ts', 'src/utils/inventory.ts', 'src/shared/barcode.ts', 'src/utils/russianSizeTable.ts', 'src/utils/sizeScale.ts'] },
  { key: 'commerce', title: 'Цены, закупка, опт, поставщик, доставка', files: ['src/components/admin/products/ProductFormPrices.tsx', 'src/components/admin/products/ProductFormWholesale.tsx', 'src/components/admin/products/ProductFormSupplier.tsx', 'src/components/admin/products/ProductFormShipping.tsx', 'src/utils/currencyPricing.ts', 'src/utils/productCosts.ts', 'src/utils/wholesaleEditing.ts', 'src/utils/productShipping.ts', 'src/shared/wholesalePricing.ts', 'src/shared/sizePacks.ts'] },
  { key: 'card', title: 'Описание и структура карточки', files: ['src/components/admin/AdminProductCardStructure.tsx', 'src/utils/productAttributes.ts', 'src/utils/cardSuggestions.ts', 'src/utils/careSymbols.ts', 'src/utils/descriptionDraft.ts'] },
  { key: 'media', title: 'Фото, импорт CSV, лимит данных', files: ['src/components/admin/products/ProductFormGallery.tsx', 'src/components/admin/products/ProductCsvImportModal.tsx', 'src/utils/csvHelpers.ts', 'src/utils/sizePackCsv.ts', 'src/utils/productPhotos.ts', 'src/utils/productPreviews.ts', 'src/utils/productThumbs.ts', 'src/utils/useProductPhotos.ts', 'src/utils/productSize.ts'] },
]

const DIMS = [
  { key: 'D1', name: 'Структура и порядок блоков', q: 'Логичен ли порядок блоков для заведения товара на телефоне? Видны ли главные поля (название, цена, фото, цвета, размеры) без лишнего прокручивания? Понятно ли, что делать дальше, какие блоки закрыты и почему? Есть ли тупики, где владелец не понимает, что уже сделано?' },
  { key: 'D2', name: 'Проверка, ошибки и обратная связь', q: 'Работает ли проверка перед сохранением: список ошибок, aria-invalid, фокус на первой ошибке? Что происходит при ошибке записи в базу, при частичной записи (фото до товара)? Теряется ли введённое? Защищено ли от двойного нажатия? Принимаются ли пустые, отрицательные, нечисловые значения в ценах и остатках? Есть ли проверка дублей артикулов и штрихкодов?' },
  { key: 'D3', name: 'Мобильная раскладка 390 и 320 px', q: 'Ширины полей, перекрытие закреплённой нижней панели, модальное окно выше экрана и его прокрутка, длинные ряды чипов и бейджей, кнопки меньше 24–32 px, горизонтальная прокрутка, клавиатура, закрывающая поля, inputMode и autoComplete для цен и телефонов. Обязательно проверь по коду классы адаптивной раскладки (sm:, lg:).' },
  { key: 'D4', name: 'Компьютер 1280 px', q: 'Используется ли ширина экрана (классы lg:) или окно растянуто на одну узкую колонку? Есть ли sticky-панель действий, вложенная прокрутка, пустые зоны, неоправданная длина формы? Удобно ли сравнивать и править варианты на широком экране?' },
  { key: 'D5', name: 'Доступность', q: 'Связаны ли подписи с полями (htmlFor, aria-describedby), для выбора сделаны role=radio/radiogroup или aria-pressed, у кнопок без текста есть aria-label, имена цветов озвучиваются, ошибки и успех объявляются (role=alert, live-регион), работает ли Enter и порядок Tab, клавиатурный доступ к изменению порядка фото и вариантов, фокус в окне (useDialogA11y).' },
  { key: 'D6', name: 'Тексты и подсказки', q: 'Понятен ли русский текст владельцу без знания жаргона (SKU, бейдж, ростовка, предзаказ, закупка, наценка, CSV)? Совпадают ли подсказки AdminHint с поведением (docs/admin-wholesale/hints.md)? Есть ли единицы измерения (г/м², см, ₽), подписи вместо плейсхолдеров, одинаковые слова для разных действий, неправильные или устаревшие подсказки?' },
  { key: 'D7', name: 'Состояние данных и сохранение', q: 'Предупреждение о несохранённых правках при закрытии и при смене блока; сохраняются ли введённые данные при ошибке загрузки фото; что делает копия товара (фото, артикулы, остатки, id); что видит владелец после сохранения; лимит объёма (счётчик) и поведение при превышении; согласованность полей после правки цвета или размера.' },
  { key: 'D8', name: 'Пустые состояния и значения по умолчанию', q: 'Что предзаполнено и откуда (не выдуманы ли значения, которые покупатель увидит)? Что происходит при пустом списке цветов, размеров, фото, категорий? Понятно ли, что статус товара по умолчанию (в продаже или скрыт)? Разрешены ли нулевые или пустые цены, которые попадут на витрину?' },
  { key: 'D9', name: 'Скорость заведения типового товара', q: 'Сколько шагов и нажатий нужно для типового товара (4 фото, 3 цвета, 5 размеров, размерная сетка, описание)? Есть ли повторный ввод одного и того же (например, «применить ко всем цветам», копирование цены и состава)? Есть ли быстрый путь через CSV и через копию? Сверь с обещаниями docs/fast-product-entry-spec.md.' },
]

const LENSES = {
  код: 'Проверь по коду: открой файлы и строку, пройди путь выполнения от кнопки или поля до проблемы. Подтверждено, если проблема есть как описано; опровергнуто, если код делает иначе или путь недостижим.',
  владелец: 'Проверь, важна ли это проблема владельцу, который заводит товар на телефоне. Сверься с решениями владельца (CLAUDE.md, docs/*) и правилами магазина. Если это сознательное решение, зафиксированное в документах, или вкус без последствий для владельца и покупателя, верни опровергнуто.',
  воспроизведение: 'Опиши точные шаги владельца и то, что он увидит или не сможет сделать. Если подтвердить можно только отрисовкой в браузере, верни уточнено и в reason напиши, что именно проверить в браузере. Опровергнуто только если по коду шаги невозможны.',
}

const fmtField = f => f.id + ' | ' + f.block + ' | ' + f.label + ' | ' + f.control + ' | обяз:' + (f.required || '-') + ' | правило:' + (f.validation || '-') + ' | сохраняется:' + (f.saved_to || '-') + ' | подсказка:' + (f.hint || '-') + ' | ' + f.file + (f.line ? ':' + f.line : '')
const formText = maps => maps.map(m => '## ' + m.area + '\n' + m.fields.map(fmtField).join('\n') + (m.flows.length ? '\nПотоки:\n' + m.flows.map(x => '- ' + x.name + ': ' + x.steps.join(' → ') + (x.dead_ends && x.dead_ends.length ? ' (тупики: ' + x.dead_ends.join('; ') + ')' : '')).join('\n') : '')).join('\n\n')

const mapPrompt = g => 'Картируешь форму создания и правки товара в админке Wasat Shop. Только чтение, код не менять.\n'
  + 'Группа: ' + g.title + '.\nФайлы: ' + g.files.join(', ') + '.\n'
  + 'Перечисли КАЖДОЕ поле и управление, которое видит владелец в этой группе: id (короткий, латиница), подпись как на экране, блок, тип управления, обязательность, значение по умолчанию, правило проверки, куда сохраняется (поле товара, product_costs, product_photos и т.д.), есть ли подсказка AdminHint (сверься с docs/admin-wholesale/hints.md), файл и строка.\n'
  + 'Затем перечисли потоки: создать товар с нуля, копия товара, импорт CSV, быстрая правка, правка существующего. Для каждого шаги и тупики.\n'
  + 'Не выдумывай: если чего-то нет в коде, не добавляй в fields, а укажи в notes как «нет в коде». Отвечай по-русски.'

const requirementsPrompt = (kind, extra, formMap) => 'Собираешь требования к карточке товара. Только чтение.\n' + extra + '\n'
  + 'Для каждого требования: need (что нужно владельцу или покупателю), source (файл и раздел или элемент, который покупатель видит), source_kind (код, документ или отрасль), present_in_form (да, частично, нет — по карте формы ниже), form_where (блок и подпись поля, если есть), evidence (строка кода или цитата документа).\n'
  + 'Карта формы (фаза «Карта»):\n' + formMap + '\n'
  + 'Отвечай по-русски.'

const BUYER_FILES = 'src/views/ProductDetailScreen.tsx, src/components/ProductCard.tsx, src/components/ProductWholesaleBlock.tsx, src/utils/productAttributes.ts, src/utils/productShipping.ts, src/utils/productBadge.ts, src/utils/sizeChart.ts, src/types.ts'
const OWNER_DOCS = 'docs/fast-product-entry-spec.md, docs/admin-wholesale-plan.md (этапы 4, 11, 14, 15, 18 и «Правки владельца 11.10»), docs/admin-wholesale/hints.md, docs/admin-wholesale/brief.md, docs/owner-requests-2026-10-02-plan.md, docs/wholesale-spec.md, docs/broken-pack-spec.md'

const finderPrompt = (d, formMap, questionOverride) => 'Аудитор UI/UX и функций раздела создания карточки товара в админке Wasat Shop. Только чтение, код не менять.\n'
  + 'Измерение: ' + d.name + '. Вопрос: ' + (questionOverride || d.q) + '\n'
  + 'Карта формы (фаза «Карта»):\n' + formMap + '\n'
  + 'Правила проекта (CLAUDE.md уже в контексте): телефон 390 и 320 px, WCAG AA, покупателю не показываются выдуманные данные, подсказки AdminHint, ConfirmDialog при удалении, persist-тосты, несохранённые правки, useDialogA11y, классы lg: для 1024 px и шире.\n'
  + 'Найди до 12 реальных проблем. Для каждой: title, kind (ошибка, ux, доступность, функция, текст, данные), file и line, what_happens (что делает или видит владелец), owner_impact (почему это плохо для владельца, по-русски и коротко), evidence (цитата кода или точная ссылка на поле из карты), severity (P0: теряется введённое или блокируется создание товара; P1: мешает заводить товар или ошибиться в цене и остатке; P2: неудобно; P3: косметика), proposed_fix, needs_browser (true, если проблему видно только на экране: вёрстка, перекрытие, размер).\n'
  + 'Не придумывай проблем ради количества: если измерение чисто, верни пустой список. Отвечай по-русски.'

const dedupPrompt = (items) => 'Сведи находки аудита формы товара. Каждая строка: id | измерение | серьёзность | заголовок | файл.\n'
  + items.map(f => f.id + ' | ' + f.dimension + ' | ' + f.severity + ' | ' + f.title + ' | ' + f.file + (f.line ? ':' + f.line : '')).join('\n') + '\n'
  + 'Объедини дубликаты: одна и та же проблема в разных измерениях или файлах. Для каждой группы: keep (id лучшей формулировки), merge (id, которые ей равны, может быть пустым), reason. Разные проблемы не объединяй. Каждый id должен попасть ровно в одну группу (keep или merge). Одиночные — группа с пустым merge.'

const verifyPrompt = (f, lens) => 'Проверка находки аудита формы товара. Линза: ' + lens + '. ' + LENSES[lens] + '\n'
  + 'Находка: ' + f.title + '\nФайл: ' + f.file + (f.line ? ':' + f.line : '') + '\nЧто происходит: ' + f.what_happens + '\nДля владельца: ' + f.owner_impact + '\nДоказательство: ' + f.evidence + '\nПредлагаемая серьёзность: ' + f.severity + '\n'
  + 'Верни verdict, свою severity (P0–P3) и reason с цитатой или шагами. Отвечай по-русски.'

const criticPrompt = (areas, dims, counts) => 'Критик полноты аудита формы товара. Только чтение.\n'
  + 'Покрыто: группы карты — ' + areas.join('; ') + '. Измерения — ' + dims.join('; ') + '. Источники требований — покупатель, документы владельца, отраслевой минимум. Итог: ' + counts + '.\n'
  + 'Найди, что НЕ покрыто: экраны и потоки, которых нет в картах (копирование товара, восстановление после ошибки, работа с клавиатуры числовых полей, загрузка фото с телефона, поведение на 320 px, связь формы с CSV-импортом, предпросмотр карточки как у покупателя), измерения, которые не проверены, и утверждения, которые опираются только на предположение. Для каждого пробела дай probe: точный вопрос аудитору (что открыть и что проверить). Не больше 6 пробелов. Отвечай по-русски.'

// ---------- Карта ----------
phase('Карта')
const maps = await parallel(MAP_GROUPS.map(g => () => agent(mapPrompt(g), { label: 'карта:' + g.key, phase: 'Карта', schema: S_MAP })))
const mapOk = maps.filter(Boolean)
const mapFailed = MAP_GROUPS.filter((g, i) => !maps[i]).map(g => g.key)
if (mapFailed.length) log('ПОТЕРЯНО в карте: ' + mapFailed.join(', '))
const fieldTotal = mapOk.reduce((n, m) => n + m.fields.length, 0)
log('Карта: групп ' + mapOk.length + ' из ' + MAP_GROUPS.length + ', полей ' + fieldTotal)
const formMap = formText(mapOk)

// ---------- Требования ----------
phase('Требования')
const reqRaw = await parallel([
  () => agent(requirementsPrompt('покупатель', 'Перечисли, что покупатель видит на карточке товара (название, цены и бейджи, фото и миниатюры, цвета и фото по цвету, размеры и «Ваш размер», размерная сетка, состав, плотность, сертификаты, посадка, страна, уход, вес и габариты, доставка, опт и ростовка, характеристики, описание). Файлы: ' + BUYER_FILES + '. source_kind = код. Отдельно перечисли поля формы, которых покупатель не видит: need начинается с «ЛИШНЕЕ:», present_in_form = да.', formMap), { label: 'требования:покупатель', phase: 'Требования', schema: S_REQ }),
  () => agent(requirementsPrompt('документы', 'Собери требования владельца к карточке товара из документов: ' + OWNER_DOCS + '. source_kind = документ. Если документ отмечает пункт как сделанный, всё равно сверь с картой формы.', formMap), { label: 'требования:документы', phase: 'Требования', schema: S_REQ }),
  () => agent(requirementsPrompt('отрасль', 'Сформулируй типовой набор полей и функций карточки товара для интернет-магазина мужской одежды: малый магазин, один владелец, покупатели из Telegram, VK и Instagram, Россия, закупки в долларах и юанях. Примеры: SEO-заголовок и адрес страницы, статус черновик или опубликован, сезон и коллекция, посадка, состав в процентах, уход, страна, таблица размеров, штрихкод, артикул поставщика, вес и габариты, теги, похожие товары, предпросмотр карточки как у покупателя, журнал изменений, дата публикации. source_kind = отрасль для каждого пункта: это гипотезы для подтверждения владельцем, а не требования магазина.', formMap), { label: 'требования:отрасль', phase: 'Требования', schema: S_REQ }),
])
let reqId = 0
const reqList = reqRaw.filter(Boolean).flatMap(r => r.requirements).map(x => Object.assign({}, x, { id: 'R' + (++reqId) }))
const reqFailed = reqRaw.filter(r => !r).length
if (reqFailed) log('ПОТЕРЯНО в требованиях: ' + reqFailed + ' из 3 групп')
log('Требования: ' + reqList.length + ' (отрасль: ' + reqList.filter(x => x.source_kind === 'отрасль').length + ')')

// ---------- Поиск ----------
phase('Поиск')
const finderRes = await parallel(DIMS.map(d => () => agent(finderPrompt(d, formMap), { label: 'поиск:' + d.key, phase: 'Поиск', schema: S_FIND, model: 'opus' })))
let rawFindings = []
finderRes.forEach((r, di) => {
  if (!r) { log('ПОТЕРЯНО: измерение ' + DIMS[di].key + ' не вернуло результат'); return }
  r.findings.forEach((f, fi) => rawFindings.push(Object.assign({}, f, { id: DIMS[di].key + '-' + (fi + 1), dimension: DIMS[di].name })))
})
log('Поиск: находок ' + rawFindings.length)

const gapFindings = reqList
  .filter(x => x.source_kind !== 'отрасль' && x.present_in_form !== 'да' && !x.need.startsWith('ЛИШНЕЕ'))
  .map((x, i) => ({ id: 'G-' + (i + 1), dimension: 'Функции (требования)', title: 'Нет или частично: ' + x.need, kind: 'функция', file: x.form_where || '—', what_happens: 'Владелец не может ввести: ' + x.need + ' (в форме: ' + x.present_in_form + ')', owner_impact: 'Источник: ' + x.source, evidence: x.evidence || '', severity: 'P2', proposed_fix: 'Добавить поле или функцию', needs_browser: false }))
log('Пробелы функций из требований: ' + gapFindings.length)

// ---------- Дедупликация ----------
phase('Дедупликация')
const allRaw = rawFindings.concat(gapFindings)
const byId = {}
allRaw.forEach(f => { byId[f.id] = f })
let groups = []
const dd = allRaw.length ? await agent(dedupPrompt(allRaw), { label: 'дедупликация', phase: 'Дедупликация', schema: S_DEDUP }) : { groups: [] }
const placed = new Set()
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
allRaw.forEach(f => { if (!placed.has(f.id)) { placed.add(f.id); groups.push({ f: f, merged: [] }) } })
log('После дедупликации: ' + groups.length + ' групп')

// ---------- Проверка ----------
phase('Проверка')
const checked = await pipeline(groups, async (g) => {
  const lensIds = Object.keys(LENSES)
  const votes = await parallel(lensIds.map(l => () => agent(verifyPrompt(g.f, l), { label: 'проверка:' + l + ':' + g.f.id, phase: 'Проверка', schema: S_VERDICT, model: 'opus' })))
  const vs = votes.filter(Boolean)
  const refute = vs.filter(v => v.verdict === 'опровергнуто').length
  const confirm = vs.filter(v => v.verdict === 'подтверждено').length
  const sevCount = {}
  vs.forEach(v => { sevCount[v.severity] = (sevCount[v.severity] || 0) + 1 })
  const sevTop = Object.keys(sevCount).sort((a, b) => sevCount[b] - sevCount[a])[0] || g.f.severity
  return { id: g.f.id, dimension: g.f.dimension, title: g.f.title, kind: g.f.kind, file: g.f.file, line: g.f.line, what_happens: g.f.what_happens, owner_impact: g.f.owner_impact, proposed_fix: g.f.proposed_fix, merged: g.merged, severity: sevTop, confirm: confirm, refute: refute, verdicts: vs.map(v => v.verdict + ' (' + v.severity + '): ' + v.reason), survives: vs.length > 0 && refute < 2 }
})
const checkedOk = checked.filter(Boolean)
const checkLost = checked.filter(x => !x).length
if (checkLost) log('ПОТЕРЯНО в проверке: ' + checkLost + ' групп')
const survivors = checkedOk.filter(x => x.survives)
const rejected = checkedOk.filter(x => !x.survives)
log('Проверка: выжило ' + survivors.length + ', отброшено ' + rejected.length + ' (опровергнуто двумя линзами и больше)')

// ---------- Пробелы ----------
phase('Пробелы')
const crit = await agent(criticPrompt(MAP_GROUPS.map(g => g.title), DIMS.map(d => d.name), 'выжило ' + survivors.length + ', отброшено ' + rejected.length), { label: 'критик полноты', phase: 'Пробелы', schema: S_CRIT, model: 'opus' })
const probes = crit ? crit.gaps.slice(0, 6) : []
if (crit && crit.gaps.length > 6) log('Критик предложил ' + crit.gaps.length + ' пробелов; взяты первые 6, остальные не проверялись: ' + crit.gaps.slice(6).map(g => g.area).join('; '))
const probeRes = await parallel(probes.map((p, i) => () => agent(finderPrompt({ key: 'P' + (i + 1), name: 'Пробел аудита: ' + p.area, q: p.probe }, formMap), { label: 'зонд:' + (i + 1), phase: 'Пробелы', schema: S_FIND, model: 'opus' })))
let probeFindings = []
probeRes.forEach((r, i) => { if (!r) { log('ПОТЕРЯНО: зонд ' + (i + 1) + ' не вернул результат'); return } r.findings.forEach((f, fi) => probeFindings.push(Object.assign({}, f, { id: 'P' + (i + 1) + '-' + (fi + 1), dimension: 'Пробел аудита: ' + probes[i].area }))) })
const probeChecked = await pipeline(probeFindings.map(f => ({ f: f, merged: [] })), async (g) => {
  const lensIds = Object.keys(LENSES)
  const votes = await parallel(lensIds.map(l => () => agent(verifyPrompt(g.f, l), { label: 'проверка-зонд:' + l + ':' + g.f.id, phase: 'Пробелы', schema: S_VERDICT, model: 'opus' })))
  const vs = votes.filter(Boolean)
  const refute = vs.filter(v => v.verdict === 'опровергнуто').length
  return { id: g.f.id, dimension: g.f.dimension, title: g.f.title, kind: g.f.kind, file: g.f.file, line: g.f.line, what_happens: g.f.what_happens, owner_impact: g.f.owner_impact, proposed_fix: g.f.proposed_fix, merged: [], severity: g.f.severity, confirm: vs.filter(v => v.verdict === 'подтверждено').length, refute: refute, verdicts: vs.map(v => v.verdict + ' (' + v.severity + '): ' + v.reason), survives: vs.length > 0 && refute < 2 }
})
const probeOk = probeChecked.filter(Boolean)
const probeSurvivors = probeOk.filter(x => x.survives)

const hypotheses = reqList.filter(x => x.source_kind === 'отрасль')
const buyerExtras = reqList.filter(x => x.need.startsWith('ЛИШНЕЕ'))

return {
  map: mapOk,
  requirements: reqList,
  hypotheses: hypotheses,
  buyer_extra_fields: buyerExtras,
  survivors: survivors.concat(probeSurvivors),
  rejected: rejected.concat(probeOk.filter(x => !x.survives)),
  critic: crit,
  counts: { полей: fieldTotal, находок_сырых: allRaw.length + probeFindings.length, групп: groups.length, выжило: survivors.length + probeSurvivors.length, отброшено: rejected.length + probeOk.length - probeSurvivors.length, зондов: probes.length },
}
