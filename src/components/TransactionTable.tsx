'use client';
import { ChevronRight, Inbox } from 'lucide-react';
import { money, net } from '@/lib/accounting';
import { dayGroups, shortDate } from '@/lib/insights';
import type { Transaction } from '@/lib/model';
import { CategoryIcon, EmptyState, MerchantAvatar } from './ui';
function typeLabel(t: Transaction) {
  if (t.reimbursementFor) return 'Matched reimbursement · excluded';
  if (t.type === 'income') return 'Income · excluded';
  if (t.type === 'transfer') return 'Transfer · excluded';
  if (t.type === 'refund') return 'Refund · reduces spending';
  if (t.reimbursementCents) return `Personal share ${money(net(t))}`;
  return t.oneTime ? 'One-time purchase' : 'Purchase';
}
function Row({
  t,
  showDate,
  onEdit,
}: {
  t: Transaction;
  showDate: boolean;
  onEdit: (t: Transaction) => void;
}) {
  const credit = t.type === 'refund' || t.type === 'income',
    tone =
      t.type === 'transfer' || t.reimbursementFor
        ? 'muted'
        : credit
          ? 'credit'
          : '';
  const amount = `${credit ? '+' : ''}${money(t.amountCents)}`,
    detail = typeLabel(t);
  return (
    <li>
      <button
        type="button"
        className="tx-row"
        aria-label={`Edit ${t.merchant}`}
        aria-describedby={`tx-${t.id}`}
        onClick={() => onEdit(t)}
      >
        <MerchantAvatar name={t.merchant} category={t.category} />
        <span className="tx-main">
          <span className="tx-merchant">{t.merchant}</span>
          <span className="tx-meta">
            <span className="tx-meta-category">
              <CategoryIcon name={t.category} size="sm" />
              {t.category}
            </span>
            <span className="tx-meta-account">{t.account}</span>
            {showDate && (
              <span className="tx-meta-date">{shortDate(t.postedDate)}</span>
            )}
          </span>
        </span>
        <span className={`tx-amount ${tone}`}>
          <span className="tx-value">{amount}</span>
          <span className="tx-type">{detail}</span>
        </span>
        <ChevronRight size={16} className="tx-chevron" aria-hidden />
        <span className="sr-only" id={`tx-${t.id}`}>
          {`${t.postedDate}${t.purchaseDate ? `, purchased ${t.purchaseDate}` : ''}, ${t.account}, ${t.category}, ${amount}, ${detail}`}
        </span>
      </button>
    </li>
  );
}
export default function TransactionList({
  transactions,
  onEdit,
  grouped = false,
  empty,
}: {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
  grouped?: boolean;
  empty?: React.ReactNode;
}) {
  if (!transactions.length)
    return (
      <>
        {empty ?? <EmptyState icon={Inbox} title="No transactions here yet." />}
      </>
    );
  if (!grouped)
    return (
      <ul className="tx-list">
        {[...transactions]
          .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
          .map((t) => (
            <Row key={t.id} t={t} showDate onEdit={onEdit} />
          ))}
      </ul>
    );
  return (
    <div className="tx-groups">
      {dayGroups(transactions).map((g) => (
        <section key={g.date} className="tx-day" aria-label={shortDate(g.date)}>
          <div className="tx-day-head">
            <span>{shortDate(g.date)}</span>
            {g.net !== 0 && (
              <span className="tx-day-total">
                {g.net > 0
                  ? `${money(g.net)} spent`
                  : `${money(-g.net)} credited`}
              </span>
            )}
          </div>
          <ul className="tx-list">
            {g.transactions.map((t) => (
              <Row key={t.id} t={t} showDate={false} onEdit={onEdit} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
