import { describe, it, expect } from 'vitest';
import { makeDefaultData } from '../src/lib/defaults';
import { makeEngine } from '../src/lib/engine';
import {
  payEkubRound, unpayEkubRound, setEkubRoundAmount, setEkubRoundDate, setAccountBalance,
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
