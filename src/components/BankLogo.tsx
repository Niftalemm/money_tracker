import type { Account } from '@/lib/model';
// Simplified, inline brand marks so the app never loads third-party images.
// Swap the artwork here if you prefer official assets.
export default function BankLogo({
  account,
  size = 32,
}: {
  account: Account;
  size?: number;
}) {
  return (
    <svg
      className="bank-logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      {account === 'Amex' && (
        <>
          <rect width="32" height="32" rx="8" fill="#016fd0" />
          <rect
            x="3"
            y="9.5"
            width="26"
            height="13"
            rx="1.5"
            fill="none"
            stroke="#fff"
            strokeWidth="0.9"
          />
          <text
            x="16"
            y="19.4"
            textAnchor="middle"
            fill="#fff"
            fontFamily="Arial Black, Arial, Helvetica, sans-serif"
            fontSize="8.6"
            fontWeight="900"
            letterSpacing="-0.2"
          >
            AMEX
          </text>
        </>
      )}
      {account === 'Bank of America' && (
        <>
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="7.5"
            fill="#fff"
            stroke="#d4d9e4"
          />
          <path d="M4.5 13.2 16.5 6.5h11L15.5 13.2Z" fill="#e31837" />
          <path d="M4.5 19.1 16.5 12.4h11L15.5 19.1Z" fill="#e31837" />
          <path d="M4.5 25 16.5 18.3h11L15.5 25Z" fill="#012169" />
        </>
      )}
      {account === 'Capital One' && (
        <>
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
        </>
      )}
    </svg>
  );
}
