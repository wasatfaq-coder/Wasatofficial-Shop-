// «Аналитика»: розница и опт отдельно, чистый доход = выручка − себестоимость закупки, свой период и группировка
// по неделям (этап 19 плана docs/admin-wholesale-plan.md). Заказы — в январе 2026: другие сценарии оформляют заказы
// сегодня, и в этом периоде есть только эти два (оба проекта пишут одни и те же документы)
import { test, expect, openAdminSection } from '../fixtures';
import { writeDocs } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';

const item = PRODUCTS.chinos;
const COST = 1000;
const WHOLESALE_PRICE = 3700;
const rub = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ru-RU')} ₽`;

const line = (quantity: number, extra: Record<string, unknown> = {}) => ({
  id: `line-${quantity}`,
  product: { id: item.id, title: item.title, price: item.price, category: item.category, categoryLabel: item.categoryLabel },
  selectedColor: 'Хаки',
  selectedSize: '50',
  quantity,
  ...extra,
});

const order = (id: string, createdAt: string, items: Record<string, unknown>[], totalPrice: number, extra: Record<string, unknown> = {}) => ({
  id,
  createdAt,
  date: '',
  status: 'delivered',
  paymentStatus: 'paid',
  items,
  totalPrice,
  deliveryAddress: 'Москва',
  deliveryMethod: 'Курьером до двери',
  customerName: 'Покупатель Аналитики',
  ...extra,
});

test('опт и розница считаются отдельно, чистый доход — выручка за товары минус себестоимость', async ({ page, signIn }) => {
  // розница: 2 шт. по цене каталога и доставка 350 ₽; опт: 10 шт. по оптовой цене строки
  await writeDocs({
    [`product_costs/${item.id}`]: { costPrice: COST },
    'orders/e2e-analytics-retail': order('e2e-analytics-retail', '2026-01-12T09:00:00.000Z', [line(2)], item.price * 2 + 350, {
      deliveryFee: 350,
    }),
    'orders/e2e-analytics-wholesale': order(
      'e2e-analytics-wholesale',
      '2026-01-13T09:00:00.000Z',
      [line(10, { unitPrice: WHOLESALE_PRICE, priceKind: 'wholesale' })],
      WHOLESALE_PRICE * 10
    ),
  });

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await openAdminSection(panel, 'Аналитика');

  // свой период: 10–16 января 2026
  await panel.getByRole('button', { name: /^Последние 7 дней/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Период аналитики' });
  await dialog.getByLabel('С', { exact: true }).fill('2026-01-10');
  await dialog.getByLabel('По', { exact: true }).fill('2026-01-16');
  await dialog.getByRole('button', { name: 'Показать за эти даты' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByRole('button', { name: /^Свой период/ })).toContainText('10 янв. — 16 янв.');

  // обе стороны сразу: розница без доставки, опт — по оптовой цене; себестоимость сегодняшняя — оценка «≈»
  const retail = panel.getByRole('group', { name: 'Розница' });
  const wholesale = panel.getByRole('group', { name: 'Опт' });
  await expect(retail).toContainText(rub(item.price * 2));
  await expect(retail).toContainText(`≈ ${rub(item.price * 2 - 2 * COST)}`);
  await expect(wholesale).toContainText(rub(WHOLESALE_PRICE * 10));
  await expect(wholesale).toContainText(`≈ ${rub(10 * COST)}`);
  await expect(wholesale).toContainText(`≈ ${rub(WHOLESALE_PRICE * 10 - 10 * COST)}`);
  await expect(panel.getByText(/≈ — оценка: у 2 заказов/)).toBeVisible();

  // «Опт» меняет все цифры страницы: выручка и чистый доход — только оптового заказа
  await panel.getByRole('radiogroup', { name: 'Продажи' }).getByRole('radio', { name: 'Опт' }).click();
  await expect(panel.getByRole('radio', { name: /^Выручка/ })).toContainText(rub(WHOLESALE_PRICE * 10));
  await expect(panel.getByRole('radio', { name: /^Чистый доход/ })).toContainText(rub(WHOLESALE_PRICE * 10 - 10 * COST));
  await panel.getByRole('radiogroup', { name: 'Продажи' }).getByRole('radio', { name: 'Розница' }).click();
  await expect(panel.getByRole('radio', { name: /^Выручка/ })).toContainText(rub(item.price * 2 + 350));

  // по неделям: заголовок графика меняется, «Чистый доход» выбирается показателем графика
  await panel.getByRole('radiogroup', { name: 'Группировать' }).getByRole('radio', { name: 'Недели' }).click();
  await panel.getByRole('radio', { name: /^Чистый доход/ }).click();
  await expect(panel.getByRole('heading', { name: 'Чистый доход по неделям' })).toBeVisible();
});
