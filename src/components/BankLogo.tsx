import type { Account } from '@/lib/model';
import { BRAND_ICONS } from '@/lib/brand-icons';
// Amex and Bank of America use their official marks from Simple Icons.
// Capital One has no openly licensed mark available, so it uses a stand-in in
// its brand colors; replace it with the official artwork if you have it.
const OFFICIAL: Partial<Record<Account, string>> = {
  Amex: 'americanexpress',
  'Bank of America': 'bankofamerica',
};
export default function BankLogo({
  account,
  size = 32,
}: {
  account: Account;
  size?: number;
}) {
  const slug = OFFICIAL[account];
  if (slug) {
    const [, color, path] = BRAND_ICONS[slug];
    const inset = account === 'Amex' ? 0 : 4;
    return (
      <svg
        className="bank-logo"
        width={size}
        height={size}
        viewBox={`${-inset} ${-inset} ${24 + inset * 2} ${24 + inset * 2}`}
        aria-hidden
        focusable="false"
      >
        <rect
          x={-inset}
          y={-inset}
          width={24 + inset * 2}
          height={24 + inset * 2}
          rx={6}
          fill="#fff"
        />
        <path d={path} fill={color} />
      </svg>
    );
  }
  return (
    <svg
      className="bank-logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="#004977" />
      <path
        d="M5 17.5C10.5 9 20 6.5 27.5 9.2"
        fill="none"
        stroke="#d22e1e"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <text
        x="16"
        y="26.5"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8.5"
        fontWeight="700"
      >
        C1
      </text>
    </svg>
  );
}
