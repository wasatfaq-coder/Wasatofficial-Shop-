import { useState } from 'react';
import { ArrowRight, History, Loader2 } from 'lucide-react';
import type { PriceChangeLog } from '../../types';
import { loadPriceChanges } from '../../utils/firebaseSync';
import { PRICE_CHANGES_LIMIT, priceChangeSourceText } from '../../utils/priceChanges';
import { pluralRu } from '../../utils/pluralize';
import { AdminHint } from './AdminHint';

const rub = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * «Курсы и наценка» → «Журнал цен» (admin audit 09.10, finding 11): who changed which price, when, from what to what
 * and at which rate. Read once on request — the journal grows with every «Применить», and the rates screen should not
 * read it on every visit.
 */
export function AdminPriceJournal() {
  const [entries, setEntries] = useState<PriceChangeLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setEntries(await loadPriceChanges(PRICE_CHANGES_LIMIT));
    } catch (err) {
      console.error('Price journal was not read:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="neu-flat rounded-3xl p-4 space-y-3" aria-labelledby="price-journal-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h4 id="price-journal-title" className="text-sm font-extrabold text-[#2D3A4E] flex items-center gap-2">
            <History className="w-4 h-4 text-accent" aria-hidden="true" /> Журнал цен
          </h4>
          <AdminHint label="Журнал цен">Когда, кто и с какой на какую цену поменял товар — на случай спора о цене с оптовиком</AdminHint>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-4 h-10 rounded-2xl text-xs font-bold ${
            loading ? 'neu-button-disabled' : 'neu-button text-[#2D3A4E] hover:text-accent cursor-pointer'
          }`}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {entries ? 'Обновить журнал' : 'Показать журнал'}
        </button>
      </div>

      {failed && (
        <p role="alert" className="text-xs font-bold text-danger">
          Не удалось загрузить журнал. Проверьте связь и нажмите ещё раз.
        </p>
      )}
      {entries && entries.length === 0 && <p className="text-xs text-[#4E5C70]">Цены ещё не менялись.</p>}
      {entries && entries.length > 0 && (
        <>
          <p className="text-xs text-[#4E5C70]">
            {entries.length === PRICE_CHANGES_LIMIT
              ? `Последние ${PRICE_CHANGES_LIMIT} изменений`
              : `${entries.length} ${pluralRu(entries.length, ['изменение', 'изменения', 'изменений'])}`}
          </p>
          <ul className="divide-y divide-[#C9D2DD]" aria-label="Изменения цен">
            {entries.map((e) => (
              <li key={e.id} className="py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#2D3A4E] truncate">{e.productTitle}</p>
                  <p className="text-[11px] text-[#4E5C70]">
                    {formatDate(e.createdAt)} · {priceChangeSourceText(e)} · {e.operator}
                  </p>
                </div>
                <p className="flex items-center gap-1.5 text-xs font-bold tabular-nums">
                  <span className="text-[#4E5C70]">{rub(e.oldPrice)}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#4E5C70]" aria-label="стало" />
                  <span className={e.newPrice > e.oldPrice ? 'text-danger' : 'text-success'}>{rub(e.newPrice)}</span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
