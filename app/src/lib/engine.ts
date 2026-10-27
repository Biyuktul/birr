/* ============================================================
   BIRR — FINANCIAL ENGINE
   Pure functions over a Data object. No React, no storage, no IO.
   Everything the app claims about money is computed here.
   ============================================================ */

import type {
  Data, ISODate, Schedule, Commitment, IncomeOccurrence, SafeToSpend,
  Forecast, ForecastDay, Scenario, LoanSchedule, LoanRow, EkubStatus,
  RelocationResult, Reconciliation, BudgetRow, Alert, Account,
  LendingStatus, LendingItem, Granularity, PeriodSpend, CategorySpend, SpendingReport,
} from './types';

/* ---------- dates: local time, never UTC-shifted ---------- */
export function D(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function iso(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
export function addMonths(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x;
}
export function addDaysISO(s: ISODate, n: number): ISODate { return iso(addDays(D(s), n)); }
export function daysInMonth(y: number, m: number): number { return new Date(y, m + 1, 0).getDate(); }
export function cmp(a: ISODate, b: ISODate): number { return a < b ? -1 : a > b ? 1 : 0; }
export function monthKey(s: ISODate): string { return s.slice(0, 7); }
export function round2(n: number): number { return Math.round(n * 100) / 100; }
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((D(b).getTime() - D(a).getTime()) / 86400000);
}

/** A day-of-month clamped to a month that may be shorter (31 -> 30 -> 28). */
export function dateOnDay(year: number, monthIdx: number, dayOfMonth: number): Date {
  return new Date(year, monthIdx, Math.min(dayOfMonth, daysInMonth(year, monthIdx)));
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function money(n: number): string {
  return (n < 0 ? '−' : '') + 'Br ' + Math.abs(Math.round(n)).toLocaleString('en-US');
}
export function fmtDate(s: ISODate): string {
  const d = D(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
export function fmtDateFull(s: ISODate): string {
  const d = D(s); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtMonth(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return `${MON[m - 1]} ${y}`;
}

/* ---------- schedules -> concrete dates ---------- */
export function occurrences(schedule: Schedule, fromISO: ISODate, toISO: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const from = D(fromISO), to = D(toISO);
  if (schedule.type === 'weekly') {
    let d = new Date(from);
    const target = schedule.dayOfWeek ?? 1;
    while (d.getDay() !== target) d = addDays(d, 1);
    while (d <= to) { out.push(iso(d)); d = addDays(d, 7); }
    return out;
  }
  const dom = schedule.dayOfMonth ?? 1;
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor <= to) {
    const d = dateOnDay(cursor.getFullYear(), cursor.getMonth(), dom);
    if (d >= from && d <= to) out.push(iso(d));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/* ============================================================
   ENGINE
   ============================================================ */
export function makeEngine(data: Data) {
  const asOf = data.meta.asOf;
  const accountById: Record<string, Account> = {};
  data.accounts.forEach(a => { accountById[a.id] = a; });
  const activeAccounts = data.accounts.filter(a => !a.archived);

  /* ---------- balances ---------- */
  function accountBalance(accountId: string, onISO?: ISODate): number {
    const acct = accountById[accountId];
    if (!acct) return 0;
    const upTo = onISO || asOf;
    let bal = acct.opening;
    for (const t of data.transactions) {
      if (t.accountId !== accountId) continue;
      // anything before the opening date is already inside the opening figure
      if (cmp(t.date, acct.openingDate) < 0) continue;
      if (cmp(t.date, upTo) > 0) continue;
      bal += t.amount;
    }
    return round2(bal);
  }

  function combinedBalance(onISO?: ISODate): number {
    return round2(activeAccounts.reduce((s, a) => s + accountBalance(a.id, onISO), 0));
  }

  function reconcile(accountId: string, statedBalance: number, onISO?: ISODate): Reconciliation {
    const calculated = accountBalance(accountId, onISO);
    const drift = round2(statedBalance - calculated);
    return {
      accountId, calculated, stated: round2(statedBalance), drift,
      clean: Math.abs(drift) <= data.policy.driftAlertThreshold,
    };
  }

  /* ============================================================
     LOAN
     ============================================================ */
  /** Payments you have recorded against the loan, split by whether they have happened yet. */
  function loanPayments() {
    const L = data.loan;
    const since = L.balanceAsOf || null;
    // On or after the confirmation date. Confirming "you owe 78,557 today" and
    // then paying 5,000 today must reduce it — using "strictly after" silently
    // swallowed same-day payments, which is the usual case.
    const counts = (p: { date: ISODate }) =>
      since == null ? true : cmp(p.date, since) >= 0;
    let paidSoFar = 0, plannedAhead = 0;
    for (const p of L.manualPayments || []) {
      if (!counts(p)) continue;
      if (cmp(p.date, asOf) <= 0) paidSoFar = round2(paidSoFar + p.amount);
      else plannedAhead = round2(plannedAhead + p.amount);
    }
    return { paidSoFar, plannedAhead };
  }

  /**
   * What you owe right now. The stored balance is what the lender last
   * confirmed; every payment you have recorded since then comes straight off
   * it, so one payment changes this figure everywhere it is shown.
   */
  function loanOutstanding(): number {
    if (!data.loan.enabled) return 0;
    return Math.max(0, round2(data.loan.balance - loanPayments().paidSoFar));
  }

  function loanSchedule(): LoanSchedule {
    const L = data.loan;
    const { paidSoFar, plannedAhead } = loanPayments();
    const outstanding = loanOutstanding();
    const empty: LoanSchedule = {
      rows: [], payoffDate: null, totalInterest: 0, totalPaid: 0,
      monthsRemaining: 0, startingBalance: outstanding,
      confirmedBalance: L.balance, paidSoFar, plannedAhead, stalled: false,
    };
    if (!L.enabled || outstanding <= 0) return empty;

    let balance = outstanding;
    const monthlyRate = (L.annualRate || 0) / 12;
    const rows: LoanRow[] = [];
    let totalInterest = 0, totalPaid = 0;
    const manual = [...(L.manualPayments || [])].sort((a, b) => cmp(a.date, b.date));
    const used = new Set<string>();
    let payoffDate: ISODate | null = null;
    const start = D(asOf);

    for (let i = 0; i < 600 && balance > 0.005; i++) {
      const monthDate = addMonths(new Date(start.getFullYear(), start.getMonth(), 1), i);
      const y = monthDate.getFullYear(), m = monthDate.getMonth();

      const interest = round2(balance * monthlyRate);
      balance = round2(balance + interest);
      totalInterest = round2(totalInterest + interest);

      let monthManual = 0;
      let lastEventDate: ISODate | null = null;
      for (const p of manual) {
        if (used.has(p.id)) continue;
        const pd = D(p.date);
        if (pd.getFullYear() === y && pd.getMonth() === m && cmp(p.date, asOf) > 0) {
          const pay = Math.min(p.amount, balance);
          balance = round2(balance - pay);
          monthManual = round2(monthManual + pay);
          totalPaid = round2(totalPaid + pay);
          used.add(p.id);
          lastEventDate = p.date;
        }
      }

      const autoDate = dateOnDay(y, m, L.autoDeductDay);
      let autoPaid = 0;
      if (balance > 0.005 && iso(autoDate) >= asOf) {
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
      if (autoPaid === 0 && monthManual === 0 && balance > 0) break;  // nothing paying it down
    }

    return {
      rows, payoffDate, totalInterest, totalPaid,
      monthsRemaining: rows.length,
      startingBalance: outstanding,
      confirmedBalance: L.balance,
      paidSoFar, plannedAhead,
      stalled: payoffDate === null,
    };
  }

  /* ============================================================
     EKUB
     ============================================================ */
  function ekubRoundDate(n: number): ISODate {
    const E = data.ekub;
    if (E.frequency === 'weekly') return addDaysISO(E.startDate, 7 * (n - 1));
    const s = D(E.startDate);
    const m = addMonths(new Date(s.getFullYear(), s.getMonth(), 1), n - 1);
    return iso(dateOnDay(m.getFullYear(), m.getMonth(), E.dayOfMonth));
  }

  /** What a given round costs — the usual amount unless that round recorded
   *  something different. */
  function ekubAmountFor(round: number): number {
    const rec = (data.ekub.contributionsPaid || []).find(c => c.round === round);
    return rec?.amount ?? data.ekub.contributionAmount;
  }

  function ekubStatus(): EkubStatus {
    const E = data.ekub;
    const paid = [...(E.contributionsPaid || [])].sort((a, b) => a.round - b.round);
    const paidCount = paid.length;
    const payoutAmount = round2(E.contributionAmount * E.totalMembers);
    // the first round with nothing recorded against it, not simply "count + 1",
    // so rounds paid out of order still work
    const nextRound = (() => {
      for (let i = 1; i <= E.totalMembers; i++) {
        if (!paid.some(c => c.round === i)) return i;
      }
      return E.totalMembers + 1;
    })();
    const nextDue = nextRound <= E.totalMembers ? ekubRoundDate(nextRound) : null;
    const payoutDate = ekubRoundDate(E.myPayoutRound);
    // what actually left your pocket, not the nominal amount times the count
    const contributedSoFar = round2(paid.reduce((t, c) => t + (c.amount ?? E.contributionAmount), 0));
    const contributedByPayout = round2(E.contributionAmount * E.myPayoutRound);

    return {
      paidCount, totalRounds: E.totalMembers, nextRound, nextDue,
      overdue: nextDue !== null && cmp(nextDue, asOf) < 0,
      payoutAmount, payoutDate, payoutRound: E.myPayoutRound,
      contributedSoFar, contributedByPayout,
      netAtPayout: round2(payoutAmount - contributedByPayout),
      totalContribution: round2(E.contributionAmount * E.totalMembers),
      progress: E.totalMembers > 0 ? paidCount / E.totalMembers : 0,
      alreadyPaidOut: cmp(payoutDate, asOf) < 0,
    };
  }

  /* ============================================================
     MONEY YOU HAVE LENT OUT
     It has left your accounts, so it is not spendable — but it is
     still yours, so it is reported separately rather than ignored.
     ============================================================ */
  function lendingStatus(): LendingStatus {
    const items: LendingItem[] = (data.lending || []).map(l => {
      const repaid = round2((l.repayments || []).reduce((t, r) => t + r.amount, 0));
      const outstanding = round2(Math.max(0, l.amount - repaid));
      const settled = outstanding <= 0.005;
      const daysLate = !settled && l.dueOn && cmp(l.dueOn, asOf) < 0
        ? daysBetween(l.dueOn, asOf) : 0;
      return { ...l, repaid, outstanding, settled, overdue: daysLate > 0, daysLate };
    }).sort((a, b) => {
      if (a.settled !== b.settled) return a.settled ? 1 : -1;      // open first
      if (a.dueOn && b.dueOn) return cmp(a.dueOn, b.dueOn);        // soonest due
      if (a.dueOn) return -1;
      if (b.dueOn) return 1;
      return cmp(b.lentOn, a.lentOn);
    });

    const open = items.filter(i => !i.settled);
    return {
      items,
      totalOut: round2(items.reduce((t, i) => t + i.amount, 0)),
      totalRepaid: round2(items.reduce((t, i) => t + i.repaid, 0)),
      outstanding: round2(open.reduce((t, i) => t + i.outstanding, 0)),
      overdueCount: open.filter(i => i.overdue).length,
      overdueAmount: round2(open.filter(i => i.overdue).reduce((t, i) => t + i.outstanding, 0)),
    };
  }

  /** Which account a category is meant to be paid from, if one claims it. */
  function accountForCategory(category: string | null | undefined): string | null {
    if (!category) return null;
    const match = activeAccounts.find(a => (a.categories || []).includes(category));
    return match ? match.id : null;
  }

  /** What an account is for, in words. */
  function accountPurpose(accountId: string): string | null {
    const a = accountById[accountId];
    if (!a) return null;
    if (a.purpose && a.purpose.trim()) return a.purpose.trim();
    const cats = a.categories || [];
    return cats.length ? cats.join(', ') : null;
  }

  /* ============================================================
     COMMITMENTS
     Everything dated that you owe, from any source, treated alike
     so mark-paid and postpone work the same on all of them.
     ============================================================ */
  function commitments(fromISO: ISODate, toISO: ISODate): Commitment[] {
    const raw: Commitment[] = [];

    // widen the generation window so a bill postponed INTO it still appears
    const wideFrom = addDaysISO(fromISO, -45), wideTo = addDaysISO(toISO, 45);
    for (const b of data.bills) {
      if (!b.active) continue;
      for (const date of occurrences(b.schedule, wideFrom, wideTo)) {
        raw.push({
          id: b.id, key: `${b.id}@${date}`, name: b.name, amount: b.amount,
          accountId: b.accountId, category: b.category, date,
          kind: 'bill', essential: b.essential, overdue: false,
        });
      }
    }

    if (data.ekub.enabled) {
      const es = ekubStatus();
      if (es.nextDue) {
        raw.push({
          id: 'ekub', key: `ekub@${es.nextDue}`, name: `Ekub round ${es.nextRound}`,
          amount: ekubAmountFor(es.nextRound), accountId: data.ekub.accountId,
          category: 'Ekub', date: es.nextDue, kind: 'ekub', essential: true, overdue: false,
        });
      }
    }

    if (data.loan.enabled) {
      for (const p of data.loan.manualPayments || []) {
        // Only money you still owe is a commitment. A payment dated today or
        // earlier has already left your account and is off the balance.
        if (cmp(p.date, asOf) <= 0) continue;
        raw.push({
          id: 'loan-' + p.id, key: `loan@${p.id}`, name: 'Loan payment',
          amount: p.amount, accountId: data.loan.accountId, category: 'Debt',
          date: p.date, kind: 'loan', essential: true, overdue: false, note: p.note,
        });
      }
    }

    const out: Commitment[] = [];
    for (const item of raw) {
      if (data.paid[item.key]) continue;
      const date = data.overrides[item.key] || item.date;
      if (cmp(date, toISO) > 0) continue;
      if (cmp(date, fromISO) < 0) {
        // A recurring bill dated before the window is assumed already dealt
        // with — there is no per-occurrence record to prove otherwise.
        // Ekub and loan payments DO have explicit tracking, so an overdue one
        // is genuinely still owed — but it only follows you into a window that
        // starts from today, not into some future month you are browsing.
        if (item.kind === 'bill') continue;
        if (cmp(fromISO, asOf) > 0) continue;
      }
      out.push({ ...item, date, overdue: cmp(date, asOf) < 0 });
    }
    return out.sort((a, b) => cmp(a.date, b.date));
  }

  function incomeOccurrences(fromISO: ISODate, toISO: ISODate, shiftUnreliable = 0): IncomeOccurrence[] {
    const out: IncomeOccurrence[] = [];
    for (const inc of data.income) {
      if (!inc.active) continue;
      for (const date of occurrences(inc.schedule, fromISO, addDaysISO(toISO, 40))) {
        const d = shiftUnreliable && inc.confidence !== 'high'
          ? addDaysISO(date, shiftUnreliable) : date;
        if (cmp(d, fromISO) < 0 || cmp(d, toISO) > 0) continue;
        out.push({ ...inc, date: d });
      }
    }
    return out.sort((a, b) => cmp(a.date, b.date));
  }

  /* ============================================================
     SAFE TO SPEND
     ============================================================ */
  function safeToSpend(onISO?: ISODate): SafeToSpend {
    const from = onISO || asOf;
    const horizon = addDaysISO(from, 60);
    const reliable = incomeOccurrences(from, horizon).filter(i => i.confidence === 'high');
    const nextPayday = reliable.length ? reliable[0].date : horizon;
    const committed = commitments(from, nextPayday);
    const committedTotal = round2(committed.reduce((s, c) => s + c.amount, 0));
    const balance = combinedBalance(from);
    const buffer = data.policy.bufferAmount;
    const raw = round2(balance - committedTotal - buffer);
    return {
      balance, committedTotal, buffer, nextPayday,
      daysToPayday: daysBetween(from, nextPayday),
      amount: Math.max(0, raw),
      shortfall: raw < 0 ? round2(-raw) : 0,
      committed,
    };
  }

  /* ============================================================
     FORECAST
     ============================================================ */
  function forecast(days: number, scenario: Scenario): Forecast {
    const from = asOf;
    const to = addDaysISO(from, days);
    const shift = scenario === 'base' ? 0 : data.policy.lateIncomeDays;
    const mult = scenario === 'stress' ? 1 + data.policy.stressOverrun : 1;

    const inc = incomeOccurrences(from, to, shift);
    const bills = commitments(from, to);

    const byDate: Record<string, { in: number; out: number; events: string[] }> = {};
    const push = (date: ISODate, k: 'in' | 'out', v: number, label: string) => {
      if (!byDate[date]) byDate[date] = { in: 0, out: 0, events: [] };
      byDate[date][k] = round2(byDate[date][k] + v);
      byDate[date].events.push(label);
    };
    inc.forEach(i => push(i.date, 'in', i.amount, `+ ${i.name}`));
    bills.forEach(b => push(b.date, 'out', round2(b.amount * mult), `− ${b.name}`));

    let balance = combinedBalance(from);
    const series: ForecastDay[] = [];
    let lowest = { balance, date: from };
    let firstNegative: ISODate | null = null;

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
     RELOCATION
     ============================================================ */
  function relocation(): RelocationResult {
    const R = data.relocation;
    const advance = round2(R.advanceMonths * R.newMonthlyRent);
    const upfrontNeed = round2(advance + R.deposit + R.movingCost);
    const daysOut = Math.max(0, daysBetween(asOf, R.targetDate));

    // what you will actually have, assuming income is late and the buffer stays untouched
    const f = forecast(daysOut, 'late');
    const availableAtTarget = round2(f.endBalance - data.policy.bufferAmount);

    const advanceShortfall = round2(advance - availableAtTarget);
    const upfrontShortfall = round2(upfrontNeed - availableAtTarget);

    const rentBill = data.bills.find(b => b.active && b.category === 'Rent');
    const currentRent = rentBill ? rentBill.amount : 0;
    const monthlyIncome = round2(data.income
      .filter(i => i.active && i.confidence === 'high')
      .reduce((s, i) => s + i.amount, 0));
    const monthlyBills = round2(data.bills.filter(b => b.active).reduce((s, b) => s + b.amount, 0));
    const ekubMonthly = data.ekub.enabled && data.ekub.frequency === 'monthly'
      ? data.ekub.contributionAmount : 0;
    const newMonthlyOut = round2(
      monthlyBills - currentRent + R.newMonthlyRent + R.otherMonthlyDelta + ekubMonthly);
    const monthlyDeficit = round2(newMonthlyOut - monthlyIncome);

    const affordable = upfrontShortfall <= 0 && monthlyDeficit <= 0;
    let verdict: string;
    if (affordable) verdict = 'AFFORDABLE';
    else if (upfrontShortfall > 0 && monthlyDeficit > 0) verdict = 'NOT AFFORDABLE';
    else if (upfrontShortfall > 0) verdict = 'NOT AFFORDABLE — upfront cash short';
    else verdict = 'NOT AFFORDABLE — monthly deficit';

    return {
      targetDate: R.targetDate, daysOut, advance, upfrontNeed, availableAtTarget,
      advanceShortfall, upfrontShortfall, monthlyIncome, newMonthlyOut, monthlyDeficit,
      currentRent, newRent: R.newMonthlyRent, affordable, verdict,
      monthlySavingNeeded: daysOut > 0 && upfrontShortfall > 0
        ? round2(upfrontShortfall / Math.max(1, daysOut / 30)) : 0,
    };
  }

  /* ============================================================
     WHAT YOU HAVE ACTUALLY SPENT
     Read from recorded transactions only — this is history, not the
     plan. Transfers between your own accounts, balance corrections
     and money lent out are all excluded: none of them is spending.
     ============================================================ */
  function isSpending(t: { amount: number; isTransfer?: boolean; isAdjustment?: boolean; isLending?: boolean }): boolean {
    return t.amount < 0 && !t.isTransfer && !t.isAdjustment && !t.isLending;
  }

  /** Monday of the week containing the date. */
  function weekStart(d: ISODate): ISODate {
    const x = D(d);
    const shift = (x.getDay() + 6) % 7;          // Monday = 0
    return addDaysISO(d, -shift);
  }

  function periodOf(g: Granularity, d: ISODate): { from: ISODate; to: ISODate } {
    if (g === 'day') return { from: d, to: d };
    if (g === 'week') {
      const from = weekStart(d);
      return { from, to: addDaysISO(from, 6) };
    }
    const x = D(d);
    const from = iso(new Date(x.getFullYear(), x.getMonth(), 1));
    const to = iso(new Date(x.getFullYear(), x.getMonth() + 1, 0));
    return { from, to };
  }

  function stepBack(g: Granularity, d: ISODate, n: number): ISODate {
    if (g === 'day') return addDaysISO(d, -n);
    if (g === 'week') return addDaysISO(d, -7 * n);
    const x = D(d);
    return iso(new Date(x.getFullYear(), x.getMonth() - n, 1));
  }

  function labelFor(g: Granularity, from: ISODate): { label: string; longLabel: string } {
    const d = D(from);
    if (g === 'day') {
      return {
        label: `${DOW[d.getDay()]} ${d.getDate()}`,
        longLabel: fmtDate(from),
      };
    }
    if (g === 'week') {
      return {
        label: `${d.getDate()} ${MON[d.getMonth()]}`,
        longLabel: `week of ${fmtDate(from)}`,
      };
    }
    return {
      label: MON[d.getMonth()],
      longLabel: `${MON[d.getMonth()]} ${d.getFullYear()}`,
    };
  }

  /** Spending per period, oldest first, ending with the one containing today. */
  function spendingOverTime(g: Granularity, count: number): PeriodSpend[] {
    const out: PeriodSpend[] = [];
    const todayPeriod = periodOf(g, asOf);

    for (let i = count - 1; i >= 0; i--) {
      const anchorDate = stepBack(g, todayPeriod.from, i);
      const { from, to } = periodOf(g, anchorDate);
      const byCategory: Record<string, number> = {};
      let total = 0;

      for (const t of data.transactions) {
        if (!isSpending(t)) continue;
        if (cmp(t.date, from) < 0 || cmp(t.date, to) > 0) continue;
        const amount = Math.abs(t.amount);
        const c = t.category || 'Other';
        byCategory[c] = round2((byCategory[c] || 0) + amount);
        total = round2(total + amount);
      }

      const { label, longLabel } = labelFor(g, from);
      out.push({
        key: from, label, longLabel, from, to, total, byCategory,
        current: from === todayPeriod.from,
      });
    }
    return out;
  }

  /**
   * The full picture for a granularity: every period, the one being looked
   * at, how its categories break down, and how each category has moved.
   */
  function spendingReport(g: Granularity, count: number, selectedKey?: string): SpendingReport {
    const periods = spendingOverTime(g, count);
    const idx = selectedKey ? periods.findIndex(p => p.key === selectedKey) : -1;
    const at = idx >= 0 ? idx : periods.length - 1;
    const selected = periods[at];
    const previousTotal = at > 0 ? periods[at - 1].total : 0;

    const categories: CategorySpend[] = Object.keys(selected.byCategory)
      .map(category => ({
        category,
        total: selected.byCategory[category],
        share: selected.total > 0 ? selected.byCategory[category] / selected.total : 0,
        trend: periods.map(p => p.byCategory[category] || 0),
      }))
      .sort((a, b) => b.total - a.total);

    const withSpend = periods.filter(p => p.total > 0);
    return {
      granularity: g,
      periods,
      selected,
      categories,
      previousTotal,
      change: round2(selected.total - previousTotal),
      average: withSpend.length
        ? round2(withSpend.reduce((t, p) => t + p.total, 0) / withSpend.length) : 0,
      empty: periods.every(p => p.total === 0),
    };
  }

  /** One category, period by period — "what do the children cost me a month". */
  function categoryOverTime(category: string, g: Granularity, count: number): PeriodSpend[] {
    return spendingOverTime(g, count).map(p => ({
      ...p,
      total: p.byCategory[category] || 0,
      byCategory: { [category]: p.byCategory[category] || 0 },
    }));
  }

  /** Every transaction behind a figure, so any total can be opened up. */
  function spendingIn(from: ISODate, to: ISODate, category?: string) {
    return data.transactions
      .filter(t => isSpending(t)
        && cmp(t.date, from) >= 0 && cmp(t.date, to) <= 0
        && (!category || (t.category || 'Other') === category))
      .sort((a, b) => cmp(b.date, a.date));
  }

  /* ============================================================
     BUDGETS
     ============================================================ */
  function spendingByCategory(mk: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of data.transactions) {
      if (!isSpending(t)) continue;                 // one definition, used everywhere
      if (monthKey(t.date) !== mk) continue;
      const c = t.category || 'Other';
      out[c] = round2((out[c] || 0) + Math.abs(t.amount));
    }
    return out;
  }

  function budgetStatus(mk: string): BudgetRow[] {
    const spent = spendingByCategory(mk);
    return Object.keys(data.budgets).map(cat => {
      const s = spent[cat] || 0, cap = data.budgets[cat];
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
  function alerts(): Alert[] {
    const out: Alert[] = [];
    const sts = safeToSpend();
    const f = forecast(90, 'late');
    const soon = addDaysISO(asOf, 10);

    /* Money lent out that is past the date it was due back. */
    {
      const lend = lendingStatus();
      for (const i of lend.items.filter(x => x.overdue)) {
        out.push({
          level: 'warn',
          text: `${i.person} was due to return ${money(i.outstanding)} on ${fmtDate(i.dueOn!)}`
            + ` — ${i.daysLate} day${i.daysLate === 1 ? '' : 's'} ago.`,
          action: { label: 'Open', route: 'lending' },
          date: i.dueOn,
        });
      }
      const soonBack = lend.items.filter(
        x => !x.settled && !x.overdue && x.dueOn && cmp(x.dueOn, soon) <= 0);
      for (const i of soonBack) {
        out.push({
          level: 'info',
          text: `${i.person} is due to return ${money(i.outstanding)} on ${fmtDate(i.dueOn!)}.`,
          action: { label: 'Open', route: 'lending' },
          date: i.dueOn,
        });
      }
    }

    /* Messages captured by the phone shortcut land in the inbox unconfirmed.
       Nothing touches the balances until they are, so say so here —
       otherwise they sit unnoticed. */
    if (data.inbox.length > 0) {
      out.push({
        level: 'warn',
        text: `${data.inbox.length} bank message${data.inbox.length === 1 ? '' : 's'} waiting — `
          + 'nothing is counted until you confirm it.',
        action: { label: 'Open messages', route: 'inbox' },
      });
    }

    /* ---------- things that are wrong ---------- */
    if (sts.shortfall > 0)
      out.push({
        level: 'danger',
        text: `You are ${money(sts.shortfall)} short of the bills due before ${fmtDate(sts.nextPayday)}.`,
        action: { label: 'See what is due', route: 'calendar' },
      });
    else if (sts.amount < data.policy.bufferAmount)
      out.push({
        level: 'warn',
        text: `Only ${money(sts.amount)} is genuinely free until ${fmtDate(sts.nextPayday)}.`,
        action: { label: 'See what is due', route: 'calendar' },
      });

    if (f.firstNegative)
      out.push({
        level: 'danger',
        text: `If income arrives late, you run out of money on ${fmtDate(f.firstNegative)}.`,
        action: { label: 'Open the forecast', route: 'forecast' }, date: f.firstNegative,
      });
    else if (f.lowest.balance < data.policy.bufferAmount)
      out.push({
        level: 'warn',
        text: `Tightest point is ${money(f.lowest.balance)} on ${fmtDate(f.lowest.date)}.`,
        action: { label: 'Open the forecast', route: 'forecast' }, date: f.lowest.date,
      });

    if (data.loan.enabled && loanSchedule().stalled)
      out.push({
        level: 'danger',
        text: `The loan never clears — the deduction is not covering the interest.`,
        action: { label: 'Check the figures', route: 'loan' },
      });

    /* ---------- what is coming ---------- */
    if (data.ekub.enabled) {
      const es = ekubStatus();
      if (es.nextDue) {
        const days = daysBetween(asOf, es.nextDue);
        if (es.overdue)
          out.push({
            level: 'warn',
            text: `Ekub round ${es.nextRound} was due ${fmtDate(es.nextDue)} — ${money(data.ekub.contributionAmount)} is still unpaid.`,
            action: { label: 'Mark it paid', route: 'ekub' }, date: es.nextDue,
          });
        else
          out.push({
            level: 'info',
            text: `Ekub round ${es.nextRound} — ${money(data.ekub.contributionAmount)} due ${fmtDate(es.nextDue)}${days <= 14 ? ` (${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`})` : ''}.`,
            action: { label: 'Open Ekub', route: 'ekub' }, date: es.nextDue,
          });
      }
      if (!es.alreadyPaidOut && daysBetween(asOf, es.payoutDate) <= 45)
        out.push({
          level: 'info',
          text: `Your Ekub payout of ${money(es.payoutAmount)} is expected ${fmtDate(es.payoutDate)}. It stays out of your balance until you mark it received.`,
          action: { label: 'Open Ekub', route: 'ekub' }, date: es.payoutDate,
        });
    }

    if (data.loan.enabled) {
      const ln = loanSchedule();
      if (ln.paidSoFar > 0 && !ln.stalled)
        out.push({
          level: 'good',
          text: `You have paid ${money(ln.paidSoFar)} off the loan — ${money(ln.startingBalance)} left, clear by ${fmtDate(ln.payoffDate!)}.`,
          action: { label: 'Open loan', route: 'loan' },
        });
      if (ln.plannedAhead > 0)
        out.push({
          level: 'info',
          text: `${money(ln.plannedAhead)} of loan payments are scheduled but not paid yet.`,
          action: { label: 'Open loan', route: 'loan' },
        });
    }

    for (const c of commitments(asOf, soon)) {
      if (c.kind === 'ekub') continue;                 // already said above
      const days = daysBetween(asOf, c.date);
      out.push({
        level: c.overdue ? 'warn' : 'info',
        text: c.overdue
          ? `${c.name} — ${money(c.amount)} was due ${fmtDate(c.date)}.`
          : `${c.name} — ${money(c.amount)} due ${fmtDate(c.date)}${days === 0 ? ' (today)' : days === 1 ? ' (tomorrow)' : ` (in ${days} days)`}.`,
        action: { label: 'Open calendar', route: 'calendar' }, date: c.date,
      });
    }

    const nextIn = incomeOccurrences(asOf, soon)[0];
    if (nextIn)
      out.push({
        level: 'info',
        text: `${nextIn.name} of ${money(nextIn.amount)} expected ${fmtDate(nextIn.date)}. Mark it received when it lands.`,
        action: { label: 'Open calendar', route: 'calendar' }, date: nextIn.date,
      });

    /* ---------- housekeeping ---------- */
    if (data.inbox && data.inbox.length)
      out.push({
        level: 'warn',
        text: `${data.inbox.length} bank message${data.inbox.length === 1 ? '' : 's'} waiting to be filed. Your balances are behind until you do.`,
        action: { label: 'Open inbox', route: 'inbox' },
      });

    for (const a of activeAccounts) {
      const stated = data.recon[a.id];
      if (stated == null) continue;
      const r = reconcile(a.id, stated);
      if (r.clean) continue;
      const source = a.type === 'cash' ? 'what you last counted' : 'the balance the bank last stated';
      out.push({
        level: 'warn',
        text: `${a.name} is off by ${money(Math.abs(r.drift))} against ${source}.`,
        action: { label: 'Reconcile', route: 'accounts' },
      });
    }

    if (data.relocation.enabled) {
      const r = relocation();
      if (!r.affordable)
        out.push({
          level: 'warn',
          text: `Relocation on ${fmtDateFull(r.targetDate)}: ${r.verdict}.`,
          action: { label: 'Open the plan', route: 'relocation' }, date: r.targetDate,
        });
    }

    const rank: Record<string, number> = { danger: 0, warn: 1, good: 2, info: 3 };
    return out.sort((a, b) =>
      rank[a.level] - rank[b.level] ||
      (a.date && b.date ? cmp(a.date, b.date) : a.date ? -1 : b.date ? 1 : 0));
  }

  return {
    data, asOf, accountById, activeAccounts,
    accountBalance, combinedBalance, reconcile,
    loanSchedule, loanOutstanding, loanPayments, ekubStatus, ekubRoundDate, ekubAmountFor,
    lendingStatus, accountForCategory, accountPurpose,
    spendingOverTime, spendingReport, categoryOverTime, spendingIn, periodOf,
    commitments, incomeOccurrences,
    safeToSpend, forecast, relocation,
    spendingByCategory, budgetStatus, alerts,
  };
}

export type Engine = ReturnType<typeof makeEngine>;
