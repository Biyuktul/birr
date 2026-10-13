/* ============================================================
   BIRR — self-validation
   The engine checks itself. Used by `npm test` and by the Checks
   screen in the app, so the same assertions run in both places.
   If any of these fail, nothing on any screen is to be trusted.
   ============================================================ */

import type { Data } from './types';
import { makeEngine, addDaysISO, round2 } from './engine';
import { parseMessage } from './parser';
import { makeDefaultData } from './defaults';

export interface CheckResult {
  n: number;
  name: string;
  pass: boolean;
  detail?: string;
}

export interface TestRun {
  results: CheckResult[];
  passed: number;
  total: number;
  allPass: boolean;
}

/** A check returns true to pass, or a string describing the failure. */
type Check = () => true | string;

/** structuredClone needs iOS 15.4+. The data is plain JSON, so a round-trip is
 *  an exact equivalent and works on every iPhone that can run the app at all. */
function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function runSelfTest(base?: Data): TestRun {
  const DATA: Data = base ? deepClone(base) : makeDefaultData('2026-10-13');
  // Pin the date so date-sensitive assertions are deterministic.
  if (!base) DATA.meta.asOf = '2026-10-13';

  const results: CheckResult[] = [];
  let n = 0;

  function check(name: string, fn: Check) {
    n++;
    try {
      const r = fn();
      if (r === true) results.push({ n, name, pass: true });
      else results.push({ n, name, pass: false, detail: String(r) });
    } catch (e) {
      results.push({ n, name, pass: false, detail: (e as Error).message });
    }
  }

  const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;
  const clone = (): Data => deepClone(DATA);
  const E = makeEngine(DATA);
  const asOf = DATA.meta.asOf;

  /* ---------- balances ---------- */
  check('Account balance = opening + its transactions', () => {
    const a = DATA.accounts[0];
    const sum = DATA.transactions
      .filter(t => t.accountId === a.id && t.date >= a.openingDate && t.date <= asOf)
      .reduce((s, t) => s + t.amount, 0);
    return near(E.accountBalance(a.id), a.opening + sum) || `got ${E.accountBalance(a.id)}`;
  });

  check('Combined balance = sum of all account balances', () => {
    const sum = DATA.accounts.reduce((s, a) => s + E.accountBalance(a.id), 0);
    return near(E.combinedBalance(), sum) || `${E.combinedBalance()} vs ${sum}`;
  });

  check('A transfer leaves the combined balance unchanged', () => {
    const before = E.combinedBalance();
    const d = clone();
    d.transactions.push(
      { id: 'tA', date: asOf, accountId: 'cbe', amount: -1000, category: null, note: null, isTransfer: true, transferGroupId: 'g1', source: 'manual' },
      { id: 'tB', date: asOf, accountId: 'telebirr', amount: 1000, category: null, note: null, isTransfer: true, transferGroupId: 'g1', source: 'manual' },
    );
    const E2 = makeEngine(d);
    return near(E2.combinedBalance(), before) || `${E2.combinedBalance()} vs ${before}`;
  });

  check('A transfer DOES change the two account balances', () => {
    const b0 = E.accountBalance('cbe');
    const d = clone();
    d.transactions.push(
      { id: 'tA', date: asOf, accountId: 'cbe', amount: -1000, category: null, note: null, isTransfer: true, source: 'manual' },
      { id: 'tB', date: asOf, accountId: 'telebirr', amount: 1000, category: null, note: null, isTransfer: true, source: 'manual' },
    );
    const E2 = makeEngine(d);
    return near(E2.accountBalance('cbe'), b0 - 1000) || `cbe is ${E2.accountBalance('cbe')}, was ${b0}`;
  });

  check('Transactions dated before an account opening are not double counted', () => {
    const a = DATA.accounts[0];
    const d = clone();
    d.transactions.push({ id: 'old', date: '2000-01-01', accountId: a.id, amount: -5000, category: null, note: null, isTransfer: false, source: 'manual' });
    return near(makeEngine(d).accountBalance(a.id), E.accountBalance(a.id)) || 'pre-opening transaction leaked in';
  });

  check('An archived account is left out of the combined balance', () => {
    const d = clone();
    const target = d.accounts[1];
    const before = E.combinedBalance();
    target.archived = true;
    const after = makeEngine(d).combinedBalance();
    return near(after, before - E.accountBalance(target.id)) || `${after} vs ${before}`;
  });

  /* ---------- safe to spend ---------- */
  check('Safe-to-spend never exceeds the combined balance', () => {
    const s = E.safeToSpend();
    return s.amount <= s.balance + 0.01 || `${s.amount} > ${s.balance}`;
  });

  check('Safe-to-spend is never negative (it reports a shortfall instead)', () => {
    const s = E.safeToSpend();
    return s.amount >= 0 || `got ${s.amount}`;
  });

  check('Safe-to-spend = balance − committed − buffer, when positive', () => {
    const s = E.safeToSpend();
    if (s.shortfall > 0) return s.amount === 0 || 'a shortfall must zero the figure';
    return near(s.amount, s.balance - s.committedTotal - s.buffer) || `${s.amount}`;
  });

  check('Safe-to-spend counts nothing due after the next payday', () => {
    const s = E.safeToSpend();
    const late = s.committed.filter(c => c.date > s.nextPayday);
    return late.length === 0 || `${late.length} commitments counted past payday`;
  });

  check('Safe-to-spend keeps the buffer out of reach', () => {
    const s = E.safeToSpend();
    if (s.shortfall > 0) return true;
    return s.balance - s.amount >= s.buffer - 0.01 || 'the buffer was spendable';
  });

  /* ---------- loan ---------- */
  check('Loan balance falls monotonically', () => {
    const L = E.loanSchedule();
    for (let i = 1; i < L.rows.length; i++) {
      if (L.rows[i].closing > L.rows[i - 1].closing + 0.01) return `rose at row ${i}`;
    }
    return true;
  });

  check('Loan reaches zero (the deduction actually clears it)', () => {
    const L = E.loanSchedule();
    if (L.stalled) return 'loan never clears — check rate vs deduction';
    return near(L.rows[L.rows.length - 1].closing, 0) || `ends at ${L.rows[L.rows.length - 1].closing}`;
  });

  check('Loan payoff date is in the future', () => {
    const L = E.loanSchedule();
    return (!!L.payoffDate && L.payoffDate >= asOf) || `payoff ${L.payoffDate}`;
  });

  check('Final loan payment does not overpay', () => {
    const L = E.loanSchedule();
    return L.rows[L.rows.length - 1].closing >= -0.01 || 'overpaid past zero';
  });

  check('Loan total paid = principal + interest', () => {
    const L = E.loanSchedule();
    return near(L.totalPaid, L.startingBalance + L.totalInterest, 1)
      || `paid ${L.totalPaid} vs ${L.startingBalance} + ${L.totalInterest}`;
  });

  check('Loan interest is never negative', () => {
    const L = E.loanSchedule();
    return L.totalInterest >= 0 || `${L.totalInterest}`;
  });

  check('A loan that is never paid down is reported as stalled, not looped forever', () => {
    const d = clone();
    d.loan.autoDeductAmount = 0;
    d.loan.annualRate = 0.2;
    d.loan.manualPayments = [];
    const L = makeEngine(d).loanSchedule();
    return (L.stalled && L.payoffDate === null) || 'should have reported stalled';
  });

  check('An extra manual payment brings the payoff date forward', () => {
    const basePayoff = E.loanSchedule().payoffDate!;
    const d = clone();
    d.loan.manualPayments = [{ id: 'p1', date: addDaysISO(asOf, 20), amount: 20000 }];
    const after = makeEngine(d).loanSchedule().payoffDate!;
    return after <= basePayoff || `${after} is not before ${basePayoff}`;
  });

  check('A disabled loan contributes nothing', () => {
    const d = clone();
    d.loan.enabled = false;
    const L = makeEngine(d).loanSchedule();
    return (L.rows.length === 0 && L.payoffDate === null) || 'disabled loan still scheduled';
  });

  /* ---------- ekub ---------- */
  check('Ekub contributions paid never exceed the number of rounds', () => {
    const k = E.ekubStatus();
    return k.paidCount <= k.totalRounds || `${k.paidCount}/${k.totalRounds}`;
  });

  check('Ekub payout = contribution × members', () => {
    const k = E.ekubStatus();
    return near(k.payoutAmount, DATA.ekub.contributionAmount * DATA.ekub.totalMembers) || `${k.payoutAmount}`;
  });

  check('Ekub net at payout = payout − everything contributed by then', () => {
    const k = E.ekubStatus();
    return near(k.netAtPayout, k.payoutAmount - k.contributedByPayout) || `${k.netAtPayout}`;
  });

  check('Ekub is zero-sum over a full cycle', () => {
    const k = E.ekubStatus();
    return near(k.payoutAmount, k.totalContribution)
      || `payout ${k.payoutAmount} vs contributed ${k.totalContribution}`;
  });

  check('Ekub next round follows the rounds already paid', () => {
    const k = E.ekubStatus();
    return k.nextRound === k.paidCount + 1 || `next ${k.nextRound} after ${k.paidCount}`;
  });

  check('Taking an early Ekub round puts you ahead; a late round puts you behind', () => {
    const early = clone(); early.ekub.myPayoutRound = 1;
    const late = clone(); late.ekub.myPayoutRound = late.ekub.totalMembers;
    const a = makeEngine(early).ekubStatus().netAtPayout;
    const b = makeEngine(late).ekubStatus().netAtPayout;
    return (a > 0 && b <= 0) || `first round net ${a}, last round net ${b}`;
  });

  /* ---------- forecast ---------- */
  check("Forecast day 0 equals today's combined balance", () => {
    const f = E.forecast(90, 'base');
    return near(f.series[0].balance, E.combinedBalance()) || `${f.series[0].balance}`;
  });

  check('Forecast is continuous: each day = previous + in − out', () => {
    const f = E.forecast(90, 'base');
    for (let i = 1; i < f.series.length; i++) {
      const p = f.series[i - 1], c = f.series[i];
      if (!near(c.balance, p.balance + c.in - c.out, 0.05)) return `break at ${c.date}`;
    }
    return true;
  });

  check('Forecast covers exactly the days requested', () => {
    const f = E.forecast(90, 'base');
    return f.series.length === 91 || `${f.series.length} rows`;
  });

  check('The late scenario is never rosier than the base scenario', () => {
    const b = E.forecast(90, 'base'), l = E.forecast(90, 'late');
    return l.lowest.balance <= b.lowest.balance + 0.01
      || `late low ${l.lowest.balance} > base low ${b.lowest.balance}`;
  });

  check('The stress scenario is never rosier than the late scenario', () => {
    const l = E.forecast(90, 'late'), s = E.forecast(90, 'stress');
    return s.lowest.balance <= l.lowest.balance + 0.01
      || `stress low ${s.lowest.balance} > late low ${l.lowest.balance}`;
  });

  check('Forecast low point is the actual minimum of the series', () => {
    const f = E.forecast(90, 'late');
    const min = Math.min(...f.series.map(d => d.balance));
    return near(f.lowest.balance, min) || `${f.lowest.balance} vs ${min}`;
  });

  /* ---------- relocation ---------- */
  check('Relocation advance = months × new rent', () => {
    const r = E.relocation();
    return near(r.advance, DATA.relocation.advanceMonths * DATA.relocation.newMonthlyRent) || `${r.advance}`;
  });

  check('Relocation upfront need = advance + deposit + moving', () => {
    const r = E.relocation();
    return near(r.upfrontNeed, r.advance + DATA.relocation.deposit + DATA.relocation.movingCost) || `${r.upfrontNeed}`;
  });

  check('Relocation verdict agrees with the shortfall and deficit signs', () => {
    const r = E.relocation();
    if (r.affordable) return (r.upfrontShortfall <= 0 && r.monthlyDeficit <= 0) || 'called affordable while short';
    return (r.upfrontShortfall > 0 || r.monthlyDeficit > 0) || 'called unaffordable with no shortfall';
  });

  check('Relocation upfront shortfall ≥ advance shortfall', () => {
    const r = E.relocation();
    return r.upfrontShortfall >= r.advanceShortfall - 0.01 || `${r.upfrontShortfall} < ${r.advanceShortfall}`;
  });

  check('Cheaper rent never makes the monthly position worse', () => {
    const d = clone();
    d.relocation.newMonthlyRent = round2(d.relocation.newMonthlyRent / 2);
    const cheaper = makeEngine(d).relocation().monthlyDeficit;
    return cheaper <= E.relocation().monthlyDeficit + 0.01 || 'halving rent worsened the deficit';
  });

  /* ---------- reconciliation ---------- */
  check('Reconciliation drift = stated − calculated', () => {
    const calc = E.accountBalance('cbe');
    return near(E.reconcile('cbe', calc + 250).drift, 250) || 'drift wrong';
  });

  check('Matching balances reconcile clean', () => {
    const calc = E.accountBalance('cbe');
    const r = E.reconcile('cbe', calc);
    return (r.clean && near(r.drift, 0)) || `drift ${r.drift}`;
  });

  /* ---------- budgets ---------- */
  check('Spending totals are never negative', () => {
    const d = clone();
    d.transactions.push({ id: 'x', date: asOf, accountId: 'cash', amount: -300, category: 'Groceries', note: null, isTransfer: false, source: 'manual' });
    return makeEngine(d).budgetStatus(asOf.slice(0, 7)).every(x => x.spent >= 0) || 'negative spend';
  });

  check('Credits do not count as spending', () => {
    const d = clone();
    d.transactions.push({ id: 'y', date: asOf, accountId: 'cash', amount: 5000, category: 'Groceries', note: null, isTransfer: false, source: 'manual' });
    const g = makeEngine(d).budgetStatus(asOf.slice(0, 7)).find(x => x.category === 'Groceries')!;
    return g.spent === 0 || `credit counted as ${g.spent}`;
  });

  check('Transfers do not count as spending', () => {
    const d = clone();
    d.transactions.push({ id: 'z', date: asOf, accountId: 'cash', amount: -2000, category: 'Groceries', note: null, isTransfer: true, source: 'manual' });
    const g = makeEngine(d).budgetStatus(asOf.slice(0, 7)).find(x => x.category === 'Groceries')!;
    return g.spent === 0 || `transfer counted as ${g.spent}`;
  });

  check('Budget over-cap flag matches spent vs cap', () => {
    const d = clone();
    d.transactions.push({ id: 'q', date: asOf, accountId: 'cash', amount: -(d.budgets.Groceries + 1), category: 'Groceries', note: null, isTransfer: false, source: 'manual' });
    const g = makeEngine(d).budgetStatus(asOf.slice(0, 7)).find(x => x.category === 'Groceries')!;
    return g.over === true || 'over-cap not flagged';
  });

  /* ---------- commitments ---------- */
  check('Marking a commitment paid removes it from what is upcoming', () => {
    const horizon = addDaysISO(asOf, 60);
    const before = E.commitments(asOf, horizon);
    if (!before.length) return true;
    const target = before[0];
    const d = clone(); d.paid[target.key] = true;
    return makeEngine(d).commitments(asOf, horizon).every(b => b.key !== target.key)
      || 'still listed after being paid';
  });

  check('Postponing moves the date and changes nothing else', () => {
    const horizon = addDaysISO(asOf, 90);
    const before = E.commitments(asOf, horizon);
    if (!before.length) return true;
    const t = before[0];
    const newDate = addDaysISO(t.date, 5);
    const d = clone(); d.overrides[t.key] = newDate;
    const moved = makeEngine(d).commitments(asOf, horizon).find(b => b.key === t.key);
    return (!!moved && moved.date === newDate && moved.amount === t.amount) || 'postpone failed';
  });

  check('An Ekub round can be settled from the calendar, same as a bill', () => {
    const horizon = addDaysISO(asOf, 60);
    const ek = E.commitments(asOf, horizon).find(c => c.kind === 'ekub');
    if (!ek) return true;
    const d = clone(); d.paid[ek.key] = true;
    return makeEngine(d).commitments(asOf, horizon).every(c => c.key !== ek.key)
      || 'Ekub round could not be settled';
  });

  check('Day-31 bills fall on the last day of short months', () => {
    const d = clone();
    d.bills = [{ id: 'b31', name: 'Day 31', amount: 100, accountId: 'cash', category: 'Other', schedule: { type: 'monthly', dayOfMonth: 31 }, essential: false, active: true }];
    d.ekub.enabled = false;
    d.loan.manualPayments = [];
    const occ = makeEngine(d).commitments('2027-02-01', '2027-02-28');
    return (occ.length === 1 && occ[0].date === '2027-02-28') || `got ${occ.map(o => o.date).join(',')}`;
  });

  check('An inactive bill stops being charged', () => {
    const horizon = addDaysISO(asOf, 60);
    const d = clone();
    const first = d.bills[0];
    first.active = false;
    return makeEngine(d).commitments(asOf, horizon).every(c => c.id !== first.id)
      || 'inactive bill still due';
  });

  /* ---------- the modelling subtlety ---------- */
  check('A payroll loan deduction is not also counted as a cash outflow', () => {
    const salary = DATA.income.find(i => i.netOfLoanDeduction);
    if (!salary) return 'no income is marked as net of the loan deduction — confirm this';
    const f = E.forecast(90, 'base');
    const loanOut = f.series.some(d => d.events.some(e => e.startsWith('−') && /loan/i.test(e)));
    const hasManual = DATA.loan.manualPayments.length > 0;
    return (!loanOut || hasManual) || 'the payroll deduction was counted twice';
  });

  /* ---------- parser ---------- */
  const accts = DATA.accounts;
  check('Parser reads a CBE-style debit with its stated balance', () => {
    const p = parseMessage('CBE', 'Dear customer your account 1****5678 has been debited with ETB 500.00 on 13/10/2026. Your current balance is ETB 1,200.00', accts, asOf);
    return (p.amount === 500 && p.direction === 'debit' && p.statedBalance === 1200 && p.signedAmount === -500)
      || JSON.stringify({ a: p.amount, d: p.direction, b: p.statedBalance });
  });

  check('Parser reads a telebirr transfer out', () => {
    const p = parseMessage('127', 'You have transferred ETB 250.00 to ABEBE KEBEDE. Your current balance is ETB 80.50. transaction number CAB1234567', accts, asOf);
    return (p.amount === 250 && p.direction === 'debit' && p.statedBalance === 80.5)
      || JSON.stringify({ a: p.amount, d: p.direction, b: p.statedBalance });
  });

  check('Parser reads a credit as positive', () => {
    const p = parseMessage('CBE', 'Your account 1****5678 has been credited with ETB 28,000.00. Current balance is ETB 29,200.00', accts, asOf);
    return (p.signedAmount === 28000 && p.direction === 'credit') || JSON.stringify({ s: p.signedAmount, d: p.direction });
  });

  check('Parser never mistakes the stated balance for the amount', () => {
    const p = parseMessage('CBE', 'Your account 1****5678 has been debited with ETB 100.00. Current balance is ETB 9,999.00', accts, asOf);
    return p.amount === 100 || `picked ${p.amount}`;
  });

  check('Parser maps the sender to one of my accounts', () => {
    const p = parseMessage('127', 'You have transferred ETB 10.00 to X. Your balance is ETB 5.00', accts, asOf);
    return p.accountId === 'telebirr' || `mapped to ${p.accountId}`;
  });

  check('Parser flags an unknown sender for review instead of guessing', () => {
    const p = parseMessage('UNKNOWN99', 'Some random promotional text with no money in it', accts, asOf);
    return p.needsReview === true || 'accepted an unparseable message';
  });

  check('Parser flags ambiguous direction rather than picking silently', () => {
    const p = parseMessage('CBE', 'Your account was credited and then debited with ETB 50.00', accts, asOf);
    return (p.confidence < 0.7 || p.missing.length > 0) || 'ambiguous message passed as confident';
  });

  check('Parser spots a self-transfer so it is not booked as spending', () => {
    const p = parseMessage('127', 'You have transferred ETB 1,000.00 to your CBE account. Your balance is ETB 20.00', accts, asOf);
    return p.looksLikeTransfer === true || 'self-transfer not detected';
  });

  check('Parsed amounts survive thousands separators', () => {
    const p = parseMessage('CBE', 'debited with ETB 1,234,567.89. Balance is ETB 10.00', accts, asOf);
    return p.amount === 1234567.89 || `got ${p.amount}`;
  });

  check('Parser never returns a signed amount without knowing the direction', () => {
    const p = parseMessage('ZZZ', 'ETB 40.00 something happened', accts, asOf);
    return (p.direction !== null || p.signedAmount === null) || 'signed an amount with no direction';
  });

  /* ---------- alerts ---------- */
  check('Alerts generate without throwing', () => {
    return Array.isArray(E.alerts()) || 'alerts failed';
  });

  check('A drift against the bank raises an alert', () => {
    const d = clone();
    d.recon['cbe'] = E.accountBalance('cbe') + 5000;
    return makeEngine(d).alerts().some(a => /off by/i.test(a.text)) || 'drift went unreported';
  });

  const passed = results.filter(r => r.pass).length;
  return { results, passed, total: results.length, allPass: passed === results.length };
}
