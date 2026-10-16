import type { Product, StorefrontSettings } from '../types';
import {
  minPacksOf,
  packSizeOf,
  readMinWholesaleAmount,
  readVolumeDiscount,
  sellsRetail,
  sellsWholesale,
   type WholesaleSettings,
} from '../shared/wholesalePricing';
import {
  productSizePacks,
  sizePackColors,
  sizePackCompositionText,
  sizePackPieces,
  sizePackPrice,
  sizePacksAvailable,
  sizePackTitle,
} from '../shared/sizePacks';
import { getVariantStock, isHiddenFromSale } from './inventory';
import { wholesaleOfferOf } from './wholesaleOffer';
import { downloadCSV } from './csvHelpers';
import { currentStoreName, getStoreContacts } from './storeContacts';
import { productImage } from './productImage';

export interface WholesalePriceListPackInfo {
  id: string;
  title: string;
  composition: string;
  pieces: number;
  price: number;
  availableByColor: { color: string; packs: number }[];
  totalPacks: number;
}

export interface WholesalePriceListRow {
  id: string;
  title: string;
  categoryLabel: string;
  saleChannelLabel: string;
  retailPrice: number | null;
  wholesaleUnitPrice: number;
  packSize: number;
  packPrice: number;
  minPacks: number;
  stepsText: string;
  variantsStockText: string;
  totalStock: number;
  sizePacks: WholesalePriceListPackInfo[];
  sizePacksText: string;
  image: string;
}

const rub = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/**
 * Builds structured wholesale price-list rows for all active products sold wholesale.
 */
export function buildWholesalePriceListRows(
  products: Product[],
  wholesale?: WholesaleSettings | null
): WholesalePriceListRow[] {
  return products
    .filter((p) => sellsWholesale(p) && !isHiddenFromSale(p))
    .map((product) => {
      const offer = wholesaleOfferOf(product, wholesale);
      const unitPrice = product.wholesalePrice as number;
      const packSize = packSizeOf(product);
      const packPrice = unitPrice * packSize;
      const minPacks = minPacksOf(product);
      const retailPrice = sellsRetail(product) ? product.price : null;

      const stepsText = (offer?.steps ?? [])
        .map(
          (step) =>
            `от ${step.minPacks} ${packSize > 1 ? 'уп.' : 'шт.'} — ${rub(step.unitPrice)}/шт.${
              packSize > 1 ? ` (${rub(step.unitPrice * packSize)}/уп.)` : ''
            } (${step.discount})`
        )
        .join('; ');

      const colorStocks: string[] = [];
      let totalStock = 0;
      for (const c of product.colors ?? []) {
        const sizeEntries: string[] = [];
        for (const sz of product.sizes ?? []) {
          const st = getVariantStock(product, c.name, sz);
          if (st > 0) {
            totalStock += st;
            sizeEntries.push(`${sz}: ${st} шт.`);
          }
        }
        if (sizeEntries.length > 0) {
          colorStocks.push(`${c.name} (${sizeEntries.join(', ')})`);
        }
      }

      const packs = productSizePacks(product)
        .map((pack): WholesalePriceListPackInfo | null => {
          const price = sizePackPrice(product, pack);
          if (price === undefined) return null;
          const colors = sizePackColors(product, pack);
          const availableByColor = colors.map((color) => ({
            color,
            packs: sizePacksAvailable(product, pack, color),
          }));
          const totalPacks = availableByColor.reduce((sum, item) => sum + item.packs, 0);
          return {
            id: pack.id,
            title: sizePackTitle(pack),
            composition: sizePackCompositionText(pack),
            pieces: sizePackPieces(pack),
            price,
            availableByColor,
            totalPacks,
          };
        })
        .filter((item): item is WholesalePriceListPackInfo => item !== null);

      const sizePacksText = packs
        .map((pk) => {
          const availText = pk.availableByColor
            .filter((a) => a.packs > 0)
            .map((a) => `${a.color}: ${a.packs} уп.`)
            .join(', ');
          return `${pk.title} (${pk.composition}, ${pk.pieces} шт.) — ${rub(pk.price)}/уп. [${availText || 'нет в наличии'}]`;
        })
        .join(' | ');

      return {
        id: product.id,
        title: product.title,
        categoryLabel: product.categoryLabel || product.category || 'Без категории',
        saleChannelLabel: sellsRetail(product) ? 'В розницу и оптом' : 'Только оптом',
        retailPrice,
        wholesaleUnitPrice: unitPrice,
        packSize,
        packPrice,
        minPacks,
        stepsText,
        variantsStockText: colorStocks.join(' | ') || 'Нет в наличии',
        totalStock,
        sizePacks: packs,
        sizePacksText,
        image: productImage(product, 0),
      };
    });
}

export const WHOLESALE_PRICE_LIST_CSV_HEADERS = [
  'Артикул / ID',
  'Модель',
  'Категория',
  'Канал продаж',
  'Опт за 1 шт. (₽)',
  'Штук в упаковке',
  'Цена упаковки (₽)',
  'Мин. партия (уп.)',
  'Розница за 1 шт. (₽)',
  'Ступени скидки за объём',
  'Ростовки (состав, цена и остаток уп.)',
  'Остатки по цветам и размерам',
  'Общий остаток (шт.)',
];

/**
 * Builds the 2D array of rows for the wholesale CSV price list.
 */
export function wholesalePriceListCsvRows(
  products: Product[],
  wholesale?: WholesaleSettings | null
): (string | number)[][] {
  const rows = buildWholesalePriceListRows(products, wholesale);
  return [
    WHOLESALE_PRICE_LIST_CSV_HEADERS,
    ...rows.map((r) => [
      r.id,
      r.title,
      r.categoryLabel,
      r.saleChannelLabel,
      r.wholesaleUnitPrice,
      r.packSize,
      r.packPrice,
      r.minPacks,
      r.retailPrice ?? '—',
      r.stepsText || '—',
      r.sizePacksText || '—',
      r.variantsStockText,
      r.totalStock,
    ]),
  ];
}

/**
 * Downloads the wholesale price list as a UTF-8 CSV file.
 */
export function exportWholesalePriceListCSV(
  products: Product[],
  wholesale?: WholesaleSettings | null,
  storeName?: string
): boolean {
  const table = wholesalePriceListCsvRows(products, wholesale);
  if (table.length <= 1) return false;
  const brand = (storeName?.trim() || currentStoreName()).replace(/\s+/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`${brand}_Оптовый_прайс_${date}.csv`, table);
  return true;
}

/**
 * Generates and downloads a multi-page A4 PDF wholesale price list with product photos, wholesale prices,
 * volume discount tiers, variant stocks, and size-run packs («ростовки»).
 */
export async function generateWholesalePriceListPDF(
  products: Product[],
  wholesale?: WholesaleSettings | null,
  settings?: StorefrontSettings
): Promise<boolean> {
  const rows = buildWholesalePriceListRows(products, wholesale);
  if (rows.length === 0) return false;

  const storeName = settings?.storeName?.trim() || currentStoreName();
  const contacts = getStoreContacts(settings);
  const minAmount = readMinWholesaleAmount(wholesale);
  const scale = readVolumeDiscount(wholesale?.volumeDiscount);

  const dateNow = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '820px';
  container.style.backgroundColor = '#FFFFFF';
  container.style.color = '#1E293B';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.padding = '32px 36px';
  container.style.boxSizing = 'border-box';
  container.style.lineHeight = '1.45';

  const termsParts: string[] = [];
  if (minAmount) {
    termsParts.push(`Минимальная сумма оптового заказа: <strong>${rub(minAmount)}</strong>`);
  }
  if (scale && scale.tiers.length > 0) {
    const scopeText = scale.countBy === 'order' ? 'по сумме всех оптовых упаковок заказа' : 'по упаковкам одной модели';
    const tiersSummary = scale.tiers
      .map(
        (t) =>
          `от ${t.minPacks} уп. — −${
            scale.kind === 'percent' ? `${t.value.toLocaleString('ru-RU')} %` : `${rub(t.value)} с шт.`
          }`
      )
      .join(' · ');
    termsParts.push(`Скидка за объём (${esc(scopeText)}): <strong>${esc(tiersSummary)}</strong>`);
  }

  container.innerHTML = `
    <div style="border-bottom: 2px solid #2C4A6B; padding-bottom: 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
      <div>
        <h1 style="margin: 0; font-size: 22px; font-weight: 900; color: #0F172A;">
          ${esc(storeName)} <span style="color: #2C4A6B; font-weight: 700; font-size: 15px;">| ОПТОВЫЙ ПРАЙС-ЛИСТ</span>
        </h1>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #475569;">
          Актуальные оптовые цены, ступени скидок за объём, ростовки и наличие на складе
        </p>
        ${
          contacts.phone || contacts.email || contacts.telegram
            ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #64748B;">
                ${[
                  contacts.phone ? `Тел.: ${esc(contacts.phone)}` : '',
                  contacts.email ? `Email: ${esc(contacts.email)}` : '',
                  contacts.telegram ? `Telegram: ${esc(contacts.telegram)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>`
            : ''
        }
      </div>
      <div style="text-align: right; shrink: 0;">
        <span style="display: inline-block; background: #E8EDF3; color: #2C4A6B; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px;">
          Позиций: ${rows.length}
        </span>
        <p style="margin: 5px 0 0 0; font-size: 11px; color: #64748B;">Дата: ${esc(dateNow)}</p>
      </div>
    </div>

    ${
      termsParts.length > 0
        ? `<div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; font-size: 11px; color: #334155;">
            ${termsParts.map((line) => `<div style="margin: 2px 0;">${line}</div>`).join('')}
          </div>`
        : ''
    }

    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <thead>
        <tr style="border-bottom: 2px solid #CBD5E1; background: #F1F5F9; color: #334155; text-align: left;">
          <th style="padding: 8px 6px; width: 58px;">Фото</th>
          <th style="padding: 8px 6px; width: 185px;">Модель и категория</th>
          <th style="padding: 8px 6px; width: 135px;">Оптовая цена и партия</th>
          <th style="padding: 8px 6px;">Ростовки и наличие по размерам</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr style="border-bottom: 1px solid #E2E8F0; vertical-align: top;">
            <td style="padding: 8px 6px;">
              ${
                r.image
                  ? `<img src="${esc(r.image)}" crossorigin="anonymous" alt="" style="width: 50px; height: 64px; object-fit: cover; border-radius: 6px; border: 1px solid #CBD5E1; display: block; background: #F8FAFC;" />`
                  : `<div style="width: 50px; height: 64px; border-radius: 6px; border: 1px solid #CBD5E1; background: #F1F5F9; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #64748B; text-align: center;">Нет фото</div>`
              }
            </td>
            <td style="padding: 8px 6px;">
              <div style="font-weight: 800; color: #0F172A; font-size: 12px; margin-bottom: 2px;">${esc(r.title)}</div>
              <div style="color: #64748B; font-size: 10px;">${esc(r.categoryLabel)} · ${esc(r.saleChannelLabel)}</div>
              ${
                r.retailPrice !== null
                  ? `<div style="color: #475569; font-size: 10px; margin-top: 3px;">Розница: ${esc(rub(r.retailPrice))}/шт.</div>`
                  : ''
              }
            </td>
            <td style="padding: 8px 6px;">
              <div style="font-weight: 900; color: #2C4A6B; font-size: 13px;">${esc(rub(r.wholesaleUnitPrice))}/шт.</div>
              ${
                r.packSize > 1
                  ? `<div style="color: #334155; font-weight: 700; font-size: 10px; margin-top: 2px;">Упаковка ${r.packSize} шт. — ${esc(rub(r.packPrice))}</div>`
                  : ''
              }
              ${
                r.minPacks > 1
                  ? `<div style="color: #64748B; font-size: 10px;">Мин. партия: ${r.minPacks} ${r.packSize > 1 ? 'уп.' : 'шт.'}</div>`
                  : ''
              }
              ${
                r.stepsText
                  ? `<div style="margin-top: 4px; color: #3B6652; font-size: 10px; line-height: 1.35;">${esc(r.stepsText)}</div>`
                  : ''
              }
            </td>
            <td style="padding: 8px 6px;">
              ${
                r.sizePacks.length > 0
                  ? `<div style="margin-bottom: 6px; padding: 5px 7px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px;">
                      <div style="font-weight: 800; color: #0F172A; font-size: 10px; margin-bottom: 2px;">Ростовки:</div>
                      ${r.sizePacks
                        .map((pk) => {
                          const avail = pk.availableByColor
                            .filter((a) => a.packs > 0)
                            .map((a) => `${a.color}: ${a.packs} уп.`)
                            .join(', ');
                          return `<div style="font-size: 10px; color: #334155; margin-top: 2px;">
                            <strong>${esc(pk.title)}</strong> (${esc(pk.composition)}, ${pk.pieces} шт.) — <strong>${esc(rub(pk.price))}/уп.</strong>
                            <span style="color: #64748B;"> · ${esc(avail || 'нет полных уп.')}</span>
                          </div>`;
                        })
                        .join('')}
                    </div>`
                  : ''
              }
              <div style="font-size: 10px; color: #334155;">
                <strong>По размерам (всего ${r.totalStock} шт.):</strong> ${esc(r.variantsStockText)}
              </div>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;

  document.body.appendChild(container);
  try {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#FFFFFF',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    for (let offset = 0; offset < imgHeight; offset += pageHeight) {
      if (offset > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -offset, imgWidth, imgHeight);
    }

    const brand = storeName.replace(/\s+/g, '_');
    const date = new Date().toISOString().slice(0, 10);
    pdf.save(`${brand}_Оптовый_прайс_${date}.pdf`);
    return true;
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}
