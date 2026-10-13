import { useStore } from '../lib/store';
import { money, fmtDate, addDaysISO, daysBetween } from '../lib/engine';
import { uid } from '../lib/defaults';
import { Card, useToast } from '../components/ui';
import type { Commitment, IncomeOccurrence } from '../lib/types';

type Row =
  | ({ flow: 'out' } & Commitment)
  | ({ flow: 'in' } & IncomeOccurrence);

export default function CalendarScreen() {
  const { data, engine, update } = useStore();
  const { toast, show } = useToast();

  const to = addDaysISO(engine.asOf, 60);
  const outs = engine.commitments(engine.asOf, to);
  const ins = engine.incomeOccurrences(engine.asOf, to);

  const rows: Row[] = [
    ...outs.map(c => ({ ...c, flow: 'out' as const })),
    ...ins.map(i => ({ ...i, flow: 'in' as const })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  function markPaid(c: Commitment) {
    update(d => ({
      ...d,
      paid: { ...d.paid, [c.key]: true },
      transactions: [...d.transactions, {
        id: uid('t'),
        date: c.date,
        accountId: c.accountId,
        amount: -Math.abs(c.amount),
        category: c.category,
        note: c.name,
        isTransfer: false,
        source: 'calendar' as const,
      }],
    }));
    show(`${c.name} marked paid`);
  }

  function postpone(c: Commitment, days: number) {
    update(d => ({ ...d, overrides: { ...d.overrides, [c.key]: addDaysISO(c.date, days) } }));
    show(`${c.name} moved ${days} days later`);
  }

  function skip(c: Commitment) {
    update(d => ({ ...d, paid: { ...d.paid, [c.key]: true } }));
    show(`${c.name} skipped`);
  }

  function undoAll() {
    update(d => ({ ...d, paid: {}, overrides: {} }));
    show('Restored');
  }

  const settled = Object.keys(data.paid).length;

  // group by date
  const groups: { date: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.date) last.rows.push(r);
    else groups.push({ date: r.date, rows: [r] });
  }

  function rel(d: string) {
    const n = daysBetween(engine.asOf, d);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n < 0) return `${-n} day${-n === 1 ? '' : 's'} overdue`;
    return `in ${n} days`;
  }

  return (
    <>
      <Card title="Next 60 days" sub="what goes out, what comes in">
        {!groups.length && <div className="empty">Nothing scheduled.</div>}

        {groups.map(g => (
          <div className="daygroup" key={g.date}>
            <div className="dayhead">
              {fmtDate(g.date)} · {rel(g.date)}
            </div>
            {g.rows.map((r, i) => r.flow === 'in' ? (
              <div className="item" key={`in-${i}`}>
                <div className="nm">
                  {r.name}
                  <small>
                    into {engine.accountById[r.accountId]?.name ?? r.accountId} · {r.confidence} confidence
                  </small>
                </div>
                <div className="amt pos">+{money(r.amount)}</div>
              </div>
            ) : (
              <div className="item" key={`out-${r.key}`}>
                <div className="nm">
                  {r.name}
                  {r.overdue && <> <span className="pill bad">overdue</span></>}
                  <small>
                    from {engine.accountById[r.accountId]?.name ?? r.accountId} · {r.category}
                    {r.essential ? ' · essential' : ''}
                  </small>
                </div>
                <div className="amt neg">−{money(r.amount)}</div>
                <div className="btnrow" style={{ width: '100%' }}>
                  <button className="btn primary sm" onClick={() => markPaid(r)}>Mark paid</button>
                  <button className="btn sm" onClick={() => postpone(r, 7)}>+7 days</button>
                  <button className="btn ghost sm" onClick={() => skip(r)}>Skip</button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {settled > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
            <span className="muted" style={{ fontSize: 13 }}>
              {settled} commitment{settled === 1 ? '' : 's'} settled or skipped.
            </span>
            <button className="btn ghost sm" style={{ marginLeft: 10 }} onClick={undoAll}>Undo all</button>
          </div>
        )}
      </Card>
      {toast}
    </>
  );
}
