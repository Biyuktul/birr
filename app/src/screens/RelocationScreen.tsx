import { useStore } from '../lib/store';
import { money, fmtDateFull, round2 } from '../lib/engine';
import { Card } from '../components/ui';

export default function RelocationScreen() {
  const { data, engine } = useStore();

  if (!data.relocation.enabled) {
    return <Card title="Relocation"><div className="empty">No move is being planned. Turn it on in Setup.</div></Card>;
  }

  const r = engine.relocation();
  const R = data.relocation;
  const bad = !r.affordable;

  const fixes: React.ReactNode[] = [];
  if (r.upfrontShortfall > 0 && r.daysOut > 0) {
    fixes.push(<>Put aside <strong>{money(r.monthlySavingNeeded)} a month</strong> between now and {fmtDateFull(r.targetDate)} to cover the upfront gap.</>);
  }
  if (r.monthlyDeficit > 0) {
    fixes.push(<>Find rent at <strong>{money(round2(r.newRent - r.monthlyDeficit))}</strong> or below instead of {money(r.newRent)} — that is the most the monthly numbers support.</>);
    fixes.push(<>Or raise dependable monthly income by <strong>{money(r.monthlyDeficit)}</strong>.</>);
  }
  if (data.loan.enabled) {
    const L = engine.loanSchedule();
    if (!L.stalled) {
      fixes.push(<>After the loan clears on <strong>{fmtDateFull(L.payoffDate!)}</strong>, {money(data.loan.autoDeductAmount)} a month stops leaving your pay. Moving after that date is a different calculation — and probably the honest answer.</>);
    }
  }
  if (!fixes.length) fixes.push(<>Nothing — the move works on these numbers.</>);

  return (
    <>
      <div className="card" style={{ borderLeft: `4px solid ${bad ? 'var(--critical)' : 'var(--good)'}` }}>
        <h2>Verdict <span className="sub">— moving on {fmtDateFull(r.targetDate)}, {r.daysOut} days away</span></h2>
        <div className="hero" style={{ fontSize: 26, color: bad ? 'var(--critical)' : 'var(--good-text)' }}>
          {bad ? '✕' : '✓'} {r.verdict}
        </div>
      </div>

      <Card title="Cash needed up front">
        <div className="scroll-x">
          <table>
            <tbody>
              <tr><td>{R.advanceMonths} months rent in advance, at {money(r.newRent)}</td><td className="num">{money(r.advance)}</td></tr>
              <tr><td>Deposit</td><td className="num">{money(R.deposit)}</td></tr>
              <tr><td>Moving costs</td><td className="num">{money(R.movingCost)}</td></tr>
              <tr><td><strong>Total needed on the day</strong></td><td className="num"><strong>{money(r.upfrontNeed)}</strong></td></tr>
              <tr><td>What you will actually have (income late, buffer kept back)</td><td className="num">{money(r.availableAtTarget)}</td></tr>
              <tr>
                <td><strong>{r.upfrontShortfall > 0 ? 'Short by' : 'Spare'}</strong></td>
                <td className={`num ${r.upfrontShortfall > 0 ? 'neg' : 'pos'}`}>
                  <strong>{money(Math.abs(r.upfrontShortfall))}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {r.advanceShortfall > 0 && (
          <div className="alert danger" style={{ marginTop: 12 }}>
            <span className="ico">!</span>
            <span>
              You cannot cover the rent advance on its own — short {money(r.advanceShortfall)}{' '}
              before the deposit or moving costs are counted at all.
            </span>
          </div>
        )}
      </Card>

      <Card title="Every month after the move">
        <div className="scroll-x">
          <table>
            <tbody>
              <tr><td>Dependable income</td><td className="num pos">{money(r.monthlyIncome)}</td></tr>
              <tr><td>Rent goes from {money(r.currentRent)} to {money(r.newRent)}</td><td className="num neg">+{money(r.newRent - r.currentRent)}</td></tr>
              <tr><td>Other costs change by</td><td className="num">{money(R.otherMonthlyDelta)}</td></tr>
              <tr><td>Total going out, Ekub included</td><td className="num neg">{money(r.newMonthlyOut)}</td></tr>
              <tr>
                <td><strong>{r.monthlyDeficit > 0 ? 'Monthly shortfall' : 'Monthly surplus'}</strong></td>
                <td className={`num ${r.monthlyDeficit > 0 ? 'neg' : 'pos'}`}>
                  <strong>{money(Math.abs(r.monthlyDeficit))}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {r.monthlyDeficit > 0 && (
          <div className="alert danger" style={{ marginTop: 12 }}>
            <span className="ico">!</span>
            <span>
              Even if you scrape together the advance, you would be {money(r.monthlyDeficit)} short{' '}
              <em>every month</em> afterwards. That is the part that does not fix itself.
            </span>
          </div>
        )}
      </Card>

      <Card title="What would have to change">
        <ul style={{ paddingLeft: 20, margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
          {fixes.map((f, i) => <li key={i} style={{ marginBottom: 8 }}>{f}</li>)}
        </ul>
      </Card>
    </>
  );
}
