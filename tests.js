/* ============================================================
   BIRR — SELF-VALIDATION
   The engine checks itself. If any of these fail, the numbers on
   the screen are not to be trusted.
   Run in Node:  node tests.js
   ============================================================ */

function runTests(deps) {
  const { makeEngine, parseMessage, SEED } = deps;
  const results = [];
  let n = 0;

  function check(name, fn) {
    n++;
    try {
      const r = fn();
      if (r === true || r === undefined) results.push({ n, name, pass: true });
      else results.push({ n, name, pass: false, detail: String(r) });
    } catch (e) {
      results.push({ n, name, pass: false, detail: e.message });
    }
  }
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.02 : tol);

  const E = makeEngine(SEED, { transactions: [], overrides: {}, paid: {} });

  /* ---------- balances ---------- */
  check('Account balance = opening + its transactions', () => {
    const a = SEED.accounts[0];
    const sum = E.txs.filter(t => t.accountId === a.id && t.date >= a.openingDate && t.date <= E.asOf)
      .reduce((s, t) => s + t.amount, 0);
    return near(E.accountBalance(a.id), a.opening + sum) || `got ${E.accountBalance(a.id)}`;
  });

  check('Combined balance = sum of all account balances', () => {
    const sum = SEED.accounts.reduce((s, a) => s + E.accountBalance(a.id), 0);
    return near(E.combinedBalance(), sum) || `${E.combinedBalance()} vs ${sum}`;
  });

  check('A transfer leaves the combined balance unchanged', () => {
    const before = E.combinedBalance();
    const E2 = makeEngine(SEED, {
      transactions: [
        { id: 'tA', date: E.asOf, accountId: 'cbe', amount: -1000, isTransfer: true, transferGroupId: 'g1' },
        { id: 'tB', date: E.asOf, accountId: 'telebirr', amount: 1000, isTransfer: true, transferGroupId: 'g1' },
      ], overrides: {}, paid: {},
    });
    return near(E2.combinedBalance(), before) || `${E2.combinedBalance()} vs ${before}`;
  });

  check('A transfer DOES change the two account balances', () => {
    const b0 = E.accountBalance('cbe');
    const E2 = makeEngine(SEED, {
      transactions: [
        { id: 'tA', date: E.asOf, accountId: 'cbe', amount: -1000, isTransfer: true, transferGroupId: 'g1' },
        { id: 'tB', date: E.asOf, accountId: 'telebirr', amount: 1000, isTransfer: true, transferGroupId: 'g1' },
      ], overrides: {}, paid: {},
    });
    return near(E2.accountBalance('cbe'), b0 - 1000) || `cbe moved to ${E2.accountBalance('cbe')} from ${b0}`;
  });

  check('Transactions dated before an account opening are not double counted', () => {
    const a = SEED.accounts[0];
    const E2 = makeEngine(SEED, {
      transactions: [{ id: 'old', date: '2000-01-01', accountId: a.id, amount: -5000 }],
      overrides: {}, paid: {},
    });
    return near(E2.accountBalance(a.id), E.accountBalance(a.id)) || 'pre-opening transaction leaked in';
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
    if (s.shortfall > 0) return s.amount === 0 || 'shortfall should zero the figure';
    return near(s.amount, s.balance - s.committedTotal - s.buffer) || `${s.amount}`;
  });

  check('Safe-to-spend subtracts every bill due before the next payday', () => {
    const s = E.safeToSpend();
    const late = s.committed.filter(c => c.date > s.nextPayday);
    return late.length === 0 || `${late.length} commitments counted past payday`;
  });

  check('Safe-to-spend keeps the buffer out of reach', () => {
    const s = E.safeToSpend();
    if (s.shortfall > 0) return true;
    return s.balance - s.amount >= s.buffer - 0.01 || 'buffer was spendable';
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
    return (L.payoffDate && L.payoffDate >= E.asOf) || `payoff ${L.payoffDate}`;
  });

  check('Final loan payment does not overpay', () => {
    const L = E.loanSchedule();
    const last = L.rows[L.rows.length - 1];
    return last.closing >= -0.01 || `overpaid to ${last.closing}`;
  });

  check('Loan total paid = principal + interest', () => {
    const L = E.loanSchedule();
    return near(L.totalPaid, L.startingBalance + L.totalInterest, 1)
      || `paid ${L.totalPaid} vs ${L.startingBalance}+${L.totalInterest}`;
  });

  check('Loan interest is never negative', () => {
    const L = E.loanSchedule();
    return L.totalInterest >= 0 || `${L.totalInterest}`;
  });

  /* ---------- ekub ---------- */
  check('Ekub contributions paid never exceed the number of rounds', () => {
    const k = E.ekubStatus();
    return k.paidCount <= k.totalRounds || `${k.paidCount}/${k.totalRounds}`;
  });

  check('Ekub payout = contribution × members', () => {
    const k = E.ekubStatus();
    return near(k.payoutAmount, SEED.ekub.contributionAmount * SEED.ekub.totalMembers) || `${k.payoutAmount}`;
  });

  check('Ekub net at payout = payout − everything contributed by then', () => {
    const k = E.ekubStatus();
    return near(k.netAtPayout, k.payoutAmount - k.contributedByPayout) || `${k.netAtPayout}`;
  });

  check('Ekub is zero-sum over a full cycle (you get back what you put in)', () => {
    const k = E.ekubStatus();
    return near(k.payoutAmount, k.totalContribution) || `payout ${k.payoutAmount} vs contributed ${k.totalContribution}`;
  });

  check('Ekub next due round follows the rounds already paid', () => {
    const k = E.ekubStatus();
    return k.nextRound === k.paidCount + 1 || `next ${k.nextRound} after ${k.paidCount}`;
  });

  /* ---------- forecast ---------- */
  check('Forecast day 0 equals today\'s combined balance', () => {
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

  check('Forecast low point is actually the minimum of the series', () => {
    const f = E.forecast(90, 'late');
    const min = Math.min(...f.series.map(d => d.balance));
    return near(f.lowest.balance, min) || `${f.lowest.balance} vs ${min}`;
  });

  /* ---------- relocation ---------- */
  check('Relocation advance = months × new rent', () => {
    const r = E.relocation();
    return near(r.advance, SEED.relocation.advanceMonths * SEED.relocation.newMonthlyRent) || `${r.advance}`;
  });

  check('Relocation upfront need = advance + deposit + moving', () => {
    const r = E.relocation();
    return near(r.upfrontNeed, r.advance + SEED.relocation.deposit + SEED.relocation.movingCost) || `${r.upfrontNeed}`;
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

  /* ---------- reconciliation ---------- */
  check('Reconciliation drift = stated − calculated', () => {
    const calc = E.accountBalance('cbe');
    const r = E.reconcile('cbe', calc + 250, E.asOf);
    return near(r.drift, 250) || `${r.drift}`;
  });

  check('Matching balances reconcile clean', () => {
    const calc = E.accountBalance('cbe');
    const r = E.reconcile('cbe', calc, E.asOf);
    return (r.clean && near(r.drift, 0)) || `drift ${r.drift}`;
  });

  /* ---------- budgets ---------- */
  check('Spending totals are never negative', () => {
    const E2 = makeEngine(SEED, {
      transactions: [{ id: 'x', date: SEED.meta.asOf, accountId: 'cash', amount: -300, category: 'Groceries' }],
      overrides: {}, paid: {},
    });
    const b = E2.budgetStatus(SEED.meta.asOf.slice(0, 7));
    return b.every(x => x.spent >= 0) || 'negative spend';
  });

  check('Credits do not count as spending', () => {
    const E2 = makeEngine(SEED, {
      transactions: [{ id: 'y', date: SEED.meta.asOf, accountId: 'cash', amount: 5000, category: 'Groceries' }],
      overrides: {}, paid: {},
    });
    const g = E2.budgetStatus(SEED.meta.asOf.slice(0, 7)).find(x => x.category === 'Groceries');
    return g.spent === 0 || `credit counted as ${g.spent}`;
  });

  check('Transfers do not count as spending', () => {
    const E2 = makeEngine(SEED, {
      transactions: [{ id: 'z', date: SEED.meta.asOf, accountId: 'cash', amount: -2000, category: 'Groceries', isTransfer: true }],
      overrides: {}, paid: {},
    });
    const g = E2.budgetStatus(SEED.meta.asOf.slice(0, 7)).find(x => x.category === 'Groceries');
    return g.spent === 0 || `transfer counted as ${g.spent}`;
  });

  check('Budget over-cap flag matches spent vs cap', () => {
    const E2 = makeEngine(SEED, {
      transactions: [{ id: 'q', date: SEED.meta.asOf, accountId: 'cash', amount: -(SEED.budgets.Groceries + 1), category: 'Groceries' }],
      overrides: {}, paid: {},
    });
    const g = E2.budgetStatus(SEED.meta.asOf.slice(0, 7)).find(x => x.category === 'Groceries');
    return g.over === true || 'over-cap not flagged';
  });

  /* ---------- marking paid / postponing ---------- */
  check('Marking a bill paid removes it from upcoming commitments', () => {
    const horizon = E.addDaysISO(E.asOf, 60);
    const before = E.billOccurrences(E.asOf, horizon);
    if (!before.length) return true;
    const target = before[0];
    const E2 = makeEngine(SEED, { transactions: [], overrides: {}, paid: { [target.key]: true } });
    const after = E2.billOccurrences(E.asOf, horizon);
    return after.every(b => b.key !== target.key) || 'still listed after paying';
  });

  check('Postponing a bill moves its date and nothing else', () => {
    const horizon = E.addDaysISO(E.asOf, 90);
    const before = E.billOccurrences(E.asOf, horizon);
    if (!before.length) return true;
    const t = before[0];
    const newDate = E.addDaysISO(t.date, 5);
    const E2 = makeEngine(SEED, { transactions: [], overrides: { [t.key]: newDate }, paid: {} });
    const moved = E2.billOccurrences(E.asOf, horizon).find(b => b.key === t.key);
    return (moved && moved.date === newDate && moved.amount === t.amount) || 'postpone failed';
  });

  /* ---------- schedule edge cases ---------- */
  check('Day-31 bills fall on the last day of short months', () => {
    const seed31 = JSON.parse(JSON.stringify(SEED));
    seed31.bills = [{ id: 'b31', name: 'Day 31', amount: 100, accountId: 'cash', category: 'Other', schedule: { type: 'monthly', dayOfMonth: 31 }, essential: false }];
    const E2 = makeEngine(seed31, { transactions: [], overrides: {}, paid: {} });
    const occ = E2.billOccurrences('2027-02-01', '2027-02-28');
    return (occ.length === 1 && occ[0].date === '2027-02-28') || `got ${occ.map(o => o.date).join(',')}`;
  });

  /* ---------- parser ---------- */
  check('Parser reads a CBE-style debit with its stated balance', () => {
    const p = parseMessage('CBE', 'Dear customer your account 1****5678 has been debited with ETB 500.00 on 13/10/2026. Your current balance is ETB 1,200.00', SEED.accounts);
    return (p.amount === 500 && p.direction === 'debit' && p.statedBalance === 1200 && p.signedAmount === -500)
      || JSON.stringify({ a: p.amount, d: p.direction, b: p.statedBalance });
  });

  check('Parser reads a telebirr transfer out', () => {
    const p = parseMessage('127', 'You have transferred ETB 250.00 to ABEBE KEBEDE. Your current balance is ETB 80.50. transaction number CAB1234567', SEED.accounts);
    return (p.amount === 250 && p.direction === 'debit' && p.statedBalance === 80.5)
      || JSON.stringify({ a: p.amount, d: p.direction, b: p.statedBalance });
  });

  check('Parser reads a credit as positive', () => {
    const p = parseMessage('CBE', 'Your account 1****5678 has been credited with ETB 28,000.00. Current balance is ETB 29,200.00', SEED.accounts);
    return (p.signedAmount === 28000 && p.direction === 'credit') || JSON.stringify({ s: p.signedAmount, d: p.direction });
  });

  check('Parser never mistakes the stated balance for the amount', () => {
    const p = parseMessage('CBE', 'Your account 1****5678 has been debited with ETB 100.00. Current balance is ETB 9,999.00', SEED.accounts);
    return p.amount === 100 || `picked ${p.amount}`;
  });

  check('Parser maps the sender to one of my accounts', () => {
    const p = parseMessage('127', 'You have transferred ETB 10.00 to X. Your balance is ETB 5.00', SEED.accounts);
    return p.accountId === 'telebirr' || `mapped to ${p.accountId}`;
  });

  check('Parser flags an unknown sender for review instead of guessing', () => {
    const p = parseMessage('UNKNOWN99', 'Some random promotional text with no money in it', SEED.accounts);
    return p.needsReview === true || 'accepted an unparseable message';
  });

  check('Parser flags ambiguous direction rather than picking silently', () => {
    const p = parseMessage('CBE', 'Your account was credited and then debited with ETB 50.00', SEED.accounts);
    return (p.confidence < 0.7 || p.missing.length > 0) || 'ambiguous message passed as confident';
  });

  check('Parser spots a self-transfer so it is not booked as spending', () => {
    const p = parseMessage('127', 'You have transferred ETB 1,000.00 to your CBE account. Your balance is ETB 20.00', SEED.accounts);
    return p.looksLikeTransfer === true || 'self-transfer not detected';
  });

  check('Parsed amounts survive thousands separators', () => {
    const p = parseMessage('CBE', 'debited with ETB 1,234,567.89. Balance is ETB 10.00', SEED.accounts);
    return p.amount === 1234567.89 || `got ${p.amount}`;
  });

  /* ---------- modelling subtlety ---------- */
  check('Payroll loan deduction is not double counted as a cash outflow', () => {
    const salary = SEED.income.find(i => i.netOfLoanDeduction);
    if (!salary) return 'no income marked netOfLoanDeduction — confirm with the user';
    const f = E.forecast(90, 'base');
    const loanAsOutflow = f.series.some(d => d.events.some(e => /loan/i.test(e) && /^−/.test(e)))
      && SEED.loan.autoDeductAmount > 0;
    const manualExists = (SEED.loan.manualPayments || []).length > 0;
    return (!loanAsOutflow || manualExists) || 'payroll deduction counted twice';
  });

  check('Alerts are generated without throwing', () => {
    const a = E.alerts();
    return Array.isArray(a) || 'alerts failed';
  });

  const passed = results.filter(r => r.pass).length;
  return { results, passed, total: results.length, allPass: passed === results.length };
}

if (typeof module !== 'undefined') module.exports = { runTests };
