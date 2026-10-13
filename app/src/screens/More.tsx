import { useStore } from '../lib/store';
import { money } from '../lib/engine';
import { SECTIONS } from '../lib/types';
import { Card, RowLink } from '../components/ui';
import type { Route } from '../App';

export default function More({ go }: { go: (r: Route) => void }) {
  const { data, engine, saved } = useStore();
  const unconfirmed = SECTIONS.filter(s => !data.confirmed[s.key]).length;

  return (
    <>
      <Card title="Your money">
        <RowLink
          label="Accounts"
          meta={`${engine.activeAccounts.length} · ${money(engine.combinedBalance())}`}
          onClick={() => go('accounts')}
        />
        <RowLink label="Budget" meta="this month" onClick={() => go('budget')} />
        {data.loan.enabled && (
          <RowLink label="Loan" meta={money(data.loan.balance)} onClick={() => go('loan')} />
        )}
        {data.ekub.enabled && (
          <RowLink
            label="Ekub"
            meta={`${engine.ekubStatus().paidCount}/${engine.ekubStatus().totalRounds}`}
            onClick={() => go('ekub')}
          />
        )}
        {data.relocation.enabled && (
          <RowLink
            label="Relocation"
            meta={engine.relocation().affordable ? 'affordable' : 'not yet'}
            onClick={() => go('relocation')}
          />
        )}
      </Card>

      <Card title="The app">
        <RowLink
          label="Setup"
          meta={unconfirmed > 0
            ? <span className="pill warn">{unconfirmed} to confirm</span>
            : <span className="pill ok">all confirmed</span>}
          onClick={() => go('setup')}
        />
        <RowLink label="Checks" meta="engine self-test" onClick={() => go('checks')} />
      </Card>

      {!saved && (
        <div className="alert warn" style={{ marginTop: 14 }}>
          <span className="ico">△</span>
          <span>
            This device is refusing to save. If you are in a private window, or site data is
            blocked, anything you enter will be lost when you close the app.
          </span>
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
        Birr · everything stays on this device for now
      </div>
    </>
  );
}
