import { describe, it, expect } from 'vitest';
import { makeDefaultData } from '../src/lib/defaults';
import { makeEngine } from '../src/lib/engine';
import {
  payEkubRound, unpayEkubRound, setEkubRoundAmount, setEkubRoundDate, setAccountBalance,
  payLoan, unpayLoan,
  lendMoney, recordRepayment, removeRepayment, removeLending,
} from '../src/lib/actions';
import type { Data } from '../src/lib/types';

/** A clean slate with no rounds recorded yet. */
function fresh(): Data {
  const d = makeDefaultData('2026-10-25');
  d.meta.asOf = '2026-10-25';
  d.ekub.contributionsPaid = [];
  return d;
}
const bal = (d: Data, id = d.ekub.accountId) => makeEngine(d).accountBalance(id);
const total = (d: Data) => makeEngine(d).combinedBalance();

describe('paying an Ekub round', () => {
  it('takes the money out of the account the Ekub is paid from', () => {
    const d0 = fresh();
    const before = bal(d0);
    const d1 = payEkubRound(d0, { round: 1, date: '2026-10-25' });
    expect(bal(d1)).toBe(before - d0.ekub.contributionAmount);
  });

  it('comes off "everything you have" too', () => {
    const d0 = fresh();
    const before = total(d0);
    const d1 = payEkubRound(d0, { round: 1, date: '2026-10-25' });
    expect(total(d1)).toBe(before - d0.ekub.contributionAmount);
  });

  it('advances the cycle as well as moving the money', () => {
    const d1 = payEkubRound(fresh(), { round: 1, date: '2026-10-25' });
    const k = makeEngine(d1).ekubStatus();
    expect(k.paidCount).toBe(1);
    expect(k.nextRound).toBe(2);
  });

  it('refuses to pay the same round twice', () => {
    const d1 = payEkubRound(fresh(), { round: 1, date: '2026-10-25' });
    const d2 = payEkubRound(d1, { round: 1, date: '2026-10-25' });
    expect(d2.transactions.length).toBe(d1.transactions.length);
    expect(makeEngine(d2).ekubStatus().paidCount).toBe(1);
  });

  it('honours an amount that differed from the usual one', () => {
    const d0 = fresh();
    const before = bal(d0);
    const d1 = payEkubRound(d0, { round: 1, date: '2026-10-25', amount: 1234 });
    expect(bal(d1)).toBe(before - 1234);
    expect(makeEngine(d1).ekubStatus().contributedSoFar).toBe(1234);
  });

  it('counts what was actually paid, not the nominal amount times the count', () => {
    let d = fresh();
    d = payEkubRound(d, { round: 1, date: '2026-09-10', amount: 1000 });
    d = payEkubRound(d, { round: 2, date: '2026-10-10', amount: 2000 });
    expect(makeEngine(d).ekubStatus().contributedSoFar).toBe(3000);
  });

  it('lets rounds be paid out of order and still finds the gap', () => {
    let d = fresh();
    d = payEkubRound(d, { round: 1, date: '2026-09-10' });
    d = payEkubRound(d, { round: 3, date: '2026-11-10' });
    expect(makeEngine(d).ekubStatus().nextRound).toBe(2);   // the hole, not 4
  });

  it('is not counted as spending in the budget', () => {
    const d = payEkubRound(fresh(), { round: 1, date: '2026-10-25' });
    const row = makeEngine(d).budgetStatus('2026-10').find(r => r.category === 'Ekub');
    // Ekub has no cap by default, so it must not land in another category
    const other = makeEngine(d).budgetStatus('2026-10').find(r => r.category === 'Other');
    expect(other?.spent ?? 0).toBe(0);
    expect(row === undefined || row.spent === 3000).toBe(true);
  });
});

describe('undoing an Ekub round', () => {
  it('puts the money back exactly', () => {
    const d0 = fresh();
    const before = bal(d0);
    const d1 = payEkubRound(d0, { round: 1, date: '2026-10-25' });
    const d2 = unpayEkubRound(d1, 1);
    expect(bal(d2)).toBe(before);
    expect(makeEngine(d2).ekubStatus().paidCount).toBe(0);
  });

  it('removes only its own payment, leaving other rounds alone', () => {
    let d = fresh();
    // both dated after the opening balance, so both genuinely move money
    d = payEkubRound(d, { round: 1, date: '2026-10-20' });
    d = payEkubRound(d, { round: 2, date: '2026-10-24' });
    const afterTwo = bal(d);
    d = unpayEkubRound(d, 1);
    expect(bal(d)).toBe(afterTwo + 3000);
    expect(makeEngine(d).ekubStatus().paidCount).toBe(1);
  });

  it('a round dated before the opening balance does not move it — by design', () => {
    // The opening figure is what the account held on its opening date, so it
    // already reflects anything paid before then. Subtracting again would
    // count it twice. The Ekub screen warns when a date falls here.
    const d0 = fresh();
    const opening = d0.accounts.find(a => a.id === d0.ekub.accountId)!.openingDate;
    const before = bal(d0);
    const d1 = payEkubRound(d0, { round: 1, date: '2026-01-01' });
    expect(d1.ekub.contributionsPaid).toHaveLength(1);   // still recorded
    expect(opening > '2026-01-01').toBe(true);
    expect(bal(d1)).toBe(before);                        // but the balance stands
  });

  it('leaves rounds recorded before money movement existed alone', () => {
    // data saved by an older version: a round with no transaction behind it
    const d0 = fresh();
    d0.ekub.contributionsPaid = [{ round: 1, date: '2026-09-10' }];
    const before = d0.transactions.length;
    const d1 = unpayEkubRound(d0, 1);
    expect(d1.transactions.length).toBe(before);
    expect(makeEngine(d1).ekubStatus().paidCount).toBe(0);
  });
});

describe('changing a recorded round', () => {
  it('keeps the money movement in step with a changed amount', () => {
    const d0 = fresh();
    const before = bal(d0);
    let d = payEkubRound(d0, { round: 1, date: '2026-10-25' });
    d = setEkubRoundAmount(d, 1, 500);
    expect(bal(d)).toBe(before - 500);
  });

  it('keeps the money movement in step with a changed date', () => {
    let d = payEkubRound(fresh(), { round: 1, date: '2026-10-25' });
    d = setEkubRoundDate(d, 1, '2026-10-20');
    const tx = d.transactions.find(t => t.note?.includes('round 1'));
    expect(tx?.date).toBe('2026-10-20');
  });
});

describe('correcting an account balance', () => {
  it('makes the account read exactly what was entered', () => {
    const d = setAccountBalance(fresh(), 'telebirr', 2000);
    expect(bal(d, 'telebirr')).toBe(2000);
  });

  it('works downwards as well as upwards', () => {
    const d = setAccountBalance(fresh(), 'cbe', 50);
    expect(bal(d, 'cbe')).toBe(50);
  });

  it('moves the overall total by the same difference, and nothing else', () => {
    const d0 = fresh();
    const before = total(d0);
    const was = bal(d0, 'telebirr');
    const d1 = setAccountBalance(d0, 'telebirr', 2000);
    expect(total(d1)).toBe(before + (2000 - was));
    // every other account untouched
    for (const a of d0.accounts.filter(x => x.id !== 'telebirr')) {
      expect(bal(d1, a.id)).toBe(bal(d0, a.id));
    }
  });

  it('keeps the history instead of overwriting it', () => {
    const d0 = fresh();
    const d1 = setAccountBalance(d0, 'telebirr', 2000);
    expect(d1.accounts).toEqual(d0.accounts);        // opening figures untouched
    expect(d1.transactions.length).toBe(d0.transactions.length + 1);
    expect(d1.transactions.at(-1)!.isAdjustment).toBe(true);
  });

  it('is not mistaken for spending', () => {
    const d = setAccountBalance(fresh(), 'cbe', 1);   // a big drop
    const rows = makeEngine(d).budgetStatus('2026-10');
    expect(rows.every(r => r.spent === 0)).toBe(true);
  });

  it('books nothing when the figure already matches', () => {
    const d0 = fresh();
    const d1 = setAccountBalance(d0, 'cbe', bal(d0, 'cbe'));
    expect(d1.transactions.length).toBe(d0.transactions.length);
    expect(d1.recon['cbe']).toBe(bal(d0, 'cbe'));    // but it records that it was checked
  });

  it('reconciles clean straight afterwards', () => {
    const d = setAccountBalance(fresh(), 'telebirr', 2000);
    expect(makeEngine(d).reconcile('telebirr', 2000).clean).toBe(true);
  });

  it('ignores an account that does not exist', () => {
    const d0 = fresh();
    expect(setAccountBalance(d0, 'nope', 999)).toBe(d0);
  });
});

describe('recording a loan payment', () => {
  /** Balance confirmed today, which is what Setup records when you edit it. */
  function withLoan(): Data {
    const d = fresh();
    d.loan.balance = 78557;
    d.loan.balanceAsOf = '2026-10-25';
    d.loan.manualPayments = [];
    d.loan.accountId = 'cbe';
    return d;
  }
  const owed = (d: Data) => makeEngine(d).loanOutstanding();

  it('a payment made the same day the balance was confirmed still counts', () => {
    // the regression: "strictly after" swallowed same-day payments, which is
    // the ordinary case — you check the balance and pay it the same day
    const d0 = withLoan();
    const d1 = payLoan(d0, { date: '2026-10-25', amount: 5000 });
    expect(owed(d1)).toBe(owed(d0) - 5000);
  });

  it('takes the money out of the account it was paid from', () => {
    const d0 = withLoan();
    const before = bal(d0, 'cbe');
    const d1 = payLoan(d0, { date: '2026-10-25', amount: 5000 });
    expect(bal(d1, 'cbe')).toBe(before - 5000);
  });

  it('comes off "everything you have" as well as off the debt', () => {
    const d0 = withLoan();
    const beforeTotal = total(d0);
    const d1 = payLoan(d0, { date: '2026-10-25', amount: 5000 });
    expect(total(d1)).toBe(beforeTotal - 5000);
    expect(owed(d1)).toBe(73557);
  });

  it('can be paid from any account, not only the loan default', () => {
    const d0 = withLoan();
    const before = bal(d0, 'telebirr');
    const d1 = payLoan(d0, { date: '2026-10-25', amount: 400, accountId: 'telebirr' });
    expect(bal(d1, 'telebirr')).toBe(before - 400);
    expect(bal(d1, 'cbe')).toBe(bal(d0, 'cbe'));
  });

  it('every screen reads the same reduced figure', () => {
    const d1 = payLoan(withLoan(), { date: '2026-10-25', amount: 5000 });
    const e = makeEngine(d1);
    expect(e.loanSchedule().startingBalance).toBe(e.loanOutstanding());
  });

  it('a future-dated payment is still owed, and still in the account, until the day', () => {
    const d0 = withLoan();
    const beforeBank = bal(d0, 'cbe');
    const d1 = payLoan(d0, { date: '2026-12-01', amount: 5000 });
    expect(owed(d1)).toBe(owed(d0));          // not yet off the debt
    expect(bal(d1, 'cbe')).toBe(beforeBank);  // not yet out of the bank
    expect(makeEngine(d1).loanPayments().plannedAhead).toBe(5000);
  });

  it('a payment before the confirmed date is not subtracted twice', () => {
    const d0 = withLoan();
    const d1 = payLoan(d0, { date: '2026-10-01', amount: 5000 });   // before balanceAsOf
    expect(owed(d1)).toBe(owed(d0));
  });

  it('several payments add up', () => {
    let d = withLoan();
    d = payLoan(d, { date: '2026-10-25', amount: 1000 });
    d = payLoan(d, { date: '2026-10-25', amount: 2500 });
    expect(owed(d)).toBe(78557 - 3500);
  });

  it('a payment dated tomorrow is not counted as paid yet', () => {
    const d0 = withLoan();
    const d1 = payLoan(d0, { date: '2026-10-26', amount: 2500 });   // asOf is the 25th
    expect(owed(d1)).toBe(owed(d0));
    expect(makeEngine(d1).loanPayments().plannedAhead).toBe(2500);
  });

  it('undoing puts it back on the debt and back in the account', () => {
    const d0 = withLoan();
    const bankBefore = bal(d0, 'cbe');
    const d1 = payLoan(d0, { date: '2026-10-25', amount: 5000 });
    const id = d1.loan.manualPayments.at(-1)!.id;
    const d2 = unpayLoan(d1, id);
    expect(owed(d2)).toBe(owed(d0));
    expect(bal(d2, 'cbe')).toBe(bankBefore);
    expect(d2.loan.manualPayments).toHaveLength(0);
  });

  it('leaves payments recorded before money movement existed alone', () => {
    const d0 = withLoan();
    d0.loan.manualPayments = [{ id: 'old', date: '2026-10-25', amount: 5000 }];
    const txBefore = d0.transactions.length;
    const d1 = unpayLoan(d0, 'old');
    expect(d1.transactions.length).toBe(txBefore);
    expect(d1.loan.manualPayments).toHaveLength(0);
  });

  it('refuses a zero, negative or nonsense amount instead of guessing', () => {
    const d0 = withLoan();
    for (const bad of [0, -100, NaN]) {
      const r = payLoan(d0, { date: '2026-10-25', amount: bad });
      expect(r.loan.manualPayments).toHaveLength(0);
      expect(r.transactions.length).toBe(d0.transactions.length);
    }
  });
});

describe('messages waiting to be confirmed', () => {
  it('are raised on the attention list, now that the tab is gone', () => {
    const d = fresh();
    d.inbox = [{
      id: 'm1', raw: 'debited with ETB 50', sender: 'CBE', provider: 'CBE',
      providerLabel: 'CBE', direction: 'debit', amount: 50, signedAmount: -50,
      statedBalance: null, counterparty: null, accountDigits: null, accountId: 'cbe',
      category: null, date: '2026-10-25', ref: null, looksLikeTransfer: false,
      confidence: 0.8, missing: [], needsReview: false,
    }];
    const a = makeEngine(d).alerts().find(x => /bank message/i.test(x.text));
    expect(a).toBeDefined();
    expect(a!.action?.route).toBe('inbox');
  });

  it('say nothing when the inbox is empty', () => {
    expect(makeEngine(fresh()).alerts().some(x => /bank message/i.test(x.text))).toBe(false);
  });

  it('do not touch any balance until confirmed', () => {
    const d0 = fresh();
    const before = total(d0);
    const d1: Data = {
      ...d0,
      inbox: [{
        id: 'm2', raw: 'debited with ETB 9999', sender: 'CBE', provider: 'CBE',
        providerLabel: 'CBE', direction: 'debit', amount: 9999, signedAmount: -9999,
        statedBalance: null, counterparty: null, accountDigits: null, accountId: 'cbe',
        category: null, date: '2026-10-25', ref: null, looksLikeTransfer: false,
        confidence: 0.9, missing: [], needsReview: false,
      }],
    };
    expect(total(d1)).toBe(before);           // a pending message moves nothing
    expect(d1.transactions).toEqual(d0.transactions);
  });
});

describe('money you lend to someone', () => {
  const L = (d: Data) => makeEngine(d).lendingStatus();

  it('leaves the account it was lent from', () => {
    const d0 = fresh();
    const before = bal(d0, 'cbe');
    const d1 = lendMoney(d0, { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-10-25' });
    expect(bal(d1, 'cbe')).toBe(before - 2000);
  });

  it('is not counted as money you have, but is counted as owed to you', () => {
    const d0 = fresh();
    const beforeTotal = total(d0);
    const d1 = lendMoney(d0, { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-10-25' });
    expect(total(d1)).toBe(beforeTotal - 2000);      // gone from spendable
    expect(L(d1).outstanding).toBe(2000);            // but tracked as owed back
  });

  it('is not spending — it stays out of the budget', () => {
    const d1 = lendMoney(fresh(), { person: 'Abebe', amount: 2000, accountId: 'cash', lentOn: '2026-10-25' });
    expect(makeEngine(d1).budgetStatus('2026-10').every(r => r.spent === 0)).toBe(true);
  });

  it('records who, from where, and when it is due back', () => {
    const d1 = lendMoney(fresh(), {
      person: 'Abebe', amount: 2000, accountId: 'cbe',
      lentOn: '2026-10-25', dueOn: '2026-11-25', note: 'school fees',
    });
    const i = L(d1).items[0];
    expect(i.person).toBe('Abebe');
    expect(i.accountId).toBe('cbe');
    expect(i.dueOn).toBe('2026-11-25');
    expect(i.note).toBe('school fees');
  });

  it('accepts money back in parts', () => {
    let d = lendMoney(fresh(), { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-10-20' });
    const id = d.lending[0].id;
    const afterLend = bal(d, 'cbe');
    d = recordRepayment(d, { lendingId: id, amount: 500, date: '2026-10-25' });
    expect(bal(d, 'cbe')).toBe(afterLend + 500);
    expect(L(d).outstanding).toBe(1500);
    expect(L(d).items[0].settled).toBe(false);
  });

  it('settles when it is all back, and the account is whole again', () => {
    const d0 = fresh();
    const before = bal(d0, 'cbe');
    let d = lendMoney(d0, { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-10-20' });
    const id = d.lending[0].id;
    d = recordRepayment(d, { lendingId: id, amount: 2000, date: '2026-10-25' });
    expect(bal(d, 'cbe')).toBe(before);
    expect(L(d).outstanding).toBe(0);
    expect(L(d).items[0].settled).toBe(true);
  });

  it('never records more coming back than went out', () => {
    let d = lendMoney(fresh(), { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-10-20' });
    const id = d.lending[0].id;
    d = recordRepayment(d, { lendingId: id, amount: 99999, date: '2026-10-25' });
    expect(L(d).items[0].repaid).toBe(2000);
    expect(L(d).outstanding).toBe(0);
  });

  it('can come back into a different account than it left', () => {
    let d = lendMoney(fresh(), { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-10-20' });
    const cashBefore = bal(d, 'cash');
    d = recordRepayment(d, { lendingId: d.lending[0].id, amount: 2000, date: '2026-10-25', accountId: 'cash' });
    expect(bal(d, 'cash')).toBe(cashBefore + 2000);
  });

  it('flags money that is late coming back', () => {
    const d = lendMoney(fresh(), {
      person: 'Abebe', amount: 2000, accountId: 'cbe',
      lentOn: '2026-09-01', dueOn: '2026-10-01',       // asOf is the 25th
    });
    const i = L(d).items[0];
    expect(i.overdue).toBe(true);
    expect(i.daysLate).toBe(24);
    expect(makeEngine(d).alerts().some(a => /due to return/i.test(a.text))).toBe(true);
  });

  it('does not nag about money with no date agreed', () => {
    const d = lendMoney(fresh(), { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-01-01' });
    expect(L(d).items[0].overdue).toBe(false);
  });

  it('undoing a repayment puts it back out there', () => {
    let d = lendMoney(fresh(), { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-10-20' });
    const id = d.lending[0].id;
    d = recordRepayment(d, { lendingId: id, amount: 500, date: '2026-10-25' });
    const rid = d.lending[0].repayments[0].id;
    const withRepay = bal(d, 'cbe');
    d = removeRepayment(d, id, rid);
    expect(bal(d, 'cbe')).toBe(withRepay - 500);
    expect(L(d).outstanding).toBe(2000);
  });

  it('removing it entirely puts every movement back', () => {
    const d0 = fresh();
    const before = bal(d0, 'cbe');
    let d = lendMoney(d0, { person: 'Abebe', amount: 2000, accountId: 'cbe', lentOn: '2026-10-20' });
    d = recordRepayment(d, { lendingId: d.lending[0].id, amount: 700, date: '2026-10-25' });
    d = removeLending(d, d.lending[0].id);
    expect(bal(d, 'cbe')).toBe(before);
    expect(d.lending).toHaveLength(0);
    expect(d.transactions).toEqual(d0.transactions);
  });

  it('refuses a nameless or non-positive loan', () => {
    const d0 = fresh();
    expect(lendMoney(d0, { person: '', amount: 100, accountId: 'cbe', lentOn: '2026-10-25' })).toBe(d0);
    expect(lendMoney(d0, { person: 'X', amount: 0, accountId: 'cbe', lentOn: '2026-10-25' })).toBe(d0);
    expect(lendMoney(d0, { person: 'X', amount: -5, accountId: 'cbe', lentOn: '2026-10-25' }).lending).toHaveLength(0);
  });
});

describe('what an account is for', () => {
  function withPurpose(): Data {
    const d = fresh();
    d.accounts = d.accounts.map(a =>
      a.id === 'bunna' ? { ...a, purpose: 'Coffee', categories: ['Eating out'] }
        : a.id === 'dashen' ? { ...a, categories: ['Child'] }
          : a);
    return d;
  }

  it('routes spending of that kind to that account', () => {
    const e = makeEngine(withPurpose());
    expect(e.accountForCategory('Eating out')).toBe('bunna');
    expect(e.accountForCategory('Child')).toBe('dashen');
  });

  it('leaves categories nobody claimed unrouted', () => {
    const e = makeEngine(withPurpose());
    expect(e.accountForCategory('Groceries')).toBeNull();
    expect(e.accountForCategory(null)).toBeNull();
  });

  it('describes an account by its purpose, falling back to its categories', () => {
    const e = makeEngine(withPurpose());
    expect(e.accountPurpose('bunna')).toBe('Coffee');     // the words you chose
    expect(e.accountPurpose('dashen')).toBe('Child');     // else what it covers
    expect(e.accountPurpose('cash')).toBeNull();
  });

  it('ignores an archived account when routing', () => {
    const d = withPurpose();
    d.accounts = d.accounts.map(a => a.id === 'bunna' ? { ...a, archived: true } : a);
    expect(makeEngine(d).accountForCategory('Eating out')).toBeNull();
  });
});
