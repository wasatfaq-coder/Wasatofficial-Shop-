// «Курсы и наценка» (решение владельца 09.10): закупка в долларах в форме товара, курс ЦБ 85 ₽ + надбавка 5 ₽ —
// «Применить» пересчитывает цену товара по курсу 90 ₽, покупатель видит новую цену
import { test, expect, rub } from '../fixtures';
import { readDoc } from '../emulator';
import { ADMIN, PRODUCTS } from '../store';
import { CBR_DAILY_URL } from '../../../src/utils/cbrRates';

test('владелец задаёт курс и надбавку, цена товара в долларах пересчитывается', async ({ page, phone, signIn }) => {
  const item = PRODUCTS.tshirt;

  await page.goto('/profile');
  await signIn(ADMIN);
  await page.getByRole('button', { name: /^Панель администратора/ }).click();
  const panel = page.getByRole('dialog', { name: 'Панель администратора' });
  await panel.getByRole('tab', { name: 'Каталог', exact: true }).click();

  if (!phone) {
    // «Закупка в $/¥» for selected products (admin audit 09.10, finding 5): the preview only, nothing is written here
    await panel.getByRole('tab', { name: 'Товары', exact: true }).click();
    await panel.getByRole('textbox', { name: 'Поиск товаров' }).fill(item.title);
    await panel.getByRole('checkbox', { name: `Выбрать товар «${item.title}»` }).click();
    await panel.getByRole('button', { name: 'Массовые операции', exact: true }).click();
    const bulk = page.getByRole('dialog', { name: 'Массовые операции каталога' });
    await bulk.getByRole('button', { name: 'Закупка в $/¥' }).click();
    await bulk.getByRole('radio', { name: '¥ Юань' }).click();
    await bulk.getByLabel('Закупка за штуку, ¥').fill('0');
    await expect(bulk.getByRole('alert')).toHaveText('Закупка — число больше нуля');
    await bulk.getByLabel('Закупка за штуку, ¥').fill('42,5');
    await expect(bulk.getByText('42,5 ¥')).toBeVisible();
    await bulk.getByRole('button', { name: 'Закрыть' }).click();

    // the rates are one for the whole shop and phone and desktop run at the same time on one database:
    // the desktop checks the section without applying, the phone applies
    await panel.getByRole('tab', { name: 'Курсы и наценка' }).click();
    await expect(panel.getByRole('heading', { name: 'Курсы и наценка' })).toBeVisible();
    const dollar = panel.getByRole('group', { name: 'Доллар' });
    await expect(dollar.getByLabel('Курс ЦБ, ₽ за $1')).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Юань' }).getByLabel('Курс ЦБ, ₽ за ¥1')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Применить' })).toBeVisible();

    // «Подставить курс ЦБ» only fills the fields: the answer of the CBR mirror is faked, nothing is written
    await page.route(CBR_DAILY_URL, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          Date: '2026-10-09T11:30:00+03:00',
          Valute: {
            USD: { CharCode: 'USD', Nominal: 1, Value: 81.2345 },
            CNY: { CharCode: 'CNY', Nominal: 1, Value: 11.3712 },
          },
        }),
      })
    );
    await panel.getByRole('button', { name: 'Подставить курс ЦБ' }).click();
    await expect(dollar.getByLabel('Курс ЦБ, ₽ за $1')).toHaveValue('81,2345');
    await expect(panel.getByRole('group', { name: 'Юань' }).getByLabel('Курс ЦБ, ₽ за ¥1')).toHaveValue('11,3712');
    await expect(panel.getByRole('status').filter({ hasText: 'Подставлен курс ЦБ на 9 октября 2026' })).toContainText(
      'Цены изменятся после «Применить»'
    );
    await expect(panel.getByText('есть неприменённые изменения')).toBeVisible();

    return;
  }

  // purchase in dollars: stays out of the product, which every visitor reads
  await panel.getByRole('tab', { name: 'Товары', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Поиск товаров' }).fill(item.title);
  await panel.getByRole('button', { name: 'Редактировать' }).click();
  const form = page.getByRole('dialog', { name: 'Редактирование товара' });
  await form.getByRole('radio', { name: '$ Доллар' }).click();
  await form.getByLabel('Закупка, $ *').fill('10');
  await form.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(form).toBeHidden();
  await expect.poll(async () => (await readDoc(`product_costs/${item.id}`))?.purchase).toEqual({ currency: 'USD', amount: 10 });
  expect((await readDoc(`products/${item.id}`))?.purchase).toBeUndefined();

  // 85 ₽ + 5 ₽ = 90 ₽ for a dollar: 10 $ → 900 ₽ (was 1 000 ₽)
  await panel.getByRole('tab', { name: 'Курсы и наценка' }).click();
  const dollar = panel.getByRole('group', { name: 'Доллар' });
  await dollar.getByLabel('Курс ЦБ, ₽ за $1').fill('85');
  await dollar.getByLabel('Надбавка, ₽').fill('5');
  await panel.getByRole('group', { name: 'Юань' }).getByLabel('Курс ЦБ, ₽ за ¥1').fill('11,7');
  await expect(dollar.getByText('Рабочий курс: 90 ₽ за $1')).toBeVisible();
  const preview = panel.getByRole('list', { name: 'Новые цены' });
  await expect(preview.getByRole('listitem').filter({ hasText: item.title })).toContainText(rub(900));

  await panel.getByRole('button', { name: 'Применить' }).click();
  await page.getByRole('alertdialog', { name: 'Применить курсы?' }).getByRole('button', { name: 'Применить' }).click();
  // «Курсы применены» only after customers' catalog index has the new prices (admin audit 09.10, finding 10)
  await expect(page.getByText(/Курсы применены/)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/Каталог покупателей ещё обновляется/)).toHaveCount(0);
  await expect.poll(async () => (await readDoc(`products/${item.id}`))?.price).toBe(900);
  // prices, costs and the rates in one batch (finding 13)
  await expect.poll(async () => (await readDoc(`product_costs/${item.id}`))?.costPrice).toBe(900);
  await expect.poll(async () => (await readDoc('settings/exchange_rates'))?.usd).toEqual({ official: 85, markup: 5, markupKind: 'rub' });

  // the price journal: who, when, from what to what and at which rate (admin audit 09.10, finding 11)
  await panel.getByRole('button', { name: 'Показать журнал' }).click();
  const journal = panel.getByRole('list', { name: 'Изменения цен' });
  await expect(journal.getByRole('listitem').filter({ hasText: item.title }).first()).toContainText('по курсу 90 ₽ за $');

  // the customer sees the new price
  const shop = await page.context().newPage();
  await shop.goto(`/product/${item.id}`);
  await expect(shop.getByRole('main').getByText(rub(900)).first()).toBeVisible();
});
