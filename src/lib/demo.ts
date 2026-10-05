import { emptyState, uid, type TrackerState, type Transaction } from './model';
export function demoState(): TrackerState {
  const s = emptyState();
  s.rules = [
    { id: uid(), match: 'Fresh Market', category: 'Groceries' },
    { id: uid(), match: 'Metro', category: 'Transit' },
  ];
  s.preferences.statementDays = {
    Amex: 5,
    'Bank of America': 7,
    'Capital One': 10,
  };
  s.bills = [
    {
      id: 'rent',
      name: 'Apartment rent',
      amountCents: 160000,
      category: 'Housing',
      dueDay: 1,
      confirmedUnpaidMonths: [],
    },
    {
      id: 'internet',
      name: 'Internet',
      amountCents: 6500,
      category: 'Utilities',
      dueDay: 15,
      confirmedUnpaidMonths: [],
    },
  ];
  const add = (
    date: string,
    merchant: string,
    amountCents: number,
    category: string,
    account: Transaction['account'],
    extra: Partial<Transaction> = {},
  ) => {
    s.transactions.push({
      id: uid(),
      postedDate: date,
      merchant,
      amountCents,
      category,
      account,
      type: 'purchase',
      source: 'import',
      batchIds: ['demo'],
      notes: '',
      oneTime: false,
      reimbursementCents: 0,
      ...extra,
    });
  };
  add('2026-09-01', 'Apartment rent', 160000, 'Housing', 'Bank of America', {
    billId: 'rent',
  });
  add('2026-09-03', 'Fresh Market', 8456, 'Groceries', 'Amex');
  add('2026-09-07', 'Fresh Market', 6824, 'Groceries', 'Amex');
  add('2026-09-19', 'Fresh Market', 9200, 'Groceries', 'Capital One');
  add('2026-09-30', 'Fresh Market', 7350, 'Groceries', 'Amex');
  add('2026-09-08', 'Corner Café', 2450, 'Dining', 'Amex');
  add('2026-09-08', 'Corner Café', 2450, 'Dining', 'Amex');
  add('2026-09-22', 'Dinner with friends', 12000, 'Dining', 'Capital One', {
    reimbursementCents: 4000,
  });
  const shared = s.transactions.at(-1)!;
  add(
    '2026-09-23',
    'Shared dinner reimbursement',
    4000,
    'Dining',
    'Bank of America',
    { type: 'income', reimbursementFor: shared.id },
  );
  add('2026-09-10', 'Metro pass', 13200, 'Transit', 'Capital One');
  add('2026-09-15', 'Internet', 6500, 'Utilities', 'Bank of America', {
    billId: 'internet',
  });
  add('2026-09-17', 'Streaming', 1599, 'Subscriptions', 'Amex');
  add('2026-09-20', 'Desk lamp', 6900, 'Shopping', 'Capital One', {
    oneTime: true,
  });
  add('2026-09-25', 'Desk lamp return', 2000, 'Shopping', 'Capital One', {
    type: 'refund',
  });
  add('2026-09-26', 'Pharmacy', 1840, 'Health', 'Amex');
  add('2026-09-28', 'Neighborhood store', 1800, 'Uncategorized', 'Amex');
  add('2026-09-29', 'Amex card payment', 60000, 'Other', 'Bank of America', {
    type: 'transfer',
  });
  add('2026-09-30', 'Salary', 420000, 'Other', 'Bank of America', {
    type: 'income',
  });
  add('2026-10-01', 'Apartment rent', 160000, 'Housing', 'Bank of America', {
    billId: 'rent',
  });
  add('2026-10-02', 'Fresh Market', 9250, 'Groceries', 'Amex');
  add('2026-10-03', 'Corner Café', 2800, 'Dining', 'Capital One');
  s.coverage = ['Amex', 'Bank of America', 'Capital One'].flatMap((account) => [
    {
      id: uid(),
      account: account as Transaction['account'],
      from: '2026-09-01',
      through: '2026-09-30',
      batchId: 'demo',
    },
    {
      id: uid(),
      account: account as Transaction['account'],
      from: '2026-10-01',
      through: '2026-10-03',
      batchId: 'demo',
    },
  ]);
  s.batches = [
    {
      id: 'demo',
      account: 'Amex',
      importedAt: '2026-10-04T16:00:00Z',
      added: s.transactions.length,
      duplicates: 0,
    },
  ];
  s.updatedAt = '2026-10-04T16:00:00Z';
  return s;
}
