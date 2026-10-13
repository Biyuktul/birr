import { useStore } from '../lib/store';
import { money, fmtDate, fmtDateFull, daysBetween } from '../lib/engine';
import { Card, Tile, useToast } from '../components/ui';

export default function EkubScreen() {
  const { data, engine, update } = useStore();
  const { toast, show } = useToast();

  if (!data.ekub.enabled) {
    return <Card title="Ekub"><div className="empty">No Ekub is switched on. Turn it on in Setup.</div></Card>;
  }

  const k = engine.ekubStatus();
  const E = data.ekub;

  function markRoundPaid(round: number, date: string) {
    update(d => ({
      ...d,
      ekub: {
        ...d.ekub,
        contributionsPaid: [...d.ekub.contributionsPaid, { round, date }]
          .sort((a, b) => a.round - b.round),
      },
    }));
    show(`Round ${round} marked paid`);
  }

  function unmarkRound(round: number) {
    update(d => ({
      ...d,
      ekub: { ...d.ekub, contributionsPaid: d.ekub.contributionsPaid.filter(c => c.round !== round) },
    }));
    show(`Round ${round} unmarked`);
  }

  return (
    <>
      <div className="tiles">
        <Tile
          label="Contributed so far"
          value={money(k.contributedSoFar)}
          note={`${k.paidCount} of ${k.totalRounds} rounds · ${money(E.contributionAmount)} each`}
        />
        <Tile
          label="Your payout"
          value={money(k.payoutAmount)}
          note={<>Round {k.payoutRound} · {k.alreadyPaidOut
            ? 'already received'
            : <>{fmtDateFull(k.payoutDate)}, in {daysBetween(engine.asOf, k.payoutDate)} days</>}</>}
        />
      </div>

      <Card title="Cycle progress">
        <div className="bar-row">
          <div className="bar-head">
            <span className="cat">Rounds paid</span>
            <span className="vals">{k.paidCount} / {k.totalRounds} · {Math.round(k.progress * 100)}%</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${k.progress * 100}%` }} />
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 14 }}>
          {k.nextDue ? (
            <>
              Round <strong>{k.nextRound}</strong> of {money(E.contributionAmount)}{' '}
              {k.overdue
                ? <strong style={{ color: 'var(--critical)' }}>was due {fmtDate(k.nextDue)}</strong>
                : <>is due {fmtDate(k.nextDue)}</>}.
              <div className="btnrow" style={{ marginTop: 10 }}>
                <button className="btn primary sm" onClick={() => markRoundPaid(k.nextRound, k.nextDue!)}>
                  Mark round {k.nextRound} paid
                </button>
              </div>
            </>
          ) : 'The cycle is finished.'}
        </div>
      </Card>

      <Card title="What Ekub actually does for you">
        <div className="scroll-x">
          <table>
            <tbody>
              <tr><td>You put in, over the whole cycle</td><td className="num">{money(k.totalContribution)}</td></tr>
              <tr><td>You take out</td><td className="num">{money(k.payoutAmount)}</td></tr>
              <tr><td>Net over the cycle</td><td className="num"><strong>{money(k.payoutAmount - k.totalContribution)}</strong></td></tr>
              <tr><td>Paid in by the time you collect (round {k.payoutRound})</td><td className="num">{money(k.contributedByPayout)}</td></tr>
              <tr>
                <td>Cash you receive ahead of your own money</td>
                <td className={`num ${k.netAtPayout >= 0 ? 'pos' : 'neg'}`}>
                  <strong>{money(k.netAtPayout)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Ekub does not create money — over a full cycle it nets to zero. What it buys is{' '}
          <em>timing</em>: {money(Math.abs(k.netAtPayout))}{' '}
          {k.netAtPayout >= 0
            ? 'arriving earlier than you could have saved it, which is the point of taking an early round.'
            : 'of your money sitting with the group — your round is late in the cycle, so you are effectively lending to it.'}
        </div>
      </Card>

      <Card title="Rounds">
        <div className="scroll-x">
          <table>
            <thead><tr><th>Round</th><th>Date</th><th>Status</th><th /></tr></thead>
            <tbody>
              {Array.from({ length: k.totalRounds }, (_, i) => i + 1).map(i => {
                const rec = E.contributionsPaid.find(c => c.round === i);
                const due = engine.ekubRoundDate(i);
                return (
                  <tr key={i}>
                    <td>{i}{i === k.payoutRound && <> <span className="pill ok">yours</span></>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(rec ? rec.date : due)}</td>
                    <td>
                      {rec ? <span className="pill ok">paid</span>
                        : i === k.nextRound
                          ? (k.overdue ? <span className="pill bad">overdue</span> : <span className="pill warn">next</span>)
                          : <span className="muted">upcoming</span>}
                    </td>
                    <td>
                      {rec && <button className="btn ghost sm" onClick={() => unmarkRound(i)}>undo</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {toast}
    </>
  );
}
