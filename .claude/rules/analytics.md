---
paths:
  - "src/components/admin/AdminAnalytics*.tsx"
  - "src/components/admin/AdminChart*.tsx"
  - "src/components/admin/AdminDailySalesInspector.tsx"
  - "src/utils/analyticsEngine.ts"
  - "src/utils/pdfExport.ts"
---

# Аналитика

- `AdminAnalyticsTab` считается по заказам после `settings/analytics.resetAt`; «Сбросить статистику» заказы не
  удаляет, «Вернуть всю историю» снимает сброс. Числа экрана и PDF — `computeFirestoreDailySales`
  и `computePeriodBreakdown` (`src/utils/analyticsEngine.ts`), по цене и названию из заказа.
- Показатель графика выбирают карточки KPI (`role="radio"`: `neu-flat neu-pressable` → выбранная `neu-pill-active`),
  отдельного переключателя нет; «Пик» — чип в шапке графика. Тени модуля — только `neu-*`; SVG-тень столбцов
  (`neu-bar-elevation`) повторяет `--neu-raised-sm`.
- Период выбирается в модальном окне (`PeriodDialog`); график не пересоздается при переключении (без `key`).
