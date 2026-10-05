'use client';
import { useEffect, useRef, useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { money } from '@/lib/accounting';
import { sankeyData, type SankeyNode as Node } from '@/lib/insights';
import type { TrackerState } from '@/lib/model';
import { EmptyState } from './ui';
// Income on the left flows through the month into spending categories and,
// when income exceeds spending, "Left over". Colors follow the category
// (its position in your category list), never its rank; every node is
// labeled, so identity never depends on color alone.
const clip = (text: string, max: number) =>
  text.length > max ? text.slice(0, max - 1) + '…' : text;
function ribbon(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h0: number,
  h1: number,
) {
  const mid = (x0 + x1) / 2;
  return `M${x0},${y0}C${mid},${y0} ${mid},${y1} ${x1},${y1}L${x1},${y1 + h1}C${mid},${y1 + h1} ${mid},${y0 + h0} ${x0},${y0 + h0}Z`;
}
export default function CashFlowSankey({
  state,
  month,
  onCategory,
}: {
  state: TrackerState;
  month: string;
  onCategory: (category: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720),
    [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const data = sankeyData(state, month);
  if (!data.total)
    return (
      <EmptyState icon={ChartColumn} title="Nothing flowing yet">
        Income and spending for this month will appear as a flow diagram.
      </EmptyState>
    );
  const narrow = width < 560,
    nodeW = narrow ? 8 : 12,
    gap = narrow ? 10 : 12,
    leftLabel = narrow ? 92 : 168,
    rightLabel = narrow ? 112 : 196,
    chars = narrow ? 14 : 24;
  // Flow thickness uses one scale; each node also reserves a label-sized slot
  // so small categories never collide.
  const k = (narrow ? 220 : 260) / data.total,
    slot = narrow ? 34 : 36;
  const xL = leftLabel,
    xC = Math.round(width / 2 - nodeW / 2),
    xR = width - rightLabel - nodeW;
  const place = (nodes: Node[]) => {
    let y = 0;
    const placed = nodes.map((n) => {
      const h = n.cents * k,
        room = Math.max(h, slot),
        at = y + (room - h) / 2;
      y += room + gap;
      return { ...n, y: at, h };
    });
    return { placed, used: y - gap };
  };
  const L = place(data.sources),
    R = place(data.destinations),
    centerH = data.total * k;
  const height = Math.ceil(Math.max(L.used, R.used, centerH) + 28);
  const shift = (col: ReturnType<typeof place>) =>
    col.placed.map((n) => ({ ...n, y: n.y + (height - col.used) / 2 }));
  const centerY = (height - centerH) / 2;
  const stack = (nodes: Node[]) => shift(nodes === data.sources ? L : R);
  const left = stack(data.sources),
    right = stack(data.destinations);
  let inY = centerY,
    outY = centerY;
  const inLinks = left.map((n) => {
      const link = { ...n, cy: inY };
      inY += n.h;
      return link;
    }),
    outLinks = right.map((n) => {
      const link = { ...n, cy: outY };
      outY += n.h;
      return link;
    });
  const all = [...left, ...right];
  const focus = all.find((n) => n.key === active);
  const pct = (cents: number) =>
    data.earned
      ? ` · ${Math.round((cents / data.earned) * 100)}% of income`
      : '';
  const readout = focus
    ? `${focus.name}: ${money(focus.cents)}${focus.key.startsWith('in-') || focus.key === 'gap' ? '' : pct(focus.cents)}`
    : `${money(data.earned)} recorded income · ${money(data.spent)} spent by category`;
  const dim = (key: string) => (active && active !== key ? ' dim' : '');
  const label = (n: Node, side: 'left' | 'right', y: number, h: number) => {
    const x = side === 'left' ? xL - 10 : xR + nodeW + 10,
      anchor = side === 'left' ? 'end' : 'start',
      cy = y + h / 2;
    return (
      <text
        x={x}
        y={cy}
        textAnchor={anchor}
        className={'sankey-label' + dim(n.key)}
      >
        <tspan x={x} dy="-0.25em">
          {clip(n.name, chars)}
        </tspan>
        <tspan x={x} dy="1.25em" className="sankey-amount">
          {money(n.cents)}
        </tspan>
      </text>
    );
  };
  return (
    <div className="sankey" ref={box}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Cash flow for the month: ${data.sources.map((n) => `${n.name} ${money(n.cents)}`).join(', ')} flowing to ${data.destinations.map((n) => `${n.name} ${money(n.cents)}`).join(', ')}.`}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          {[...inLinks, ...outLinks].map((n) => (
            <linearGradient key={n.key} id={`g-${n.key.replace(/\W/g, '')}`}>
              <stop
                offset="0"
                style={{
                  stopColor:
                    n.key.startsWith('in-') || n.key === 'gap'
                      ? n.color
                      : 'var(--flow-income)',
                }}
              />
              <stop
                offset="1"
                style={{
                  stopColor:
                    n.key.startsWith('in-') || n.key === 'gap'
                      ? 'var(--flow-income)'
                      : n.color,
                }}
              />
            </linearGradient>
          ))}
        </defs>
        {inLinks.map((n, i) => (
          <path
            key={n.key}
            className={'sankey-link' + dim(n.key)}
            d={ribbon(xL + nodeW, n.y, xC, n.cy, n.h, n.h)}
            style={{
              fill: `url(#g-${n.key.replace(/\W/g, '')})`,
              animationDelay: `${i * 60}ms`,
            }}
            onMouseEnter={() => setActive(n.key)}
            onClick={() => setActive(active === n.key ? null : n.key)}
          />
        ))}
        {outLinks.map((n, i) => (
          <path
            key={n.key}
            className={'sankey-link' + dim(n.key)}
            d={ribbon(xC + nodeW, n.cy, xR, n.y, n.h, n.h)}
            style={{
              fill: `url(#g-${n.key.replace(/\W/g, '')})`,
              animationDelay: `${120 + i * 60}ms`,
            }}
            onMouseEnter={() => setActive(n.key)}
            onClick={() => setActive(active === n.key ? null : n.key)}
          />
        ))}
        <rect
          x={xC}
          y={centerY}
          width={nodeW}
          height={Math.max(2, centerH)}
          rx={nodeW / 2}
          className="sankey-center"
        />
        <text
          x={narrow ? xC + nodeW : xC + nodeW / 2}
          y={Math.max(12, centerY - 10)}
          textAnchor={narrow ? 'end' : 'middle'}
          className="sankey-label sankey-center-label"
        >
          {money(data.total)}
        </text>
        {left.map((n) => (
          <g
            key={n.key}
            onMouseEnter={() => setActive(n.key)}
            onClick={() => setActive(active === n.key ? null : n.key)}
          >
            <rect
              x={xL}
              y={n.y}
              width={nodeW}
              height={Math.max(2, n.h)}
              rx={nodeW / 2}
              className={'sankey-node' + dim(n.key)}
              style={{ fill: n.color }}
            />
            {label(n, 'left', n.y, n.h)}
          </g>
        ))}
        {right.map((n) => (
          <g
            key={n.key}
            className={n.category ? 'sankey-target' : undefined}
            role={n.category ? 'button' : undefined}
            tabIndex={n.category ? 0 : undefined}
            aria-label={
              n.category
                ? `${n.name}, ${money(n.cents)}. Open category details`
                : undefined
            }
            onMouseEnter={() => setActive(n.key)}
            onFocus={() => setActive(n.key)}
            onBlur={() => setActive(null)}
            onClick={() =>
              n.category ? onCategory(n.category) : setActive(n.key)
            }
            onKeyDown={(e) => {
              if (n.category && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onCategory(n.category);
              }
            }}
          >
            <rect
              x={xR - 4}
              y={n.y - gap / 2}
              width={rightLabel + nodeW + 4}
              height={n.h + gap}
              className="sankey-hit"
            />
            <rect
              x={xR}
              y={n.y}
              width={nodeW}
              height={Math.max(2, n.h)}
              rx={nodeW / 2}
              className={'sankey-node' + dim(n.key)}
              style={{ fill: n.color }}
            />
            {label(n, 'right', n.y, n.h)}
          </g>
        ))}
      </svg>
      <p className="sankey-readout" aria-live="polite">
        {readout}
      </p>
    </div>
  );
}
