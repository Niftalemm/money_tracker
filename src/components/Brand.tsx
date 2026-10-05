import { useId } from 'react';
// A leaf whose vein doubles as a rising trend line: growth, kept private.
export function BrandMark({ size = 32 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`bm-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a9d6f" />
          <stop offset="1" stopColor="#14563f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#bm-${id})`} />
      <path
        d="M8.5 23.5C8.5 14.6 14.2 8.5 23.5 8.5c0 9.2-6 15-15 15Z"
        fill="#fff"
      />
      <path
        d="M10.6 21.4l4.3-4.3 2.6 1.9 3.6-5.2"
        fill="none"
        stroke="#1c7352"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'brand compact' : 'brand'}>
      <BrandMark size={compact ? 30 : 34} />
      <span className="brand-name">
        Money <span>Tracker</span>
      </span>
    </span>
  );
}
