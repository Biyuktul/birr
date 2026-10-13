import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { runSelfTest } from '../lib/selftest';
import { Card } from '../components/ui';

export default function Checks() {
  const { data } = useStore();
  const run = useMemo(() => runSelfTest(data), [data]);

  return (
    <>
      <div className="card" style={{ borderLeft: `4px solid ${run.allPass ? 'var(--good)' : 'var(--critical)'}` }}>
        <h2>Engine self-validation</h2>
        <div className="hero" style={{ fontSize: 28, color: run.allPass ? 'var(--good-text)' : 'var(--critical)' }}>
          {run.passed} of {run.total} pass
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6 }}>
          {run.allPass
            ? 'Every figure on every screen comes from logic that checks out against these assertions — run against your own data, not a fixture.'
            : 'Something is wrong. Do not trust the numbers until these pass.'}
        </div>
      </div>

      <Card title="Each check">
        {run.results.map(r => (
          <div className={`check ${r.pass ? 'pass' : 'fail'}`} key={r.n}>
            <span className="mk">{r.pass ? '✓' : '✕'}</span>
            <span>
              {r.n}. {r.name}
              {!r.pass && <><br /><span className="detail">{r.detail}</span></>}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}
