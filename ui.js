/* ============================================================
   BIRR — UI (vanilla, no dependencies)
   ============================================================ */

const STORE_KEY = 'birr.state.v1';

function loadState() {
  const empty = { transactions: [], overrides: {}, paid: {}, inbox: [], recon: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return empty;
    return Object.assign(empty, JSON.parse(raw));
  } catch (e) { return empty; }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); } catch (e) { /* private mode */ }
}

let STATE = loadState();
let E = makeEngine(SEED, STATE);
let TAB = 'home';

function refresh() { E = makeEngine(SEED, STATE); saveState(); render(); }

/* ---------- small helpers ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = _MON;
const pretty = fmtDate;
const prettyFull = fmtDateFull;
function relDays(isoStr) {
  const n = Math.round((D(isoStr) - D(E.asOf)) / 86400000);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 0) return `${-n} day${-n === 1 ? '' : 's'} overdue`;
  return `in ${n} days`;
}
function uid() { return 'x' + Math.random().toString(36).slice(2, 10); }

const TABS = [
  ['home', 'Home'], ['accounts', 'Accounts'], ['calendar', 'Calendar'],
  ['loan', 'Loan'], ['ekub', 'Ekub'], ['relocation', 'Relocation'],
  ['budget', 'Budget'], ['forecast', 'Forecast'], ['inbox', 'Inbox'],
  ['checks', 'Checks'],
];

/* ============================================================
   HOME
   ============================================================ */
function viewHome() {
  const bal = E.combinedBalance();
  const s = E.safeToSpend();
  const alerts = E.alerts();
  const ln = E.loanSchedule();
  const k = E.ekubStatus();

  let h = '';

  h += `<div class="tiles" style="margin-top:14px">
    <div class="tile">
      <div class="label">Everything you have</div>
      <div class="hero">${money(bal)}</div>
      <div class="note">Across ${SEED.accounts.length} accounts, as of ${prettyFull(E.asOf)}</div>
    </div>
    <div class="tile">
      <div class="label">Safe to spend</div>
      <div class="hero" style="color:${s.shortfall > 0 ? 'var(--critical)' : 'var(--good-text)'}">${money(s.amount)}</div>
      <div class="note">${s.shortfall > 0
      ? `You are <strong>${money(s.shortfall)} short</strong> of what is due before ${pretty(s.nextPayday)}.`
      : `After ${money(s.committedTotal)} of bills due before ${pretty(s.nextPayday)} (${relDays(s.nextPayday)}) and a ${money(s.buffer)} buffer.`}</div>
    </div>
  </div>`;

  if (alerts.length) {
    h += `<div class="card"><h2>What needs attention</h2>`;
    for (const a of alerts) {
      const ico = a.level === 'danger' ? '!' : a.level === 'warn' ? '△' : '✓';
      h += `<div class="alert ${a.level}"><span class="ico">${ico}</span><span>${esc(a.text)}</span></div>`;
    }
    h += `</div>`;
  } else {
    h += `<div class="card"><h2>What needs attention</h2>
      <div class="alert good"><span class="ico">✓</span><span>Nothing pressing. The next 90 days stay above your buffer even if income is late.</span></div></div>`;
  }

  h += `<div class="tiles" style="margin-top:14px">
    <div class="tile">
      <div class="label">Company loan</div>
      <div class="value sm">${money(ln.startingBalance)}</div>
      <div class="note">${ln.stalled
      ? '<span class="pill bad">never clears</span> check the figures'
      : `Clear by <strong>${prettyFull(ln.payoffDate)}</strong> · ${ln.monthsRemaining} more payment${ln.monthsRemaining === 1 ? '' : 's'}`}</div>
    </div>
    <div class="tile">
      <div class="label">Ekub</div>
      <div class="value sm">${k.paidCount} of ${k.totalRounds} paid</div>
      <div class="note">${k.nextDue
      ? `Round ${k.nextRound} ${k.overdue ? '<strong style="color:var(--critical)">was due</strong>' : 'due'} ${pretty(k.nextDue)} · payout ${money(k.payoutAmount)} on ${prettyFull(k.payoutDate)}`
      : 'Cycle complete'}</div>
    </div>
  </div>`;

  // The honesty banner — never let placeholder numbers look real.
  h += `<div class="seedwarn">
    <h3>⚠ These numbers are not yours yet</h3>
    <div style="font-size:13.5px;color:var(--text-secondary)">
      The previous session's data was lost when its container was reclaimed. The figures above are
      computed correctly, but from <strong>placeholder</strong> inputs. Edit <code>seed.js</code> to make them real.
      Still needed:
    </div>
    <ul>${NEEDS_CONFIRMATION.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:10px">
      For reference, the real data previously produced: loan payoff
      <strong>${PRIOR_SESSION_RESULTS.loanPayoffDate}</strong>, relocation
      <strong>${PRIOR_SESSION_RESULTS.relocationVerdict}</strong>
      (${money(PRIOR_SESSION_RESULTS.relocationAdvanceShortfall)} short on the advance,
      ${money(PRIOR_SESSION_RESULTS.relocationMonthlyDeficit)} monthly deficit).
      Once the seed is real again, those should roughly reappear.
    </div>
  </div>`;

  return h;
}

/* ============================================================
   ACCOUNTS
   ============================================================ */
function viewAccounts() {
  let h = `<div class="card"><h2>Accounts <span class="sub">— calculated balance vs what the bank last told you</span></h2>
  <div class="wrapper-scroll"><table><thead><tr>
    <th>Account</th><th class="num">Birr says</th><th class="num">Bank says</th><th class="num">Drift</th><th></th>
  </tr></thead><tbody>`;

  for (const a of SEED.accounts) {
    const calc = E.accountBalance(a.id);
    const stated = STATE.recon[a.id];
    const r = stated != null ? E.reconcile(a.id, stated, E.asOf) : null;
    h += `<tr>
      <td><strong>${esc(a.name)}</strong><br><span class="muted" style="font-size:11.5px">${esc(a.type)}${a.senderIds && a.senderIds.length ? ' · ' + esc(a.senderIds.join(', ')) : ''}</span></td>
      <td class="num">${money(calc)}</td>
      <td class="num"><input type="number" step="0.01" style="max-width:120px;text-align:right"
            value="${stated != null ? stated : ''}" placeholder="—"
            oninput="setRecon('${a.id}', this.value)"></td>
      <td class="num">${r ? `<span class="${r.drift === 0 ? '' : r.drift > 0 ? 'pos' : 'neg'}">${money(r.drift)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${r ? (r.clean
        ? '<span class="pill ok">matches</span>'
        : `<span class="pill bad">off by ${money(Math.abs(r.drift))}</span>`) : ''}</td>
    </tr>`;
  }
  h += `</tbody></table></div>
    <div class="muted" style="font-size:12.5px;margin-top:10px">
      Type in the balance from your latest bank SMS. A drift means a transaction is
      missing, duplicated, or a fee was charged that Birr has not seen.
    </div></div>`;

  // recent transactions
  const recent = E.txs.slice().sort((a, b) => cmp(b.date, a.date)).slice(0, 40);
  h += `<div class="card"><h2>Recorded transactions <span class="sub">— ${E.txs.length} total</span></h2>`;
  if (!recent.length) {
    h += `<div class="empty">Nothing recorded yet. Paste a bank message in the Inbox tab, or mark a bill paid in the Calendar.</div>`;
  } else {
    h += `<div class="wrapper-scroll"><table><thead><tr>
      <th>Date</th><th>Account</th><th>What</th><th>Category</th><th class="num">Amount</th><th></th>
    </tr></thead><tbody>`;
    for (const t of recent) {
      const acct = E.accountById[t.accountId];
      h += `<tr>
        <td style="white-space:nowrap">${pretty(t.date)}</td>
        <td>${esc(acct ? acct.name : t.accountId)}</td>
        <td>${esc(t.note || '—')}${t.isTransfer ? ' <span class="pill">transfer</span>' : ''}</td>
        <td>${esc(t.category || '—')}</td>
        <td class="num ${t.amount < 0 ? 'neg' : 'pos'}">${money(t.amount)}</td>
        <td><button class="btn ghost" onclick="delTx('${t.id}')">delete</button></td>
      </tr>`;
    }
    h += `</tbody></table></div>`;
  }
  h += `</div>`;
  return h;
}

/* ============================================================
   CALENDAR
   ============================================================ */
function viewCalendar() {
  const to = E.addDaysISO(E.asOf, 60);
  const items = E.billOccurrences(E.asOf, to);
  const income = E.incomeOccurrences(E.asOf, to, 0);

  const all = items.map(i => ({ ...i, flow: 'out' }))
    .concat(income.map(i => ({ ...i, flow: 'in' })))
    .sort((a, b) => cmp(a.date, b.date));

  let h = `<div class="card"><h2>Next 60 days <span class="sub">— what goes out, what comes in</span></h2>`;
  if (!all.length) { h += `<div class="empty">Nothing scheduled.</div></div>`; return h; }

  let lastDate = null;
  for (const it of all) {
    if (it.date !== lastDate) {
      if (lastDate !== null) h += `</div>`;
      h += `<div class="daygroup"><div class="dayhead">${pretty(it.date)} · ${relDays(it.date)}${it.overdue ? ' · <span style="color:var(--critical)">overdue</span>' : ''}</div>`;
      lastDate = it.date;
    }
    if (it.flow === 'in') {
      h += `<div class="item">
        <div class="nm">${esc(it.name)}<small>into ${esc((E.accountById[it.accountId] || {}).name || it.accountId)} · ${esc(it.confidence)} confidence</small></div>
        <div class="amt pos">+${money(it.amount)}</div>
      </div>`;
    } else {
      h += `<div class="item">
        <div class="nm">${esc(it.name)}<small>from ${esc((E.accountById[it.accountId] || {}).name || it.accountId)} · ${esc(it.category)}${it.essential ? ' · essential' : ''}</small></div>
        <div class="amt neg">−${money(it.amount)}</div>
        <div class="btnrow">
          <button class="btn primary" onclick="markPaid('${it.key}','${it.accountId}',${it.amount},'${esc(it.category)}','${esc(it.name).replace(/'/g, '')}','${it.date}')">Mark paid</button>
          <button class="btn" onclick="postpone('${it.key}','${it.date}',7)">+7d</button>
          <button class="btn ghost" onclick="skip('${it.key}')">Skip</button>
        </div>
      </div>`;
    }
  }
  h += `</div>`;

  const paidKeys = Object.keys(STATE.paid);
  if (paidKeys.length) {
    h += `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--grid)">
      <span class="muted" style="font-size:12.5px">${paidKeys.length} commitment${paidKeys.length === 1 ? '' : 's'} settled or skipped.</span>
      <button class="btn ghost" style="margin-left:8px" onclick="resetPaid()">Undo all</button></div>`;
  }
  h += `</div>`;
  return h;
}

/* ============================================================
   LOAN
   ============================================================ */
function viewLoan() {
  const L = E.loanSchedule();
  let h = `<div class="tiles" style="margin-top:14px">
    <div class="tile"><div class="label">Outstanding</div><div class="value">${money(L.startingBalance)}</div>
      <div class="note">${esc(SEED.loan.name)} · ${(SEED.loan.annualRate * 100).toFixed(1)}% a year</div></div>
    <div class="tile"><div class="label">Debt-free on</div>
      <div class="value">${L.stalled ? '<span style="color:var(--critical)">never</span>' : prettyFull(L.payoffDate)}</div>
      <div class="note">${L.stalled
      ? 'The monthly deduction does not cover the interest. Check the rate and deduction.'
      : `${L.monthsRemaining} payments left · ${money(L.totalInterest)} interest still to pay`}</div></div>
  </div>`;

  h += `<div class="card"><h2>Add a manual payment <span class="sub">— on top of the payroll deduction</span></h2>
    <div class="grid2">
      <div class="field"><label class="fld">Date</label><input type="date" id="lp-date" value="${E.asOf}"></div>
      <div class="field"><label class="fld">Amount</label><input type="number" id="lp-amt" placeholder="5000"></div>
    </div>
    <button class="btn primary" onclick="addLoanPayment()">Add payment and re-forecast</button>
    <div class="muted" style="font-size:12.5px;margin-top:8px">
      Added payments live in this browser only. To keep them, add them to <code>seed.js</code>
      under <code>loan.manualPayments</code>.
    </div></div>`;

  h += `<div class="card"><h2>Payoff schedule</h2><div class="wrapper-scroll"><table><thead><tr>
    <th>Month</th><th class="num">Interest</th><th class="num">Payroll</th><th class="num">Manual</th><th class="num">Balance after</th>
  </tr></thead><tbody>`;
  for (const r of L.rows) {
    h += `<tr>
      <td>${esc(r.month)}</td>
      <td class="num muted">${r.interest ? money(r.interest) : '—'}</td>
      <td class="num">${r.auto ? money(r.auto) : '—'}</td>
      <td class="num">${r.manual ? money(r.manual) : '—'}</td>
      <td class="num"><strong>${money(r.closing)}</strong></td>
    </tr>`;
  }
  h += `</tbody></table></div>
    <div class="muted" style="font-size:12.5px;margin-top:10px">
      Total still to pay ${money(L.totalPaid)} — ${money(L.startingBalance)} principal
      plus ${money(L.totalInterest)} interest.
    </div></div>`;
  return h;
}

/* ============================================================
   EKUB
   ============================================================ */
function viewEkub() {
  const k = E.ekubStatus();
  const pct = Math.round(k.progress * 100);
  let h = `<div class="tiles" style="margin-top:14px">
    <div class="tile"><div class="label">Contributed so far</div><div class="value">${money(k.contributedSoFar)}</div>
      <div class="note">${k.paidCount} of ${k.totalRounds} rounds · ${money(SEED.ekub.contributionAmount)} each</div></div>
    <div class="tile"><div class="label">Your payout</div><div class="value">${money(k.payoutAmount)}</div>
      <div class="note">Round ${k.payoutRound} · ${k.alreadyPaidOut ? 'already received' : prettyFull(k.payoutDate) + ' · ' + relDays(k.payoutDate)}</div></div>
  </div>`;

  h += `<div class="card"><h2>Cycle progress</h2>
    <div class="bar-row">
      <div class="bar-head"><span class="cat">Rounds paid</span><span class="vals">${k.paidCount} / ${k.totalRounds} · ${pct}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div style="margin-top:14px;font-size:13.5px;color:var(--text-secondary)">
      ${k.nextDue
      ? `Round <strong>${k.nextRound}</strong> of ${money(SEED.ekub.contributionAmount)} ${k.overdue
        ? `<strong style="color:var(--critical)">was due ${pretty(k.nextDue)}</strong> and is not marked paid`
        : `is due ${pretty(k.nextDue)} (${relDays(k.nextDue)})`}.`
      : 'The cycle is finished.'}
    </div></div>`;

  h += `<div class="card"><h2>What Ekub actually does for you</h2>
    <div class="wrapper-scroll"><table><tbody>
      <tr><td>You will put in, over the whole cycle</td><td class="num">${money(k.totalContribution)}</td></tr>
      <tr><td>You will take out</td><td class="num">${money(k.payoutAmount)}</td></tr>
      <tr><td>Net over the cycle</td><td class="num"><strong>${money(k.payoutAmount - k.totalContribution)}</strong></td></tr>
      <tr><td>Paid in by the time you collect (round ${k.payoutRound})</td><td class="num">${money(k.contributedByPayout)}</td></tr>
      <tr><td>Cash you get ahead of your own money at payout</td><td class="num ${k.netAtPayout >= 0 ? 'pos' : 'neg'}"><strong>${money(k.netAtPayout)}</strong></td></tr>
    </tbody></table></div>
    <div class="muted" style="font-size:12.5px;margin-top:10px">
      Ekub does not create money — over a full cycle it nets to zero. What it buys you is
      <em>timing</em>: ${money(k.netAtPayout)} arriving earlier than you could have saved it,
      ${k.netAtPayout >= 0 ? 'which is the whole point of taking an early round.' : 'meaning your round is late in the cycle — you are effectively lending to the group.'}
    </div></div>`;

  h += `<div class="card"><h2>Rounds</h2><div class="wrapper-scroll"><table><thead><tr>
    <th>Round</th><th>Date</th><th>Status</th></tr></thead><tbody>`;
  for (let i = 1; i <= k.totalRounds; i++) {
    const rec = (SEED.ekub.contributionsPaid || []).find(c => c.round === i);
    const mine = i === k.payoutRound;
    h += `<tr>
      <td>${i}${mine ? ' <span class="pill ok">your payout</span>' : ''}</td>
      <td>${rec ? pretty(rec.date) : '<span class="muted">—</span>'}</td>
      <td>${rec ? '<span class="pill ok">paid</span>'
        : i === k.nextRound ? (k.overdue ? '<span class="pill bad">overdue</span>' : '<span class="pill warn">next</span>')
          : '<span class="muted">upcoming</span>'}</td>
    </tr>`;
  }
  h += `</tbody></table></div></div>`;
  return h;
}

/* ============================================================
   RELOCATION
   ============================================================ */
function viewRelocation() {
  const r = E.relocation();
  const bad = !r.affordable;
  let h = `<div class="card" style="border-left:4px solid ${bad ? 'var(--critical)' : 'var(--good)'}">
    <h2>Verdict <span class="sub">— moving on ${prettyFull(r.targetDate)}, ${r.daysOut} days away</span></h2>
    <div class="hero" style="color:${bad ? 'var(--critical)' : 'var(--good-text)'};font-size:28px">
      ${bad ? '✕' : '✓'} ${esc(r.verdict)}</div>
  </div>`;

  h += `<div class="card"><h2>Cash needed up front</h2><div class="wrapper-scroll"><table><tbody>
    <tr><td>${SEED.relocation.advanceMonths} months rent in advance, at ${money(r.newRent)}</td><td class="num">${money(r.advance)}</td></tr>
    <tr><td>Deposit</td><td class="num">${money(SEED.relocation.deposit)}</td></tr>
    <tr><td>Moving costs</td><td class="num">${money(SEED.relocation.movingCost)}</td></tr>
    <tr><td><strong>Total needed on the day</strong></td><td class="num"><strong>${money(r.upfrontNeed)}</strong></td></tr>
    <tr><td>Cash you will actually have (income arriving late, buffer kept back)</td><td class="num">${money(r.availableAtTarget)}</td></tr>
    <tr><td><strong>${r.upfrontShortfall > 0 ? 'Short by' : 'Spare'}</strong></td>
        <td class="num ${r.upfrontShortfall > 0 ? 'neg' : 'pos'}"><strong>${money(Math.abs(r.upfrontShortfall))}</strong></td></tr>
  </tbody></table></div>
  ${r.advanceShortfall > 0 ? `<div class="alert danger" style="margin-top:12px"><span class="ico">!</span><span>
    You cannot even cover the rent advance on its own — short ${money(r.advanceShortfall)} before
    deposit or moving costs are counted.</span></div>` : ''}
  </div>`;

  h += `<div class="card"><h2>Every month after the move</h2><div class="wrapper-scroll"><table><tbody>
    <tr><td>Dependable income</td><td class="num pos">${money(r.monthlyIncome)}</td></tr>
    <tr><td>Rent goes from ${money(r.currentRent)} to ${money(r.newRent)}</td><td class="num neg">+${money(r.newRent - r.currentRent)}</td></tr>
    <tr><td>Other costs change by</td><td class="num">${money(SEED.relocation.otherMonthlyDelta)}</td></tr>
    <tr><td>Total going out, including Ekub</td><td class="num neg">${money(r.newMonthlyOut)}</td></tr>
    <tr><td><strong>${r.monthlyDeficit > 0 ? 'Monthly shortfall' : 'Monthly surplus'}</strong></td>
        <td class="num ${r.monthlyDeficit > 0 ? 'neg' : 'pos'}"><strong>${money(Math.abs(r.monthlyDeficit))}</strong></td></tr>
  </tbody></table></div>
  ${r.monthlyDeficit > 0 ? `<div class="alert danger" style="margin-top:12px"><span class="ico">!</span><span>
    Even if you scrape together the advance, you would run ${money(r.monthlyDeficit)} short
    <em>every month</em> afterwards. That is the part that does not fix itself.</span></div>` : ''}
  </div>`;

  h += `<div class="card"><h2>What would have to change</h2><div style="font-size:13.5px;color:var(--text-secondary)">`;
  const fixes = [];
  if (r.upfrontShortfall > 0 && r.daysOut > 0) {
    fixes.push(`Save <strong>${money(r.monthlySavingNeeded)} a month</strong> between now and ${prettyFull(r.targetDate)} to cover the upfront gap.`);
  }
  if (r.monthlyDeficit > 0) {
    const affordableRent = round2(r.newRent - r.monthlyDeficit);
    fixes.push(`Find rent at <strong>${money(affordableRent)}</strong> or below instead of ${money(r.newRent)} — that is the most the monthly numbers support.`);
    fixes.push(`Or raise dependable monthly income by <strong>${money(r.monthlyDeficit)}</strong>.`);
  }
  if (SEED.loan.autoDeductAmount > 0) {
    const L = E.loanSchedule();
    if (!L.stalled) fixes.push(`After the loan clears on <strong>${prettyFull(L.payoffDate)}</strong>, ${money(SEED.loan.autoDeductAmount)} a month stops leaving your payroll. Moving after that date is a different calculation — and probably the honest answer.`);
  }
  if (!fixes.length) fixes.push('Nothing — the move works on these numbers.');
  h += `<ul style="padding-left:20px;margin:0">${fixes.map(f => `<li style="margin-bottom:6px">${f}</li>`).join('')}</ul>`;
  h += `</div></div>`;
  return h;
}

/* ============================================================
   BUDGET
   ============================================================ */
function viewBudget() {
  const mk = E.asOf.slice(0, 7);
  const rows = E.budgetStatus(mk);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const cap = rows.reduce((s, r) => s + r.cap, 0);

  let h = `<div class="tiles" style="margin-top:14px">
    <div class="tile"><div class="label">Spent this month</div><div class="value">${money(spent)}</div>
      <div class="note">of ${money(cap)} budgeted · ${MON[D(E.asOf).getMonth()]} ${D(E.asOf).getFullYear()}</div></div>
    <div class="tile"><div class="label">Left to spend</div>
      <div class="value" style="color:${cap - spent < 0 ? 'var(--critical)' : 'var(--good-text)'}">${money(cap - spent)}</div>
      <div class="note">${rows.filter(r => r.over).length} categor${rows.filter(r => r.over).length === 1 ? 'y' : 'ies'} over budget</div></div>
  </div>`;

  h += `<div class="card"><h2>By category <span class="sub">— the mark is your cap</span></h2>`;
  for (const r of rows) {
    const w = Math.min(100, r.pct * 100);
    h += `<div class="bar-row">
      <div class="bar-head">
        <span class="cat">${esc(r.category)} ${r.over ? '<span class="pill bad">over</span>' : ''}</span>
        <span class="vals">${money(r.spent)} of ${money(r.cap)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${r.over ? 'over' : ''}" style="width:${w}%"></div>
        <div class="bar-cap" style="left:calc(100% - 1px)"></div>
      </div>
    </div>`;
  }
  if (spent === 0) {
    h += `<div class="empty" style="margin-top:12px">No spending recorded this month yet, so every bar is empty.
      Log something in the Inbox tab and it will appear here.</div>`;
  }
  h += `</div>`;
  return h;
}

/* ============================================================
   FORECAST — line chart, 3 scenarios
   ============================================================ */
let FC_DAYS = 90;
function viewForecast() {
  const scen = [
    { id: 'base', label: 'Income on time', color: 'var(--series-1)' },
    { id: 'late', label: `Income ${SEED.policy.lateIncomeDays} days late`, color: 'var(--series-2)' },
    { id: 'stress', label: `Late + ${Math.round(SEED.policy.stressOverrun * 100)}% overspend`, color: 'var(--series-3)' },
  ];
  const runs = scen.map(s => ({ ...s, f: E.forecast(FC_DAYS, s.id) }));

  let h = `<div class="card">
    <h2>Next ${FC_DAYS} days <span class="sub">— three ways it could go</span></h2>
    <div class="btnrow" style="margin-bottom:12px">
      ${[30, 60, 90, 180].map(d => `<button class="btn ${d === FC_DAYS ? 'primary' : ''}" onclick="setDays(${d})">${d} days</button>`).join('')}
    </div>
    <div class="legend">${runs.map(r => `<span class="key"><span class="swatch" style="background:${r.color}"></span>${esc(r.label)}</span>`).join('')}</div>
    ${chartForecast(runs)}
  </div>`;

  h += `<div class="tiles" style="margin-top:14px">`;
  for (const r of runs) {
    const danger = r.f.firstNegative;
    h += `<div class="tile">
      <div class="label"><span class="swatch" style="display:inline-block;width:12px;height:2.5px;border-radius:2px;background:${r.color};vertical-align:middle;margin-right:5px"></span>${esc(r.label)}</div>
      <div class="value sm" style="color:${danger ? 'var(--critical)' : r.f.lowest.balance < SEED.policy.bufferAmount ? 'var(--serious)' : 'var(--good-text)'}">
        ${money(r.f.lowest.balance)}</div>
      <div class="note">Lowest point, ${pretty(r.f.lowest.date)}.
        ${danger ? `<strong style="color:var(--critical)">Out of money ${pretty(danger)}.</strong>` : 'Never goes below zero.'}
        <br>Ends at ${money(r.f.endBalance)}.</div>
    </div>`;
  }
  h += `</div>`;

  // Table view — required relief for the light-mode aqua contrast warning,
  // and the honest way to read exact figures anyway.
  const base = runs[0].f;
  const notable = base.series.filter(d => d.events.length);
  h += `<div class="card"><h2>Every money event <span class="sub">— table view of the chart above</span></h2>
    <div class="wrapper-scroll"><table><thead><tr>
      <th>Date</th><th>What happens</th><th class="num">In</th><th class="num">Out</th>
      ${runs.map(r => `<th class="num">${esc(r.label)}</th>`).join('')}
    </tr></thead><tbody>`;
  for (const d of notable) {
    h += `<tr><td style="white-space:nowrap">${pretty(d.date)}</td>
      <td style="font-size:12.5px">${d.events.map(esc).join('<br>')}</td>
      <td class="num pos">${d.in ? money(d.in) : '—'}</td>
      <td class="num neg">${d.out ? money(d.out) : '—'}</td>
      ${runs.map(r => {
    const row = r.f.series.find(x => x.date === d.date);
    const v = row ? row.balance : 0;
    return `<td class="num ${v < 0 ? 'neg' : ''}">${money(v)}</td>`;
  }).join('')}
    </tr>`;
  }
  if (!notable.length) h += `<tr><td colspan="7" class="empty">No scheduled money events in this window.</td></tr>`;
  h += `</tbody></table></div></div>`;
  return h;
}

function chartForecast(runs) {
  const W = 760, H = 260, P = { t: 14, r: 54, b: 28, l: 56 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const n = runs[0].f.series.length;

  let lo = Infinity, hi = -Infinity;
  runs.forEach(r => r.f.series.forEach(d => { lo = Math.min(lo, d.balance); hi = Math.max(hi, d.balance); }));
  lo = Math.min(lo, 0); hi = Math.max(hi, 1);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;

  const x = i => P.l + (i / Math.max(1, n - 1)) * iw;
  const y = v => P.t + ih - ((v - lo) / (hi - lo)) * ih;

  // gridlines at round numbers
  const ticks = [];
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, hi - lo)))) / 2;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  let g = `<div class="chart-shell"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Projected combined balance over ${FC_DAYS} days under three income scenarios">`;

  // grid
  for (const v of ticks) {
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"
      stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${P.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end"
      font-size="10.5" fill="var(--text-muted)" style="font-variant-numeric:tabular-nums">${Math.round(v / 1000)}k</text>`;
  }
  // zero line emphasised — the line that matters
  if (lo < 0 && hi > 0) {
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"
      stroke="var(--critical)" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.8"/>`;
  }
  // baseline
  g += `<line x1="${P.l}" x2="${W - P.r}" y1="${P.t + ih}" y2="${P.t + ih}" stroke="var(--baseline)" stroke-width="1"/>`;

  // x labels: first, middle, last
  [0, Math.floor((n - 1) / 2), n - 1].forEach(i => {
    const d = runs[0].f.series[i];
    g += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}"
      font-size="10.5" fill="var(--text-muted)">${pretty(d.date)}</text>`;
  });

  // lines
  runs.forEach(r => {
    const pts = r.f.series.map((d, i) => `${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${r.color}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round"/>`;
  });

  // direct end labels (identity never by color alone)
  const ends = runs.map(r => ({ r, v: r.f.endBalance, yy: y(r.f.endBalance) }))
    .sort((a, b) => a.yy - b.yy);
  let prevY = -Infinity;
  ends.forEach(e => {
    let yy = e.yy;
    if (yy - prevY < 12) yy = prevY + 12;   // nudge apart so labels never collide
    prevY = yy;
    g += `<circle cx="${x(n - 1).toFixed(1)}" cy="${e.yy.toFixed(1)}" r="3.5"
      fill="${e.r.color}" stroke="var(--surface-1)" stroke-width="2"/>`;
    g += `<text x="${(x(n - 1) + 8).toFixed(1)}" y="${(yy + 3.5).toFixed(1)}" font-size="10.5"
      fill="var(--text-secondary)" style="font-variant-numeric:tabular-nums">${money(e.v)}</text>`;
  });

  // lowest point marker on the honest (late) scenario
  const late = runs.find(r => r.id === 'late') || runs[0];
  const li = late.f.series.findIndex(d => d.date === late.f.lowest.date);
  if (li >= 0) {
    g += `<circle cx="${x(li).toFixed(1)}" cy="${y(late.f.lowest.balance).toFixed(1)}" r="4"
      fill="none" stroke="${late.color}" stroke-width="2"/>`;
  }

  // hover layer
  g += `<g id="fc-cross" opacity="0">
      <line y1="${P.t}" y2="${P.t + ih}" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 3"/>
    </g>`;
  g += `<rect x="${P.l}" y="${P.t}" width="${iw}" height="${ih}" fill="transparent"
      style="cursor:crosshair" onmousemove="fcHover(event, ${P.l}, ${iw}, ${n})"
      onmouseleave="fcLeave()"/>`;
  g += `</svg><div class="tooltip" id="fc-tip"></div></div>`;
  return g;
}

/* hover state kept out of the markup so re-render does not fight it */
let FC_RUNS_CACHE = null;
function fcHover(ev, left, iw, n) {
  const svg = ev.currentTarget.ownerSVGElement;
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
  let i = Math.round(((loc.x - left) / iw) * (n - 1));
  i = Math.max(0, Math.min(n - 1, i));

  const runs = [
    { label: 'Income on time', color: 'var(--series-1)', f: E.forecast(FC_DAYS, 'base') },
    { label: `Income ${SEED.policy.lateIncomeDays} days late`, color: 'var(--series-2)', f: E.forecast(FC_DAYS, 'late') },
    { label: `Late + ${Math.round(SEED.policy.stressOverrun * 100)}% overspend`, color: 'var(--series-3)', f: E.forecast(FC_DAYS, 'stress') },
  ];
  const d0 = runs[0].f.series[i];
  const cross = document.getElementById('fc-cross');
  const xPos = left + (i / Math.max(1, n - 1)) * iw;
  if (cross) {
    cross.setAttribute('opacity', '1');
    cross.querySelector('line').setAttribute('x1', xPos);
    cross.querySelector('line').setAttribute('x2', xPos);
  }
  const tip = document.getElementById('fc-tip');
  if (!tip) return;
  tip.innerHTML = `<div class="tt-date">${pretty(d0.date)}</div>` +
    runs.map(r => {
      const v = r.f.series[i].balance;
      return `<div class="tt-row"><span><span class="swatch" style="display:inline-block;width:10px;height:2.5px;border-radius:2px;background:${r.color};vertical-align:middle;margin-right:5px"></span>${esc(r.label)}</span><span class="${v < 0 ? 'neg' : ''}">${money(v)}</span></div>`;
    }).join('') +
    (d0.events.length ? `<div class="tt-ev">${d0.events.map(esc).join('<br>')}</div>` : '');
  tip.style.opacity = '1';
  const shell = tip.parentElement.getBoundingClientRect();
  let lx = ev.clientX - shell.left + 14;
  if (lx + 180 > shell.width) lx = ev.clientX - shell.left - 194;
  tip.style.left = Math.max(0, lx) + 'px';
  tip.style.top = Math.max(0, ev.clientY - shell.top - 10) + 'px';
}
function fcLeave() {
  const c = document.getElementById('fc-cross'); if (c) c.setAttribute('opacity', '0');
  const t = document.getElementById('fc-tip'); if (t) t.style.opacity = '0';
}
function setDays(d) { FC_DAYS = d; render(); }

/* ============================================================
   INBOX — paste a bank SMS, turn it into a transaction
   ============================================================ */
function viewInbox() {
  let h = `<div class="card"><h2>Paste a bank message</h2>
    <div class="field"><label class="fld">Sender (as it shows on your phone)</label>
      <input type="text" id="sms-sender" placeholder="127, CBE, Dashen…"></div>
    <div class="field"><label class="fld">Message</label>
      <textarea id="sms-body" placeholder="Paste the whole SMS here, exactly as received"></textarea></div>
    <div class="btnrow">
      <button class="btn primary" onclick="parseInbox()">Read it</button>
      <button class="btn" onclick="loadSample()">Load a sample</button>
    </div>
    <div class="muted" style="font-size:12.5px;margin-top:10px">
      On Android this happens automatically. On iPhone there is no SMS access at all —
      this paste box is the fallback.
    </div></div>`;

  if (!STATE.inbox.length) {
    h += `<div class="card"><h2>Pending</h2><div class="empty">Nothing waiting. Parsed messages land here for you to confirm.</div></div>`;
    return h;
  }

  h += `<div class="card"><h2>Pending <span class="sub">— ${STATE.inbox.length} to confirm</span></h2>`;
  STATE.inbox.forEach((p, idx) => {
    const acct = p.accountId ? E.accountById[p.accountId] : null;
    const conf = p.confidence >= 0.7 ? 'ok' : p.confidence >= 0.45 ? 'warn' : 'bad';
    h += `<div style="padding:12px 0;border-bottom:1px solid var(--grid)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">
        <div><strong>${esc(p.providerLabel)}</strong>
          <span class="pill ${conf}">${Math.round(p.confidence * 100)}% sure</span>
          ${p.looksLikeTransfer ? '<span class="pill">looks like your own transfer</span>' : ''}</div>
        <div class="amt ${p.signedAmount < 0 ? 'neg' : 'pos'}" style="font-size:17px;font-weight:650">
          ${p.signedAmount != null ? money(p.signedAmount) : '<span class="muted">amount unclear</span>'}</div>
      </div>
      <div class="muted" style="font-size:12px;margin:6px 0">${esc(p.raw)}</div>`;

    if (p.missing.length) {
      h += `<div class="alert warn" style="margin:8px 0"><span class="ico">△</span><span>
        Could not work out: ${esc(p.missing.join(', '))}. Fill it in below.</span></div>`;
    }
    if (p.statedBalance != null && p.accountId) {
      const r = E.reconcile(p.accountId, p.statedBalance, E.asOf);
      h += `<div class="alert ${r.clean ? 'good' : 'warn'}" style="margin:8px 0">
        <span class="ico">${r.clean ? '✓' : '△'}</span><span>
        The bank says ${money(r.stated)}; Birr calculates ${money(r.calculated)}.
        ${r.clean ? 'They agree.' : `<strong>Off by ${money(Math.abs(r.drift))}</strong> — something is missing.`}</span></div>`;
    }

    h += `<div class="grid2">
      <div class="field"><label class="fld">Account</label>
        <select onchange="setInbox(${idx},'accountId',this.value)">
          <option value="">— which account? —</option>
          ${SEED.accounts.map(a => `<option value="${a.id}" ${p.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label class="fld">What was this for?</label>
        <select onchange="setInbox(${idx},'category',this.value)">
          <option value="">— category —</option>
          ${SEED.categories.map(c => `<option value="${esc(c)}" ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select></div>
      <div class="field"><label class="fld">Amount</label>
        <input type="number" step="0.01" value="${p.amount != null ? p.amount : ''}"
          oninput="setInbox(${idx},'amount',this.value===''?null:parseFloat(this.value))"></div>
      <div class="field"><label class="fld">Direction</label>
        <select onchange="setInbox(${idx},'direction',this.value)">
          <option value="debit" ${p.direction === 'debit' ? 'selected' : ''}>Money out</option>
          <option value="credit" ${p.direction === 'credit' ? 'selected' : ''}>Money in</option>
        </select></div>
      <div class="field"><label class="fld">Date</label>
        <input type="date" value="${p.date || E.asOf}" oninput="setInbox(${idx},'date',this.value)"></div>
      <div class="field"><label class="fld">Note</label>
        <input type="text" value="${esc(p.counterparty || '')}" placeholder="who or what"
          oninput="setInbox(${idx},'counterparty',this.value)"></div>
    </div>
    <div class="btnrow">
      <button class="btn primary" onclick="commitInbox(${idx})">Log it</button>
      <button class="btn" onclick="setInbox(${idx},'looksLikeTransfer',${!p.looksLikeTransfer})">
        ${p.looksLikeTransfer ? 'Not a transfer' : 'This is my own transfer'}</button>
      <button class="btn ghost" onclick="dropInbox(${idx})">Discard</button>
    </div></div>`;
  });
  h += `</div>`;
  return h;
}

const SAMPLES = [
  ['CBE', 'Dear customer your account 1****5678 has been debited with ETB 450.00 on 13/10/2026. Your current balance is ETB 3,120.00. Ref FT26286XYZ'],
  ['127', 'You have transferred ETB 250.00 to ABEBE KEBEDE. Your current balance is ETB 880.50. transaction number CAB1234567'],
  ['CBE', 'Your account 1****5678 has been credited with ETB 28,000.00. Current balance is ETB 31,120.00'],
  ['127', 'You have transferred ETB 1,000.00 to your CBE account. Your balance is ETB 120.00'],
];
let sampleIdx = 0;
function loadSample() {
  const [s, b] = SAMPLES[sampleIdx % SAMPLES.length];
  sampleIdx++;
  document.getElementById('sms-sender').value = s;
  document.getElementById('sms-body').value = b;
}

function parseInbox() {
  const sender = document.getElementById('sms-sender').value.trim();
  const body = document.getElementById('sms-body').value.trim();
  if (!body) return;
  const p = parseMessage(sender, body, SEED.accounts);
  p.id = uid();
  p.date = E.asOf;
  p.category = p.looksLikeTransfer ? null : null;
  STATE.inbox.unshift(p);
  document.getElementById('sms-body').value = '';
  refresh();
}
function setInbox(i, k, v) {
  STATE.inbox[i][k] = v;
  if (k === 'amount' || k === 'direction') {
    const p = STATE.inbox[i];
    p.signedAmount = p.amount == null || !p.direction ? null
      : (p.direction === 'debit' ? -p.amount : p.amount);
  }
  saveState();
  if (k !== 'amount' && k !== 'counterparty') render();
}
function dropInbox(i) { STATE.inbox.splice(i, 1); refresh(); }
function commitInbox(i) {
  const p = STATE.inbox[i];
  if (p.amount == null || !p.direction) { alert('Set the amount and whether money went in or out.'); return; }
  if (!p.accountId) { alert('Pick which account this was.'); return; }
  const signed = p.direction === 'debit' ? -Math.abs(p.amount) : Math.abs(p.amount);
  STATE.transactions.push({
    id: uid(), date: p.date || E.asOf, accountId: p.accountId,
    amount: signed, category: p.looksLikeTransfer ? null : (p.category || 'Other'),
    note: p.counterparty || p.providerLabel, isTransfer: !!p.looksLikeTransfer,
    source: 'sms', statedBalance: p.statedBalance,
  });
  if (p.statedBalance != null) STATE.recon[p.accountId] = p.statedBalance;
  STATE.inbox.splice(i, 1);
  refresh();
}

/* ============================================================
   CHECKS
   ============================================================ */
function viewChecks() {
  const out = runTests({ makeEngine, parseMessage, SEED });
  let h = `<div class="card" style="border-left:4px solid ${out.allPass ? 'var(--good)' : 'var(--critical)'}">
    <h2>Engine self-validation</h2>
    <div class="hero" style="font-size:28px;color:${out.allPass ? 'var(--good-text)' : 'var(--critical)'}">
      ${out.passed} of ${out.total} checks pass</div>
    <div class="note" style="font-size:13px;color:var(--text-secondary);margin-top:6px">
      ${out.allPass
      ? 'Every figure on every screen is derived from logic that checks out against these assertions.'
      : 'Something is wrong. Do not trust the numbers until these pass.'}
    </div></div>`;
  h += `<div class="card"><h2>Each check</h2>`;
  for (const r of out.results) {
    h += `<div class="check ${r.pass ? 'pass' : 'fail'}">
      <span class="mk">${r.pass ? '✓' : '✕'}</span>
      <span>${r.n}. ${esc(r.name)}${r.pass ? '' : `<br><span class="detail">${esc(r.detail)}</span>`}</span>
    </div>`;
  }
  h += `</div>`;
  return h;
}

/* ============================================================
   ACTIONS
   ============================================================ */
function markPaid(key, accountId, amount, category, name, date) {
  STATE.paid[key] = true;
  STATE.transactions.push({
    id: uid(), date, accountId, amount: -Math.abs(amount),
    category, note: name, isTransfer: false, source: 'calendar',
  });
  refresh();
}
function skip(key) { STATE.paid[key] = true; refresh(); }
function postpone(key, date, days) { STATE.overrides[key] = E.addDaysISO(date, days); refresh(); }
function resetPaid() { STATE.paid = {}; STATE.overrides = {}; refresh(); }
function delTx(id) {
  STATE.transactions = STATE.transactions.filter(t => t.id !== id);
  refresh();
}
function setRecon(id, v) {
  if (v === '') delete STATE.recon[id]; else STATE.recon[id] = parseFloat(v);
  saveState();
  clearTimeout(setRecon._t);
  setRecon._t = setTimeout(render, 450);
}
function addLoanPayment() {
  const d = document.getElementById('lp-date').value;
  const a = parseFloat(document.getElementById('lp-amt').value);
  if (!d || !a || a <= 0) { alert('Enter a date and an amount.'); return; }
  SEED.loan.manualPayments.push({ date: d, amount: a, note: 'added in app' });
  refresh();
}
function go(t) { TAB = t; window.scrollTo(0, 0); render(); }

/* ============================================================
   RENDER
   ============================================================ */
const VIEWS = {
  home: viewHome, accounts: viewAccounts, calendar: viewCalendar,
  loan: viewLoan, ekub: viewEkub, relocation: viewRelocation,
  budget: viewBudget, forecast: viewForecast, inbox: viewInbox,
  checks: viewChecks,
};

function render() {
  document.getElementById('tabs').innerHTML = TABS.map(([id, label]) =>
    `<button aria-selected="${id === TAB}" onclick="go('${id}')">${label}</button>`).join('');
  let body;
  try {
    body = VIEWS[TAB]();
  } catch (e) {
    body = `<div class="card" style="border-left:4px solid var(--critical)">
      <h2>This screen failed to draw</h2>
      <div style="font-size:13.5px">${esc(e.message)}</div>
      <pre style="font-size:11px;overflow:auto;color:var(--text-muted)">${esc(e.stack || '')}</pre></div>`;
  }
  document.getElementById('view').innerHTML = body;
  document.getElementById('asof').textContent = 'as of ' + prettyFull(E.asOf);
}

document.addEventListener('DOMContentLoaded', render);
