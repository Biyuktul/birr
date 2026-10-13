import { useStore } from '../lib/store';
import { money, fmtMonth } from '../lib/engine';
import { Card, Tile } from '../components/ui';

export default function Budget() {
  const { engine } = useStore();
  const mk = engine.asOf.slice(0, 7);
  const rows = engine.budgetStatus(mk);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const cap = rows.reduce((s, r) => s + r.cap, 0);
  const over = rows.filter(r => r.over).length;

  return (
    <>
      <div className="tiles">
        <Tile
          label="Spent this month"
          value={money(spent)}
          note={`of ${money(cap)} budgeted · ${fmtMonth(mk)}`}
        />
        <Tile
          label="Left to spend"
          value={money(cap - spent)}
          color={cap - spent < 0 ? 'var(--critical)' : 'var(--good-text)'}
          note={`${over} categor${over === 1 ? 'y' : 'ies'} over budget`}
        />
      </div>

      <Card title="By category" sub="the bar fills to your cap">
        {rows.map(r => (
          <div className="bar-row" key={r.category}>
            <div className="bar-head">
              <span className="cat">
                {r.category} {r.over && <span className="pill bad">over</span>}
              </span>
              <span className="vals">{money(r.spent)} of {money(r.cap)}</span>
            </div>
            <div className="bar-track">
              <div
                className={`bar-fill ${r.over ? 'over' : ''}`}
                style={{ width: `${Math.min(100, r.pct * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {spent === 0 && (
          <div className="empty" style={{ marginTop: 12 }}>
            Nothing logged this month yet, so every bar is empty. Log something from
            Messages, or mark a bill paid, and it will show up here.
          </div>
        )}
      </Card>
    </>
  );
}
