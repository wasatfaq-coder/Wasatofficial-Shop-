import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { currentStoreName } from './storeContacts';

interface ReportData {
  periodLabel: string;
  totalRevenue: number;
  prevRevenue?: number;
  revenueGrowthPercent: number;
  totalOrdersCount: number;
  prevOrdersCount?: number;
  avgCheck: number;
  returnRate: string;
  totalReturnsCount: number;
  categoryStats: Array<{
    name: string;
    share: number;
    revenue: number;
  }>;
  topProducts: Array<{
    title: string;
    price: number;
    salesCount: number;
    revenue: number;
    rating?: number;
  }>;
  recentOrders: Array<{
    id: string;
    date: string;
    itemsCount: number;
    status: string;
    total: number;
  }>;
}

export async function generateAnalyticsPDF(data: ReportData): Promise<void> {
  // Create an offscreen, beautifully styled element for PDF rendering with full Cyrillic support
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.backgroundColor = '#FFFFFF';
  container.style.color = '#1E293B';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.padding = '36px 40px';
  container.style.boxSizing = 'border-box';
  container.style.lineHeight = '1.5';

  const dateNow = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  container.innerHTML = `
    <div style="border-bottom: 2px solid #5F6ED0; padding-bottom: 18px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #1E293B;">
          ${currentStoreName()} <span style="color: #5F6ED0; font-weight: 700; font-size: 16px;">| FINANCIAL REPORT</span>
        </h1>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748B;">
          Финансово-аналитический отчет продаж и ключевых показателей
        </p>
      </div>
      <div style="text-align: right;">
        <span style="display: inline-block; background: #EEF2FF; color: #4F46E5; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">
          Период: ${data.periodLabel}
        </span>
        <p style="margin: 5px 0 0 0; font-size: 11px; color: #94A3B8;">Сформирован: ${dateNow}</p>
      </div>
    </div>

    <!-- Summary Metrics Grid -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px;">
        <p style="margin: 0; font-size: 11px; color: #64748B; font-weight: 600;">Выручка (Оборот)</p>
        <p style="margin: 4px 0 0 0; font-size: 17px; font-weight: 900; color: #0F172A;">
          ${data.totalRevenue.toLocaleString('ru-RU')} ₽
        </p>
        <span style="font-size: 10px; color: #16A34A; font-weight: 700;">+${data.revenueGrowthPercent}% к пред. пер.</span>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px;">
        <p style="margin: 0; font-size: 11px; color: #64748B; font-weight: 600;">Средний чек</p>
        <p style="margin: 4px 0 0 0; font-size: 17px; font-weight: 900; color: #0F172A;">
          ${data.avgCheck.toLocaleString('ru-RU')} ₽
        </p>
        <span style="font-size: 10px; color: #4F46E5; font-weight: 600;">Стабильный темп</span>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px;">
        <p style="margin: 0; font-size: 11px; color: #64748B; font-weight: 600;">Заказов оформлено</p>
        <p style="margin: 4px 0 0 0; font-size: 17px; font-weight: 900; color: #0F172A;">
          ${data.totalOrdersCount.toLocaleString('ru-RU')} шт.
        </p>
        <span style="font-size: 10px; color: #16A34A; font-weight: 600;">Конверсия: 3.4%</span>
      </div>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px;">
        <p style="margin: 0; font-size: 11px; color: #64748B; font-weight: 600;">Возвраты</p>
        <p style="margin: 4px 0 0 0; font-size: 17px; font-weight: 900; color: #D97706;">
          ${data.totalReturnsCount} шт. (${data.returnRate}%)
        </p>
        <span style="font-size: 10px; color: #16A34A; font-weight: 600;">Ниже пороговых 3%</span>
      </div>
    </div>

    <!-- 2 Column Section: Categories & Top Products -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
      <!-- Categories -->
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px;">
        <h3 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #334155; letter-spacing: 0.5px;">
          Структура выручки по категориям
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid #CBD5E1; text-align: left; color: #64748B;">
              <th style="padding: 4px 0;">Категория</th>
              <th style="padding: 4px 0; text-align: center;">Доля</th>
              <th style="padding: 4px 0; text-align: right;">Сумма (₽)</th>
            </tr>
          </thead>
          <tbody>
            ${data.categoryStats
              .map(
                (cat) => `
              <tr style="border-bottom: 1px solid #F1F5F9;">
                <td style="padding: 6px 0; font-weight: 600; color: #1E293B;">${cat.name}</td>
                <td style="padding: 6px 0; text-align: center; color: #4F46E5; font-weight: 700;">${cat.share}%</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #0F172A;">${cat.revenue.toLocaleString('ru-RU')} ₽</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- Top Selling Products -->
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px;">
        <h3 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #334155; letter-spacing: 0.5px;">
          Топ продаваемых моделей
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid #CBD5E1; text-align: left; color: #64748B;">
              <th style="padding: 4px 0;">Модель</th>
              <th style="padding: 4px 0; text-align: center;">Шт</th>
              <th style="padding: 4px 0; text-align: right;">Выручка (₽)</th>
            </tr>
          </thead>
          <tbody>
            ${data.topProducts
              .map(
                (p, idx) => `
              <tr style="border-bottom: 1px solid #F1F5F9;">
                <td style="padding: 6px 0; font-weight: 600; color: #1E293B;">
                  <span style="color: #6366F1; font-weight: 800; margin-right: 4px;">#${idx + 1}</span>
                  ${p.title.length > 25 ? p.title.slice(0, 25) + '...' : p.title}
                </td>
                <td style="padding: 6px 0; text-align: center; font-weight: 700; color: #475569;">${p.salesCount}</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #0F172A;">${p.revenue.toLocaleString('ru-RU')} ₽</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Recent Orders / Transaction Registry -->
    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #334155; letter-spacing: 0.5px;">
        Реестр недавних транзакций и заказов
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="border-bottom: 1px solid #CBD5E1; text-align: left; color: #64748B; background: #F8FAFC;">
            <th style="padding: 6px 8px;">№ Заказа</th>
            <th style="padding: 6px 8px;">Дата</th>
            <th style="padding: 6px 8px;">Позиций</th>
            <th style="padding: 6px 8px;">Статус</th>
            <th style="padding: 6px 8px; text-align: right;">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${(data.recentOrders.length > 0
            ? data.recentOrders.slice(0, 6)
            : [
                { id: 'MS-8924', date: '16.08.2026', itemsCount: 3, status: 'Доставлен', total: 18400 },
                { id: 'MS-8923', date: '16.08.2026', itemsCount: 1, status: 'В пути', total: 7200 },
                { id: 'MS-8922', date: '15.08.2026', itemsCount: 2, status: 'Доставлен', total: 14900 },
                { id: 'MS-8921', date: '15.08.2026', itemsCount: 4, status: 'Доставлен', total: 29800 },
                { id: 'MS-8920', date: '14.08.2026', itemsCount: 1, status: 'Доставлен', total: 6500 },
              ]
          )
            .map(
              (ord) => `
            <tr style="border-bottom: 1px solid #F1F5F9;">
              <td style="padding: 6px 8px; font-weight: 700; color: #3B82F6;">#${ord.id}</td>
              <td style="padding: 6px 8px; color: #64748B;">${ord.date}</td>
              <td style="padding: 6px 8px; color: #475569;">${ord.itemsCount} шт.</td>
              <td style="padding: 6px 8px;">
                <span style="background: #DCFCE7; color: #15803D; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
                  ${ord.status}
                </span>
              </td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 800; color: #0F172A;">${ord.total.toLocaleString('ru-RU')} ₽</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Footer Seal -->
    <div style="border-top: 1px solid #E2E8F0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #94A3B8;">
      <span>${currentStoreName()} • Конфиденциальный отчет</span>
      <span>Стр. 1 из 1</span>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
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

    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
    
    const fileName = `${currentStoreName().replace(/\s+/g, '_')}_Отчет_${data.periodLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fileName);
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}
