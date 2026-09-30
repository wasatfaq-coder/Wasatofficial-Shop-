---
paths:
  - "src/components/admin/AdminLabelGenerator.tsx"
  - "src/components/admin/AdminInventoryTab.tsx"
  - "src/components/admin/InventoryGroupedList.tsx"
  - "src/components/admin/AdminProductsTab.tsx"
  - "src/utils/labels.ts"
  - "src/utils/inventory.ts"
  - "src/shared/barcode.ts"
  - "functions/test/barcode.test.ts"
---

# Склад и этикетки

- Этикетки: «Склад и SKU» → выбор вариантов → `AdminLabelGenerator` (форматы — `settings/storefront.labelFormats`,
  10 шаблонов и PDF — `src/utils/labels.ts`, превью и PDF по одной разметке, данные только из каталога, без названия
  магазина). Раскладка — колонка блоков с автоподгонкой (`solve`): масштаб текста подбирается под формат, лишнее место
  идет штрихкоду (до читаемого максимума), затем распоркам — без штрихкода цена и название крупнее, пустот нет; на
  малом формате сначала убираются необязательные строки (превью пишет, что не поместилось). Цена и название — самые
  крупные, текст только черный (термопечать).
- Артикул = товар + цвет: код без размера — `articleCode`, у всех размеров цвета один штрихкод
  (`unifyArticleBarcodes`); шаблон без размера печатает одну этикетку на артикул, «Скидка» — только при старой цене.
  Штрихкоды — `src/shared/barcode.ts`: новые только `generateInternalEan13` (EAN-13 «2…», уникальный в каталоге).
- «Склад и SKU» → «Матрица остатков»: группировка «По категориям» (категория → модель → артикул-цвет → размеры),
  «По моделям» или «Списком» (`InventoryGroupedList`, выбор запоминается в `manstyle_inventory_grouping`). Модели
  свернуты, поиск или фильтр статуса раскрывает совпавшие; галочка группы выбирает все ее варианты для этикеток
  (`aria-checked="mixed"`). Поиск — по названию, артикулу, штрихкоду, цвету, размеру и категории; фильтр «Категория» —
  категории из «Категорий».
- «Журнал движений» — подписка на `stock_movements` (последние 500, `subscribeToStockMovements`), а не `localStorage`.
  Новую запись делает `stockMovementId()` и `saveStockMovements`; журнал, оставшийся в браузере от прошлых версий
  (`manstyle_stock_movement_logs`), админка один раз переносит в базу.
