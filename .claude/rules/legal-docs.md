---
paths:
  - "src/utils/legal*.ts"
  - "src/components/Legal*.tsx"
  - "src/components/admin/AdminLegalTab.tsx"
  - "src/views/LegalDocumentScreen.tsx"
  - "src/views/CheckoutScreen.tsx"
  - "src/components/QuickOrderModal.tsx"
  - "src/components/SidebarDrawer.tsx"
---

# Оферта и политика персональных данных

- Шаблоны — `src/utils/legalTemplates.ts` (грузятся только со страницей документа `#/offer`, `#/privacy` и в
  админке), метки `{{продавец}}` и др. заполняются реквизитами «Витрины» (`legalPlaceholders`, демо-реквизиты
  не считаются). Свой текст магазина — `settings/legal` (Админ → «Магазин» → «Документы», `AdminLegalTab`,
  «Вернуть шаблон» удаляет его).
- Без названия продавца, ИНН, ОГРН, адреса и email/телефона (`legalDocsReady`) документы не показываются, строки
  «вы принимаете условия оферты» (`LegalConsentNote`) в оформлении и заказе в 1 клик нет.
- Меняя шаблон, обновляйте `LEGAL_TEMPLATE_DATE`: по ней страница документа пишет «Редакция от …».
