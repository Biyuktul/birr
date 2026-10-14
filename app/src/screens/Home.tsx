import { useStore } from '../lib/store';
import { money, fmtDate, fmtDateFull, daysBetween } from '../lib/engine';
import { SECTIONS } from '../lib/types';
import { Card, Tile, Alerts } from '../components/ui';
import type { Route } from '../App';

export default function Home({ go }: { go: (r: Route) => void }) {
  const { data, engine } = useStore();
  const bal = engine.combinedBalance();
  const s = engine.safeToSpend();
  const alerts = engine.alerts();
  const unconfirmed = SECTIONS.filter(x => !data.confirmed[x.key]);

  const toPayday = daysBetween(engine.asOf, s.nextPayday);

  return (
    <>
      <div className="tiles">
        <Tile
          label="Everything you have"
          value={<span className="hero">{money(bal)}</span>}
          note={`Across ${engine.activeAccounts.length} accounts`}
        />
        <Tile
          label="Safe to spend"
          value={<span className="hero">{money(s.amount)}</span>}
          color={s.shortfall > 0 ? 'var(--critical)' : 'var(--good-text)'}
          note={s.shortfall > 0
            ? <>You are <strong>{money(s.shortfall)} short</strong> of what is due before {fmtDate(s.nextPayday)}.</>
            : <>After {money(s.committedTotal)} of bills due in the next {toPayday} day{toPayday === 1 ? '' : 's'}, and a {money(s.buffer)} buffer you keep back.</>}
        />
      </div>

      <Card title="What needs attention">
        <Alerts
          items={alerts}
          go={r => go(r as Route)}
          max={6}
          emptyText="Nothing pressing. The next 90 days stay above your buffer even if income arrives late."
        />
      </Card>

      {unconfirmed.length > 0 && (
        <div className="seedwarn">
          <h3>⚠ These numbers are not yours yet</h3>
          <p>
            {unconfirmed.length} of {SECTIONS.length} sections still hold placeholder figures
            I invented so the app had something to work with. Everything above is computed
            correctly — just from the wrong inputs.
          </p>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => go('setup')}>
              Enter your real numbers
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-muted)' }}>
            Still placeholder: {unconfirmed.map(u => u.label).join(', ')}
          </div>
        </div>
      )}

      <div className="tiles">
        {data.loan.enabled && (() => {
          const ln = engine.loanSchedule();
          return (
            <Tile
              small
              label={data.loan.name}
              value={money(ln.startingBalance)}
              note={ln.stalled
                ? <span className="pill bad">never clears — check the figures</span>
                : <>
                    Clear by <strong>{fmtDateFull(ln.payoffDate!)}</strong> · {ln.monthsRemaining} payment{ln.monthsRemaining === 1 ? '' : 's'} left
                    {ln.paidSoFar > 0 && <><br />{money(ln.paidSoFar)} paid off {money(ln.confirmedBalance)}</>}
                  </>}
            />
          );
        })()}
        {data.ekub.enabled && (() => {
          const k = engine.ekubStatus();
          return (
            <Tile
              small
              label={data.ekub.name}
              value={`${k.paidCount} of ${k.totalRounds} paid`}
              note={k.nextDue
                ? <>Round {k.nextRound} {k.overdue ? <strong style={{ color: 'var(--critical)' }}>was due</strong> : 'due'} {fmtDate(k.nextDue)} · payout {money(k.payoutAmount)} on {fmtDateFull(k.payoutDate)}</>
                : 'Cycle complete'}
            />
          );
        })()}
      </div>

      <Card title="Jump to">
        <button className="rowlink" onClick={() => go('calendar')}>
          <span>What is coming</span><span className="chev">›</span>
        </button>
        <button className="rowlink" onClick={() => go('forecast')}>
          <span>90-day forecast</span><span className="chev">›</span>
        </button>
        {data.relocation.enabled && (
          <button className="rowlink" onClick={() => go('relocation')}>
            <span>Can we afford to move?</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`pill ${engine.relocation().affordable ? 'ok' : 'bad'}`}>
                {engine.relocation().affordable ? 'yes' : 'no'}
              </span>
              <span className="chev">›</span>
            </span>
          </button>
        )}
        <button className="rowlink" onClick={() => go('setup')}>
          <span>Setup</span><span className="chev">›</span>
        </button>
      </Card>
    </>
  );
}
