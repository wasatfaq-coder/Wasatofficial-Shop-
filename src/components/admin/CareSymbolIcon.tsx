import type { CareSymbol } from '../../utils/careSymbols';

/** A care symbol drawn as on a garment label (admin only: the customer's card shows the rule's text) */
export function CareSymbolIcon({ symbol }: { symbol: CareSymbol }) {
  const [kind, mark] = symbol.id.split('-');
  const cross = mark === 'no' && <path d="M5 5 27 27M27 5 5 27" />;
  const dots = (n: number) =>
    Array.from({ length: n }, (_, i) => <circle key={i} cx={16 + (i - (n - 1) / 2) * 4} cy={19} r={1.1} fill="currentColor" />);
  let body: React.ReactNode = null;
  if (kind === 'wash') {
    body = (
      <>
        <path d="M4 11 7 26h18l3-15" />
        <path d="M4 11c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0" />
        {mark === 'hand' && <path d="M13 23v-6m2.5 6v-7m2.5 7v-6m-7.5 6v-3" />}
        {/^\d+$/.test(mark) && (
          <text x="16" y="22.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" stroke="none">
            {mark}
          </text>
        )}
      </>
    );
  } else if (kind === 'bleach') {
    body = <path d="M16 5 28 26H4Z" />;
  } else if (kind === 'tumble') {
    body = (
      <>
        <rect x="5" y="5" width="22" height="22" rx="1" />
        <circle cx="16" cy="16" r="8" />
        {mark === 'low' && <circle cx="16" cy="16" r="1.4" fill="currentColor" />}
      </>
    );
  } else if (kind === 'dry') {
    body = (
      <>
        <rect x="5" y="5" width="22" height="22" rx="1" />
        <path d="M10 16h12" />
      </>
    );
  } else if (kind === 'iron') {
    body = (
      <>
        <path d="M4 24h24l-2-9c-.5-2.5-2.5-4-5-4H10l-1 4" />
        <path d="M9 15h17" />
        {/^\d$/.test(mark) && dots(Number(mark))}
      </>
    );
  } else if (kind === 'clean') {
    body = (
      <>
        <circle cx="16" cy="16" r="11" />
        {mark !== 'no' && (
          <text x="16" y="20" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">
            {mark.toUpperCase()}
          </text>
        )}
      </>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {body}
      {cross}
    </svg>
  );
}
