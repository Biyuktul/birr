import { describe, it, expect } from 'vitest';
import { makeDefaultData } from '../src/lib/defaults';
import { makeEngine } from '../src/lib/engine';
import { setAccountBalance, lendMoney } from '../src/lib/actions';
import type { Data, Txn } from '../src/lib/types';

/* Today is a Tuesday, deliberately mid-week and mid-month. */
const TODAY = '2026-10-27';

function base(): Data {
  const d = makeDefaultData(TODAY);
  d.meta.asOf = TODAY;
  d.accounts = d.accounts.map(a => ({ ...a, openingDate: '2026-01-01' }));
  d.transactions = [];
  return d;
}

function spend(d: Data, date: string, amount: number, category: string, extra: Partial<Txn> = {}): Data {
  return {
    ...d,
    transactions: [...d.transactions, {
      id: 'x' + d.transactions.length, date, accountId: 'cbe',
      amount: -Math.abs(amount), category, note: category,
      isTransfer: false, source: 'manual' as const, ...extra,
    }],
  };
}

describe('what you have actually spent', () => {
  it('totals a single day', () => {
    let d = base();
    d = spend(d, TODAY, 100, 'Groceries');
    d = spend(d, TODAY, 50, 'Transport');
    const r = makeEngine(d).spendingReport('day', 14);
    expect(r.selected.total).toBe(150);
    expect(r.selected.current).toBe(true);
  });

  it('keeps days apart', () => {
    let d = base();
    d = spend(d, '2026-10-26', 300, 'Groceries');
    d = spend(d, TODAY, 100, 'Groceries');
    const r = makeEngine(d).spendingReport('day', 14);
    expect(r.selected.total).toBe(100);          // today
    expect(r.previousTotal).toBe(300);           // yesterday
    expect(r.change).toBe(-200);
  });

  it('groups a week from Monday to Sunday', () => {
    let d = base();
    d = spend(d, '2026-10-26', 100, 'Groceries');   // Monday
    d = spend(d, '2026-11-01', 50, 'Groceries');    // the Sunday
    d = spend(d, '2026-11-02', 999, 'Groceries');   // next Monday — a different week
    const r = makeEngine(d).spendingReport('week', 12);
    expect(r.selected.from).toBe('2026-10-26');
    expect(r.selected.to).toBe('2026-11-01');
    expect(r.selected.total).toBe(150);
  });

  it('groups a month from the 1st to the last day', () => {
    let d = base();
    d = spend(d, '2026-10-01', 100, 'Child');
    d = spend(d, '2026-10-31', 200, 'Child');
    d = spend(d, '2026-09-30', 999, 'Child');       // September
    const r = makeEngine(d).spendingReport('month', 12);
    expect(r.selected.from).toBe('2026-10-01');
    expect(r.selected.to).toBe('2026-10-31');
    expect(r.selected.total).toBe(300);
  });

  it('answers "what do the children cost me a month"', () => {
    let d = base();
    d = spend(d, '2026-08-05', 1200, 'Child');
    d = spend(d, '2026-09-05', 800, 'Child');
    d = spend(d, '2026-10-05', 1000, 'Child');
    d = spend(d, '2026-10-06', 400, 'Groceries');   // not the children
    const months = makeEngine(d).categoryOverTime('Child', 'month', 12);
    const byLabel = Object.fromEntries(months.map(m => [m.from, m.total]));
    expect(byLabel['2026-08-01']).toBe(1200);
    expect(byLabel['2026-09-01']).toBe(800);
    expect(byLabel['2026-10-01']).toBe(1000);
  });

  it('ranks categories by what they cost, with their share', () => {
    let d = base();
    d = spend(d, TODAY, 600, 'Child');
    d = spend(d, TODAY, 300, 'Groceries');
    d = spend(d, TODAY, 100, 'Transport');
    const r = makeEngine(d).spendingReport('day', 14);
    expect(r.categories.map(c => c.category)).toEqual(['Child', 'Groceries', 'Transport']);
    expect(r.categories[0].share).toBeCloseTo(0.6, 5);
  });

  it('files anything uncategorised under Other rather than losing it', () => {
    const d = spend(base(), TODAY, 250, null as unknown as string);
    const r = makeEngine(d).spendingReport('day', 14);
    expect(r.selected.total).toBe(250);
    expect(r.categories[0].category).toBe('Other');
  });

  /* ---- the things that are NOT spending ---- */

  it('ignores money moved between your own accounts', () => {
    const d = spend(base(), TODAY, 5000, 'Other', { isTransfer: true });
    expect(makeEngine(d).spendingReport('day', 14).selected.total).toBe(0);
  });

  it('ignores a balance correction', () => {
    const d0 = base();
    const d = setAccountBalance(d0, 'cbe', 1);     // a big downward correction
    expect(makeEngine(d).spendingReport('day', 14).selected.total).toBe(0);
  });

  it('ignores money lent out — you expect it back', () => {
    const d = lendMoney(base(), { person: 'Abebe', amount: 4000, accountId: 'cbe', lentOn: TODAY });
    expect(makeEngine(d).spendingReport('day', 14).selected.total).toBe(0);
  });

  it('ignores money coming in', () => {
    const d0 = base();
    const d: Data = { ...d0, transactions: [{
      id: 'in', date: TODAY, accountId: 'cbe', amount: 28000,
      category: null, note: 'salary', isTransfer: false, source: 'manual',
    }] };
    expect(makeEngine(d).spendingReport('day', 14).selected.total).toBe(0);
  });

  it('agrees with the budget screen about the month', () => {
    let d = base();
    d = spend(d, '2026-10-10', 700, 'Groceries');
    d = spend(d, '2026-10-20', 300, 'Groceries');
    const e = makeEngine(d);
    const fromReport = e.spendingReport('month', 12).selected.byCategory['Groceries'];
    const fromBudget = e.budgetStatus('2026-10').find(r => r.category === 'Groceries')!.spent;
    expect(fromReport).toBe(fromBudget);
  });

  /* ---- shape of the report ---- */

  it('returns exactly the number of periods asked for, oldest first', () => {
    const r = makeEngine(base()).spendingReport('month', 12);
    expect(r.periods).toHaveLength(12);
    expect(r.periods[11].current).toBe(true);
    for (let i = 1; i < r.periods.length; i++) {
      expect(r.periods[i].from > r.periods[i - 1].from).toBe(true);
    }
  });

  it('says plainly when nothing has been recorded', () => {
    const r = makeEngine(base()).spendingReport('month', 12);
    expect(r.empty).toBe(true);
    expect(r.selected.total).toBe(0);
    expect(r.categories).toHaveLength(0);
    expect(r.average).toBe(0);
  });

  it('averages only the periods with spending, not the empty ones', () => {
    let d = base();
    d = spend(d, '2026-10-05', 1000, 'Child');
    d = spend(d, '2026-09-05', 2000, 'Child');
    const r = makeEngine(d).spendingReport('month', 12);
    expect(r.average).toBe(1500);            // not 3000/12
  });

  it('can look back at an earlier period', () => {
    let d = base();
    d = spend(d, '2026-09-05', 2000, 'Child');
    const e = makeEngine(d);
    const r = e.spendingReport('month', 12, '2026-09-01');
    expect(r.selected.total).toBe(2000);
    expect(r.selected.current).toBe(false);
  });

  it('can open up any figure into the transactions behind it', () => {
    let d = base();
    d = spend(d, '2026-10-05', 600, 'Child');
    d = spend(d, '2026-10-06', 400, 'Child');
    d = spend(d, '2026-10-06', 999, 'Groceries');
    const rows = makeEngine(d).spendingIn('2026-10-01', '2026-10-31', 'Child');
    expect(rows).toHaveLength(2);
    expect(rows.reduce((t, r) => t + Math.abs(r.amount), 0)).toBe(1000);
  });
});
