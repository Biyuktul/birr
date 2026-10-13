/* ============================================================
   BIRR — FINANCIAL ENGINE
   Pure functions. No DOM, no storage, no side effects.
   Everything the app claims about your money is computed here.
   ============================================================ */

/* ---------- date helpers (local time, never UTC-shifted) ---------- */
function D(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function iso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function cmp(a, b) { return D(a) < D(b) ? -1 : D(a) > D(b) ? 1 : 0; }
function monthKey(s) { return s.slice(0, 7); }
function round2(n) { return Math.round(n * 100) / 100; }

/* Clamp a day-of-month to a month that may be shorter (31 -> 30 -> 28). */
function dateOnDay(year, monthIdx, dayOfMonth) {
  return new Date(year, monthIdx, Math.min(dayOfMonth, daysInMonth(year, monthIdx)));
}

/* ============================================================
   OCCURRENCES — turn a schedule into concrete dated events
   ============================================================ */
function occurrences(schedule, fromISO, toISO) {
  const out = [];
  const from = D(fromISO), to = D(toISO);
  if (schedule.type === 'monthly' || schedule.type === 'irregular') {
    let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cursor <= to) {
      const d = dateOnDay(cursor.getFullYear(), cursor.getMonth(), schedule.dayOfMonth);
      if (d >= from && d <= to) out.push(iso(d));
      cursor = addMonths(cursor, 1);
    }
  } else if (schedule.type === 'weekly') {
    let d = new Date(from);
    while (d.getDay() !== schedule.dayOfWeek) d = addDays(d, 1);
    while (d <= to) { out.push(iso(d)); d = addDays(d, 7); }
  }
  return out;
}

/* ============================================================
   CORE MODEL
   ============================================================ */
function makeEngine(seed, state) {
  state = state || { transactions: [], overrides: {}, paid: {} };
  const txs = (seed.transactions || []).concat(state.transactions || []);
  const asOf = seed.meta.asOf;
  const accountById = {};
  seed.accounts.forEach(a => { accountById[a.id] = a; });

  /* ---------- balances ---------- */
  function accountBalance(accountId, onISO) {
    const acct = accountById[accountId];
    if (!acct) return 0;
    const upTo = onISO || asOf;
    let bal = acct.opening;
    for (const t of txs) {
      if (t.accountId !== accountId) continue;
      if (cmp(t.date, acct.openingDate) < 0) continue;   // before opening: already in the opening figure
      if (cmp(t.date, upTo) > 0) continue;
      bal += t.amount;
    }
    return round2(bal);
  }

  function combinedBalance(onISO) {
    return round2(seed.accounts.reduce((s, a) => s + accountBalance(a.id, onISO), 0));
  }

  /* ---------- reconciliation: our number vs the bank's number ---------- */
  function reconcile(accountId, statedBalance, onISO) {
    const calculated = accountBalance(accountId, onISO);
    const drift = round2(statedBalance - calculated);
    return {
      accountId, calculated, stated: round2(statedBalance), drift,
      clean: Math.abs(drift) <= seed.policy.driftAlertThreshold,
    };
  }

  /* ============================================================
     LOAN — amortisation with payroll deduction + manual payments
     ============================================================ */
  function loanSchedule() {
    const L = seed.loan;
    let balance = L.balance;
    const monthlyRate = (L.annualRate || 0) / 12;
    const rows = [];
    let totalInterest = 0, totalPaid = 0;
    let cursor = D(asOf);
    const manual = (L.manualPayments || []).slice().sort((a, b) => cmp(a.date, b.date));
    const manualUsed = new Set();
    let payoffDate = null;

    for (let i = 0; i < 600 && balance > 0.005; i++) {
      const monthDate = addMonths(new Date(cursor.getFullYear(), cursor.getMonth(), 1), i);
      const y = monthDate.getFullYear(), m = monthDate.getMonth();

      // interest for the month, on the balance at month start
      const interest = round2(balance * monthlyRate);
      balance = round2(balance + interest);
      totalInterest = round2(totalInterest + interest);

      // manual payments landing in this month, applied first
      let monthManual = 0, lastEventDate = null;
      manual.forEach((p, idx) => {
        if (manualUsed.has(idx)) return;
        const pd = D(p.date);
        if (pd.getFullYear() === y && pd.getMonth() === m && pd >= D(asOf)) {
          const pay = Math.min(p.amount, balance);
          balance = round2(balance - pay);
          monthManual = round2(monthManual + pay);
          totalPaid = round2(totalPaid + pay);
          manualUsed.add(idx);
          lastEventDate = p.date;
        }
      });

      // payroll deduction
      const autoDate = dateOnDay(y, m, L.autoDeductDay);
      let autoPaid = 0;
      if (balance > 0.005 && autoDate >= D(asOf)) {
        autoPaid = Math.min(L.autoDeductAmount, balance);   // never overpay
        balance = round2(balance - autoPaid);
        totalPaid = round2(totalPaid + autoPaid);
        lastEventDate = iso(autoDate);
      }

      if (autoPaid > 0 || monthManual > 0) {
        rows.push({
          month: `${y}-${String(m + 1).padStart(2, '0')}`,
          interest, manual: monthManual, auto: autoPaid,
          closing: balance, date: lastEventDate,
        });
      }
      if (balance <= 0.005 && lastEventDate) payoffDate = lastEventDate;
      if (autoPaid === 0 && monthManual === 0 && balance > 0) break;  // nothing is paying it down
    }

    return {
      rows, payoffDate, totalInterest, totalPaid,
      monthsRemaining: rows.length,
      startingBalance: L.balance,
      stalled: payoffDate === null,
    };
  }

  /* ============================================================
     EKUB
     ============================================================ */
  function ekubStatus() {
    const E = seed.ekub;
    const paid = (E.contributionsPaid || []).slice().sort((a, b) => a.round - b.round);
    const paidCount = paid.length;
    const payoutAmount = round2(E.contributionAmount * E.totalMembers);

    // round N falls on the Nth scheduled date from startDate
    function roundDate(n) {
      if (E.frequency === 'weekly') return iso(addDays(D(E.startDate), 7 * (n - 1)));
      const s = D(E.startDate);
      const m = addMonths(new Date(s.getFullYear(), s.getMonth(), 1), n - 1);
      return iso(dateOnDay(m.getFullYear(), m.getMonth(), E.dayOfMonth));
    }

    const nextRound = paidCount + 1;
    const nextDue = nextRound <= E.totalMembers ? roundDate(nextRound) : null;
    const payoutDate = roundDate(E.myPayoutRound);
    const contributedSoFar = round2(E.contributionAmount * paidCount);
    const contributedByPayout = round2(E.contributionAmount * E.myPayoutRound);
    const netAtPayout = round2(payoutAmount - contributedByPayout);
    const totalContribution = round2(E.contributionAmount * E.totalMembers);

    return {
      paidCount, totalRounds: E.totalMembers, nextRound, nextDue,
      overdue: nextDue !== null && cmp(nextDue, asOf) < 0,
      payoutAmount, payoutDate, payoutRound: E.myPayoutRound,
      contributedSoFar, contributedByPayout, netAtPayout,
      totalContribution,
      progress: paidCount / E.totalMembers,
      alreadyPaidOut: cmp(payoutDate, asOf) < 0,
    };
  }

  /* ============================================================
     COMMITMENTS between two dates
     ============================================================ */
  /* Every dated thing you owe, from any source, treated alike so that
     "mark paid" and "postpone" work the same on a bill, an Ekub round and
     a manual loan payment. */
  function billOccurrences(fromISO, toISO) {
    const raw = [];

    // Recurring bills. Generated over a wider window than asked for, so a
    // bill postponed INTO the window still shows up.
    const wideFrom = addDaysISO(fromISO, -45), wideTo = addDaysISO(toISO, 45);
    for (const b of seed.bills) {
      for (const date of occurrences(b.schedule, wideFrom, wideTo)) {
        raw.push({ ...b, date, key: `${b.id}@${date}`, kind: 'bill' });
      }
    }

    // Ekub contribution is a commitment too.
    const E = seed.ekub, es = ekubStatus();
    if (es.nextDue) {
      raw.push({
        id: 'ekub', name: `Ekub round ${es.nextRound}`, amount: E.contributionAmount,
        accountId: E.accountId, category: 'Ekub', date: es.nextDue,
        key: `ekub@${es.nextDue}`, kind: 'ekub', essential: true,
      });
    }

    // Manual loan payments you have committed to.
    for (const p of (seed.loan.manualPayments || [])) {
      raw.push({
        id: 'loan-manual', name: 'Loan payment (manual)', amount: p.amount,
        accountId: 'cbe', category: 'Debt', date: p.date,
        key: `loan@${p.date}`, kind: 'loan', essential: true, note: p.note,
      });
    }

    const out = [];
    for (const item of raw) {
      if (state.paid[item.key]) continue;                    // already settled
      const date = state.overrides[item.key] || item.date;   // postponed
      if (cmp(date, toISO) > 0) continue;
      if (cmp(date, fromISO) < 0) {
        // Something dated before the window. A recurring bill is assumed
        // already dealt with — there is no per-occurrence record to prove
        // otherwise. Ekub and loan payments DO have explicit paid tracking,
        // so an overdue one is genuinely still owed — but it only follows
        // you into a window that starts from today, not into a future month.
        if (item.kind === 'bill') continue;
        if (cmp(fromISO, asOf) > 0) continue;
      }
      out.push({ ...item, date, overdue: cmp(date, fromISO) < 0 });
    }
    return out.sort((a, b) => cmp(a.date, b.date));
  }

  function incomeOccurrences(fromISO, toISO, shiftLowConfidenceDays) {
    const out = [];
    for (const inc of seed.income) {
      for (const date of occurrences(inc.schedule, fromISO, addDaysISO(toISO, 40))) {
        let d = date;
        if (shiftLowConfidenceDays && inc.confidence !== 'high') d = addDaysISO(date, shiftLowConfidenceDays);
        if (cmp(d, fromISO) < 0 || cmp(d, toISO) > 0) continue;
        out.push({ ...inc, date: d, kind: 'income' });
      }
    }
    return out.sort((a, b) => cmp(a.date, b.date));
  }

  function addDaysISO(s, n) { return iso(addDays(D(s), n)); }

  /* ============================================================
     SAFE TO SPEND
     What is left after everything committed before the next
     dependable payday, keeping the buffer untouched.
     ============================================================ */
  function safeToSpend(onISO) {
    const from = onISO || asOf;
    const horizon = addDaysISO(from, 60);
    const reliable = incomeOccurrences(from, horizon, 0).filter(i => i.confidence === 'high');
    const nextPayday = reliable.length ? reliable[0].date : horizon;
    const committed = billOccurrences(from, nextPayday);
    const committedTotal = round2(committed.reduce((s, c) => s + c.amount, 0));
    const balance = combinedBalance(from);
    const buffer = seed.policy.bufferAmount;
    const raw = round2(balance - committedTotal - buffer);
    return {
      balance, committedTotal, buffer, nextPayday,
      daysToPayday: Math.round((D(nextPayday) - D(from)) / 86400000),
      amount: Math.max(0, raw),
      shortfall: raw < 0 ? round2(-raw) : 0,
      committed,
    };
  }

  /* ============================================================
     FORECAST — daily, three scenarios
     ============================================================ */
  function forecast(days, scenario) {
    const from = asOf;
    const to = addDaysISO(from, days);
    const shift = scenario === 'base' ? 0 : seed.policy.lateIncomeDays;
    const mult = scenario === 'stress' ? 1 + seed.policy.stressOverrun : 1;

    const inc = incomeOccurrences(from, to, shift);
    const bills = billOccurrences(from, to);

    const byDate = {};
    const push = (date, k, v, label) => {
      byDate[date] = byDate[date] || { in: 0, out: 0, events: [] };
      byDate[date][k] = round2(byDate[date][k] + v);
      byDate[date].events.push(label);
    };
    inc.forEach(i => push(i.date, 'in', i.amount, `+ ${i.name}`));
    bills.forEach(b => push(b.date, 'out', round2(b.amount * mult), `− ${b.name}`));

    let balance = combinedBalance(from);
    const series = [];
    let lowest = { balance, date: from };
    let firstNegative = null;

    for (let i = 0; i <= days; i++) {
      const date = addDaysISO(from, i);
      const d = byDate[date] || { in: 0, out: 0, events: [] };
      if (i > 0) balance = round2(balance + d.in - d.out);
      series.push({ date, in: d.in, out: d.out, balance, events: d.events });
      if (balance < lowest.balance) lowest = { balance, date };
      if (balance < 0 && !firstNegative) firstNegative = date;
    }

    return {
      scenario, series, lowest, firstNegative,
      endBalance: series[series.length - 1].balance,
      startBalance: series[0].balance,
      totalIn: round2(series.reduce((s, d) => s + d.in, 0)),
      totalOut: round2(series.reduce((s, d) => s + d.out, 0)),
    };
  }

  /* ============================================================
     RELOCATION AFFORDABILITY
     ============================================================ */
  function relocation() {
    const R = seed.relocation;
    const advance = round2(R.advanceMonths * R.newMonthlyRent);
    const upfrontNeed = round2(advance + R.deposit + R.movingCost);

    // Cash on hand at the target date under the honest (late) scenario,
    // minus the buffer we refuse to spend.
    const daysOut = Math.max(0, Math.round((D(R.targetDate) - D(asOf)) / 86400000));
    const f = forecast(daysOut, 'late');
    const availableAtTarget = round2(f.endBalance - seed.policy.bufferAmount);

    const advanceShortfall = round2(advance - availableAtTarget);
    const upfrontShortfall = round2(upfrontNeed - availableAtTarget);

    // Monthly picture after the move
    const currentRent = (seed.bills.find(b => b.category === 'Rent') || { amount: 0 }).amount;
    const monthlyIncome = round2(seed.income.reduce(
      (s, i) => s + (i.confidence === 'high' ? i.amount : 0), 0));
    const monthlyBills = round2(seed.bills.reduce((s, b) => s + b.amount, 0));
    const ekubMonthly = seed.ekub.frequency === 'monthly' ? seed.ekub.contributionAmount : 0;
    const newMonthlyOut = round2(monthlyBills - currentRent + R.newMonthlyRent + R.otherMonthlyDelta + ekubMonthly);
    const monthlyDeficit = round2(newMonthlyOut - monthlyIncome);

    const affordable = upfrontShortfall <= 0 && monthlyDeficit <= 0;
    let verdict;
    if (affordable) verdict = 'AFFORDABLE';
    else if (upfrontShortfall > 0 && monthlyDeficit > 0) verdict = 'NOT AFFORDABLE';
    else if (upfrontShortfall > 0) verdict = 'NOT AFFORDABLE — upfront cash short';
    else verdict = 'NOT AFFORDABLE — monthly deficit';

    return {
      targetDate: R.targetDate, daysOut,
      advance, upfrontNeed, availableAtTarget,
      advanceShortfall, upfrontShortfall,
      monthlyIncome, newMonthlyOut, monthlyDeficit,
      currentRent, newRent: R.newMonthlyRent,
      affordable, verdict,
      // How much more per month you'd need to save to cover the upfront need
      monthlySavingNeeded: daysOut > 0 && upfrontShortfall > 0
        ? round2(upfrontShortfall / Math.max(1, daysOut / 30)) : 0,
    };
  }

  /* ============================================================
     BUDGETS & SPENDING
     ============================================================ */
  function spendingByCategory(mk) {
    const out = {};
    for (const t of txs) {
      if (t.isTransfer) continue;
      if (t.amount >= 0) continue;                 // credits are not spending
      if (monthKey(t.date) !== mk) continue;
      const c = t.category || 'Other';
      out[c] = round2((out[c] || 0) + Math.abs(t.amount));
    }
    return out;
  }

  function budgetStatus(mk) {
    const spent = spendingByCategory(mk);
    return Object.keys(seed.budgets).map(cat => {
      const s = spent[cat] || 0, cap = seed.budgets[cat];
      return {
        category: cat, spent: s, cap,
        remaining: round2(cap - s),
        pct: cap > 0 ? s / cap : 0,
        over: s > cap,
      };
    }).sort((a, b) => b.pct - a.pct);
  }

  /* ============================================================
     ALERTS
     ============================================================ */
  function alerts() {
    const out = [];
    const sts = safeToSpend();
    const f = forecast(90, 'late');
    const es = ekubStatus();
    const ln = loanSchedule();

    if (sts.shortfall > 0)
      out.push({ level: 'danger', text: `You are ${money(sts.shortfall)} short of the bills due before ${fmtDate(sts.nextPayday)}.` });
    else if (sts.amount < seed.policy.bufferAmount)
      out.push({ level: 'warn', text: `Only ${money(sts.amount)} is genuinely free until ${fmtDate(sts.nextPayday)}.` });

    if (f.firstNegative)
      out.push({ level: 'danger', text: `If income arrives late, you run out of money on ${fmtDate(f.firstNegative)}.` });
    else if (f.lowest.balance < seed.policy.bufferAmount)
      out.push({ level: 'warn', text: `Tightest point is ${money(f.lowest.balance)} on ${fmtDate(f.lowest.date)}.` });

    if (es.overdue)
      out.push({ level: 'warn', text: `Ekub round ${es.nextRound} was due ${fmtDate(es.nextDue)} and is not marked paid.` });

    if (ln.stalled)
      out.push({ level: 'danger', text: `The loan never clears — the deduction is not reducing the balance. Check the loan figures.` });

    const r = relocation();
    if (!r.affordable)
      out.push({ level: 'warn', text: `Relocation on ${fmtDateFull(r.targetDate)}: ${r.verdict}.` });

    return out;
  }

  return {
    seed, state, txs, asOf, accountById,
    accountBalance, combinedBalance, reconcile,
    loanSchedule, ekubStatus,
    billOccurrences, incomeOccurrences, addDaysISO,
    safeToSpend, forecast, relocation,
    spendingByCategory, budgetStatus, alerts,
  };
}

function money(n) {
  const neg = n < 0;
  return (neg ? '−' : '') + 'Br ' + Math.abs(Math.round(n)).toLocaleString('en-US');
}

/* Dates shown to a person are never raw ISO. */
const _MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtDate(s) { const d = D(s); return `${_DOW[d.getDay()]} ${d.getDate()} ${_MON[d.getMonth()]}`; }
function fmtDateFull(s) { const d = D(s); return `${d.getDate()} ${_MON[d.getMonth()]} ${d.getFullYear()}`; }

if (typeof module !== 'undefined') {
  module.exports = { makeEngine, money, fmtDate, fmtDateFull, occurrences, D, iso, addDays, addMonths, dateOnDay, round2 };
}
