import { useState } from 'react';
import { useStore } from '../lib/store';
import { money, fmtDateFull, fmtMonth } from '../lib/engine';
import { uid } from '../lib/defaults';
import { Card, Tile, Field, NumberInput, useToast } from '../components/ui';

export default function LoanScreen() {
  const { data, engine, update } = useStore();
  const { toast, show } = useToast();
  const [date, setDate] = useState(engine.asOf);
  const [amount, setAmount] = useState(0);

  const L = engine.loanSchedule();

  function addPayment() {
    if (!date || amount <= 0) { show('Enter a date and an amount'); return; }
    if (amount > L.startingBalance + 0.005) {
      show(`That is more than you owe. The balance is ${money(L.startingBalance)}.`);
      return;
    }
    update(d => ({
      ...d,
      loan: { ...d.loan, manualPayments: [...d.loan.manualPayments, { id: uid('p'), date, amount }] },
    }));
    const future = date > engine.asOf;
    show(future
      ? `Scheduled ${money(amount)} for ${fmtDateFull(date)}. It comes off the balance on the day.`
      : `Paid ${money(amount)}. The loan is now ${money(L.startingBalance - amount)}.`);
    setAmount(0);
  }

  function removePayment(id: string) {
    const p = data.loan.manualPayments.find(x => x.id === id);
    update(d => ({
      ...d,
      loan: { ...d.loan, manualPayments: d.loan.manualPayments.filter(x => x.id !== id) },
    }));
    show(p && p.date <= engine.asOf
      ? `Removed. The loan goes back to ${money(L.startingBalance + p.amount)}.`
      : 'Removed.');
  }

  if (!data.loan.enabled) {
    return <Card title="Loan"><div className="empty">No loan is switched on. Turn it on in Setup.</div></Card>;
  }

  return (
    <>
      <div className="tiles">
        <Tile
          label="You owe now"
          value={money(L.startingBalance)}
          note={L.paidSoFar > 0
            ? <>{money(L.confirmedBalance)} confirmed with the lender, less <strong>{money(L.paidSoFar)}</strong> you have paid since
               {L.plannedAhead > 0 && <> · {money(L.plannedAhead)} more scheduled</>}</>
            : <>{data.loan.name} · {(data.loan.annualRate * 100).toFixed(1)}% a year</>}
        />
        <Tile
          label="Debt-free on"
          value={L.stalled ? <span style={{ color: 'var(--critical)' }}>never</span> : fmtDateFull(L.payoffDate!)}
          note={L.stalled
            ? 'The monthly deduction does not cover the interest. Check the rate and the deduction amount.'
            : <>{L.monthsRemaining} payment{L.monthsRemaining === 1 ? '' : 's'} left · {money(L.totalInterest)} interest still to pay</>}
        />
      </div>

      {data.loan.deductedFromPayroll && (
        <div className="alert good" style={{ marginTop: 14 }}>
          <span className="ico">✓</span>
          <span>
            This is taken from your pay before you see it, so Birr counts your salary net of it
            and does <strong>not</strong> subtract it again as cash going out.
          </span>
        </div>
      )}

      <Card title="Record a payment" sub="any payment you make on top of the payroll deduction">
        <div className="grid2">
          <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Amount"><NumberInput value={amount} onChange={setAmount} min={0} /></Field>
        </div>
        <div className="btnrow" style={{ marginBottom: 10 }}>
          {[1000, 2000, 5000, 12000].map(v => (
            <button key={v} className="btn ghost sm" onClick={() => setAmount(v)}>{money(v)}</button>
          ))}
          <button className="btn ghost sm" onClick={() => setAmount(Math.round(L.startingBalance))}>
            Clear it: {money(L.startingBalance)}
          </button>
        </div>
        <button className="btn primary" onClick={addPayment}>
          {amount > 0 ? <>Pay {money(amount)} — balance becomes {money(Math.max(0, L.startingBalance - amount))}</> : 'Record payment'}
        </button>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          Dated today or earlier it comes off the balance straight away, everywhere in the app.
          Dated in the future it is money set aside, and Birr counts it as still owed until that day.
        </div>

        {data.loan.manualPayments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {[...data.loan.manualPayments].sort((a, b) => (a.date < b.date ? 1 : -1)).map(p => (
              <div className="item" key={p.id}>
                <div className="nm">
                  {fmtDateFull(p.date)}
                  <small>{p.date <= engine.asOf ? 'paid — off the balance' : 'scheduled — still owed'}</small>
                </div>
                <div className="amt">{money(p.amount)}</div>
                <button className="btn ghost sm" onClick={() => removePayment(p.id)}>remove</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Payoff schedule">
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Interest</th>
                <th className="num">Payroll</th>
                <th className="num">Extra</th>
                <th className="num">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {L.rows.map(r => (
                <tr key={r.month}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtMonth(r.month)}</td>
                  <td className="num muted">{r.interest ? money(r.interest) : '—'}</td>
                  <td className="num">{r.auto ? money(r.auto) : '—'}</td>
                  <td className="num">{r.manual ? money(r.manual) : '—'}</td>
                  <td className="num"><strong>{money(r.closing)}</strong></td>
                </tr>
              ))}
              {!L.rows.length && <tr><td colSpan={5} className="empty">Nothing scheduled.</td></tr>}
            </tbody>
          </table>
        </div>
        {L.rows.length > 0 && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Still to pay {money(L.totalPaid)} — {money(L.startingBalance)} principal
            plus {money(L.totalInterest)} interest.
            {L.paidSoFar > 0 && <> You have already paid {money(L.paidSoFar)}.</>}
          </div>
        )}
      </Card>
      {toast}
    </>
  );
}
