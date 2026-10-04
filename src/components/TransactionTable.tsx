'use client';
import { ChevronRight } from 'lucide-react';
import { money, net } from '@/lib/accounting';
import type { Transaction } from '@/lib/model';
export default function TransactionTable({
  transactions,
  onEdit,
}: {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
}) {
  if (!transactions.length)
    return <div className="empty-state">No transactions here yet.</div>;
  return (
    <div className="table-wrap">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>Merchant / date</th>
            <th>Account / category</th>
            <th>Amount / type</th>
            <th>
              <span className="sr-only">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>
                <button className="table-link" onClick={() => onEdit(t)}>
                  {t.merchant}
                </button>
                <span className="small muted block">
                  {t.postedDate}
                  {t.purchaseDate ? ` · purchased ${t.purchaseDate}` : ''}
                </span>
              </td>
              <td>
                {t.account}
                <span className="small muted block">{t.category}</span>
              </td>
              <td className="amount">
                {t.type === 'refund' ? '−' : ''}
                {money(t.amountCents)}
                <span className="small muted block">
                  {t.reimbursementFor
                    ? 'Matched reimbursement · excluded'
                    : t.type === 'income' || t.type === 'transfer'
                      ? `${t.type} · excluded`
                      : t.reimbursementCents
                        ? `Personal share ${money(net(t))}`
                        : t.type}
                </span>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Edit ${t.merchant}`}
                  onClick={() => onEdit(t)}
                >
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
