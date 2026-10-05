'use client';
import { useState } from 'react';
import {
  comparison,
  groups,
  money,
  monthLabel,
  monthTransactions,
  total,
} from '@/lib/accounting';
import type { TrackerState, Transaction } from '@/lib/model';
import Modal from './Modal';
import TransactionList from './TransactionTable';
import MerchantIcon from './MerchantIcon';
import { CategoryIcon, Delta, Progress, categoryTone } from './ui';
export default function CategoryDetail({
  state,
  month,
  category,
  onClose,
  onEdit,
}: {
  state: TrackerState;
  month: string;
  category: string;
  onClose: () => void;
  onEdit: (t: Transaction) => void;
}) {
  const [merchant, setMerchant] = useState<string | null>(null);
  const tx = monthTransactions(state, month),
    comp = comparison(state, month),
    inCategory = tx.filter((t) => t.category === category);
  const merchants = groups(inCategory, 'merchant');
  for (const prior of groups(
    comp.previousTransactions.filter((t) => t.category === category),
    'merchant',
  ))
    if (!merchants.some((g) => g.name === prior.name))
      merchants.push({ name: prior.name, cents: 0 });
  const largest = Math.max(1, ...merchants.map((m) => m.cents));
  const selected = inCategory.filter(
    (t) => !merchant || t.merchant === merchant,
  );
  const scoped = (list: Transaction[], name: string) =>
    total(list.filter((t) => t.category === category && t.merchant === name));
  return (
    <Modal
      title={`${category} · ${money(total(inCategory))}`}
      wide
      onClose={onClose}
      description={`${monthLabel(month)}. Choose a merchant to see its exact purchases and credits. Changes use the same comparable days as the dashboard.`}
    >
      <div className="detail-head">
        <CategoryIcon name={category} />
        <span>
          {inCategory.length}{' '}
          {inCategory.length === 1 ? 'transaction' : 'transactions'}
          {comp.available && (
            <>
              {' · '}
              <Delta
                current={total(
                  comp.currentTransactions.filter(
                    (t) => t.category === category,
                  ),
                )}
                previous={total(
                  comp.previousTransactions.filter(
                    (t) => t.category === category,
                  ),
                )}
              />{' '}
              vs. {monthLabel(comp.prior)}, days 1–{comp.days}
            </>
          )}
        </span>
      </div>
      <h3 className="section-label">Merchants</h3>
      <ul className="rank-list">
        {merchants.map((g) => (
          <li key={g.name}>
            <button
              type="button"
              className="rank-row"
              aria-pressed={merchant === g.name}
              onClick={() => setMerchant(merchant === g.name ? null : g.name)}
            >
              <MerchantIcon name={g.name} category={category} />
              <span className="rank-name">{g.name}</span>
              <span className="rank-bar">
                <Progress
                  value={g.cents / largest}
                  tone={categoryTone(category)}
                />
              </span>
              <span className="rank-value">{money(g.cents)}</span>
              <span className="rank-delta">
                {comp.available ? (
                  <Delta
                    compact
                    current={scoped(comp.currentTransactions, g.name)}
                    previous={scoped(comp.previousTransactions, g.name)}
                  />
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="section-label">
        {merchant ?? 'All merchants'} · exact transactions
      </h3>
      <TransactionList
        transactions={selected}
        onEdit={(t) => {
          onClose();
          onEdit(t);
        }}
      />
    </Modal>
  );
}
