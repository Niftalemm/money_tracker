import { describe, expect, it } from 'vitest';
import { sankeyData } from '../src/lib/insights';
import { demoState } from '../src/lib/demo';
import { emptyState, uid } from '../src/lib/model';
const sum = (nodes: { cents: number }[]) =>
  nodes.reduce((total, n) => total + n.cents, 0);
describe('cash flow diagram data', () => {
  it('balances income against spending plus what is left over', () => {
    const d = sankeyData(demoState(), '2026-09');
    expect(d.earned).toBe(420000);
    expect(sum(d.sources)).toBe(d.total);
    expect(sum(d.destinations)).toBe(d.total);
    expect(d.destinations.at(-1)).toMatchObject({
      name: 'Left over',
      cents: 420000 - d.spent,
    });
    expect(d.destinations.length).toBeLessThanOrEqual(9);
  });
  it('shows spending beyond recorded income as its own source', () => {
    const d = sankeyData(demoState(), '2026-10');
    expect(d.earned).toBe(0);
    expect(d.sources).toEqual([
      expect.objectContaining({ key: 'gap', cents: d.spent }),
    ]);
    expect(sum(d.destinations)).toBe(d.total);
  });
  it('keeps a category color tied to the category, not its rank', () => {
    const a = sankeyData(demoState(), '2026-09');
    const b = sankeyData(demoState(), '2026-10');
    const color = (d: typeof a, name: string) =>
      d.destinations.find((n) => n.name === name)?.color;
    expect(color(a, 'Groceries')).toBe(color(b, 'Groceries'));
    expect(color(a, 'Groceries')).toBe('var(--series-1)');
  });
  it('is empty when nothing moved', () => {
    expect(sankeyData(emptyState(), '2026-09').total).toBe(0);
    const s = emptyState();
    s.transactions.push({
      id: uid(),
      postedDate: '2026-09-02',
      merchant: 'Card payment',
      amountCents: 5000,
      account: 'Amex',
      category: 'Other',
      type: 'transfer',
      notes: '',
      source: 'manual',
      batchIds: [],
      oneTime: false,
      reimbursementCents: 0,
    });
    expect(sankeyData(s, '2026-09').total).toBe(0);
  });
});
