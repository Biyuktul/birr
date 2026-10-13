import { useState } from 'react';
import { useStore } from '../lib/store';
import { money, fmtDate } from '../lib/engine';
import { Card, Tile } from '../components/ui';
import ForecastChart, { type Series } from '../components/ForecastChart';

const RANGES = [30, 60, 90, 180];

export default function ForecastScreen() {
  const { data, engine } = useStore();
  const [days, setDays] = useState(90);

  const runs: Series[] = [
    { id: 'base', label: 'Income on time', color: 'var(--series-1)', f: engine.forecast(days, 'base') },
    { id: 'late', label: `Income ${data.policy.lateIncomeDays} days late`, color: 'var(--series-2)', f: engine.forecast(days, 'late') },
    { id: 'stress', label: `Late + ${Math.round(data.policy.stressOverrun * 100)}% overspend`, color: 'var(--series-3)', f: engine.forecast(days, 'stress') },
  ];

  const notable = runs[0].f.series.filter(d => d.events.length);

  return (
    <>
      <Card title={`Next ${days} days`} sub="three ways it could go">
        <div className="btnrow" style={{ marginBottom: 12 }}>
          {RANGES.map(d => (
            <button
              key={d}
              className={`btn sm ${d === days ? 'primary' : ''}`}
              onClick={() => setDays(d)}
            >
              {d} days
            </button>
          ))}
        </div>

        <div className="legend">
          {runs.map(r => (
            <span className="key" key={r.id}>
              <span className="swatch" style={{ background: r.color }} />{r.label}
            </span>
          ))}
        </div>

        <ForecastChart runs={runs} />

        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
          Touch the chart to read any day. The ring marks the tightest point if income is late.
        </div>
      </Card>

      <div className="tiles">
        {runs.map(r => (
          <Tile
            key={r.id}
            small
            label={r.label}
            value={money(r.f.lowest.balance)}
            color={r.f.firstNegative
              ? 'var(--critical)'
              : r.f.lowest.balance < data.policy.bufferAmount ? 'var(--serious)' : 'var(--good-text)'}
            note={<>
              Lowest point, {fmtDate(r.f.lowest.date)}.{' '}
              {r.f.firstNegative
                ? <strong style={{ color: 'var(--critical)' }}>Out of money {fmtDate(r.f.firstNegative)}.</strong>
                : 'Never goes below zero.'}
              <br />Ends at {money(r.f.endBalance)}.
            </>}
          />
        ))}
      </div>

      <Card title="Every money event" sub="the same data, as exact figures">
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>What happens</th>
                {runs.map(r => <th key={r.id} className="num">{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {notable.map(d => {
                const idx = runs[0].f.series.findIndex(s => s.date === d.date);
                return (
                  <tr key={d.date}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.date)}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {d.events.map((e, i) => <div key={i}>{e}</div>)}
                    </td>
                    {runs.map(r => {
                      const v = r.f.series[idx].balance;
                      return <td key={r.id} className={`num ${v < 0 ? 'neg' : ''}`}>{money(v)}</td>;
                    })}
                  </tr>
                );
              })}
              {!notable.length && (
                <tr><td colSpan={2 + runs.length} className="empty">No scheduled money events in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
