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
    update(d => ({
      ...d,
      loan: { ...d.loan, manualPayments: [...d.loan.manualPayments, { id: uid('p'), date, amount }] },
    }));
    setAmount(0);
    show('Payment added');
  }

  function removePayment(id: string) {
    update(d => ({
      ...d,
      loan: { ...d.loan, manualPayments: d.loan.manualPayments.filter(p => p.id !== id) },
    }));
    show('Removed');
  }

  if (!data.loan.enabled) {
    return <Card title="Loan"><div className="empty">No loan is switched on. Turn it on in Setup.</div></Card>;
  }

  return (
    <>
      <div className="tiles">
        <Tile
          label="Outstanding"
          value={money(L.startingBalance)}
          note={`${data.loan.name} · ${(data.loan.annualRate * 100).toFixed(1)}% a year`}
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

      <Card title="Pay extra" sub="on top of the payroll deduction">
        <div className="grid2">
          <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Amount"><NumberInput value={amount} onChange={setAmount} min={0} /></Field>
        </div>
        <button className="btn primary" onClick={addPayment}>Add payment and re-forecast</button>

        {data.loan.manualPayments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {data.loan.manualPayments.map(p => (
              <div className="item" key={p.id}>
                <div className="nm">{fmtDateFull(p.date)}<small>extra payment</small></div>
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
          </div>
        )}
      </Card>
      {toast}
    </>
  );
}
