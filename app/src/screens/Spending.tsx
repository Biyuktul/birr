import { useState } from 'react';
import { useStore } from '../lib/store';
import { money, fmtDate } from '../lib/engine';
import { Card, Tile } from '../components/ui';
import SpendingBars from '../components/SpendingBars';
import type { Granularity } from '../lib/types';

/* How far back each view looks. Enough to see a pattern, few enough that
   the bars stay tappable on a phone. */
const SPAN: Record<Granularity, { count: number; word: string; each: string }> = {
  day: { count: 14, word: 'day', each: 'Last 14 days' },
  week: { count: 12, word: 'week', each: 'Last 12 weeks' },
  month: { count: 12, word: 'month', each: 'Last 12 months' },
};

export default function Spending() {
  const { engine } = useStore();
  const [grain, setGrain] = useState<Granularity>('month');
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [openCat, setOpenCat] = useState<string | null>(null);

  const span = SPAN[grain];
  const report = engine.spendingReport(grain, span.count, picked);
  const sel = report.selected;

  function switchGrain(g: Granularity) {
    setGrain(g);
    setPicked(undefined);      // always land on the newest period
    setOpenCat(null);
  }

  const changeUp = report.change > 0;
  const hasPrevious = report.previousTotal > 0;

  return (
    <>
      <div className="btnrow" style={{ marginTop: 14 }}>
        {(['day', 'week', 'month'] as Granularity[]).map(g => (
          <button
            key={g}
            className={`btn ${g === grain ? 'primary' : ''}`}
            onClick={() => switchGrain(g)}
          >
            {g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : 'Monthly'}
          </button>
        ))}
      </div>

      <div className="tiles">
        <Tile
          label={sel.current ? `This ${span.word}` : sel.longLabel}
          value={<span className="hero">{money(sel.total)}</span>}
          note={<>
            {fmtDate(sel.from)}{sel.from !== sel.to && <> — {fmtDate(sel.to)}</>}
            {hasPrevious && (
              <><br />
                <span style={{ color: changeUp ? 'var(--critical)' : 'var(--good-text)' }}>
                  {changeUp ? '▲' : '▼'} {money(Math.abs(report.change))}
                </span>{' '}
                {changeUp ? 'more' : 'less'} than the {span.word} before
              </>
            )}
          </>}
        />
        <Tile
          small
          label={`Average ${span.word}`}
          value={money(report.average)}
          note={`Across the ${span.word}s you have recorded anything`}
        />
      </div>

      <Card title={span.each} sub="tap a bar to look at it">
        {report.empty ? (
          <div className="empty">
            Nothing recorded yet in this window. Spending appears here as you log bank
            messages, mark bills paid, and record what you pay out.
          </div>
        ) : (
          <SpendingBars
            periods={report.periods}
            selectedKey={sel.key}
            onPick={k => { setPicked(k); setOpenCat(null); }}
            average={report.average}
          />
        )}
      </Card>

      <Card
        title={`Where it went`}
        sub={sel.current ? `this ${span.word}` : sel.longLabel}
      >
        {report.categories.length === 0 ? (
          <div className="empty">Nothing spent in this {span.word}.</div>
        ) : report.categories.map(c => {
          const isOpen = openCat === c.category;
          return (
            <div key={c.category}>
              <div className="bar-row" style={{ marginBottom: 10 }}>
                <button
                  className="rowlink"
                  style={{ borderBottom: 'none', padding: '2px 0' }}
                  onClick={() => setOpenCat(isOpen ? null : c.category)}
                >
                  <span className="cat" style={{ fontWeight: 550 }}>{c.category}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {money(c.total)}
                    </span>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {Math.round(c.share * 100)}%
                    </span>
                    <span className="chev">{isOpen ? '⌄' : '›'}</span>
                  </span>
                </button>
                <div className="bar-track" style={{ marginTop: 6 }}>
                  <div className="bar-fill" style={{ width: `${c.share * 100}%` }} />
                </div>
              </div>

              {isOpen && (
                <CategoryDetail
                  category={c.category}
                  grain={grain}
                  count={span.count}
                  word={span.word}
                  from={sel.from}
                  to={sel.to}
                />
              )}
            </div>
          );
        })}
      </Card>

      <div className="muted" style={{ fontSize: 12.5, marginTop: 14, textAlign: 'center' }}>
        Everything here comes from what you have actually recorded. Transfers between
        your own accounts, balance corrections and money lent out are left out —
        none of them is spending.
      </div>
    </>
  );
}

/* ---------- one category, over time, with the receipts ---------- */
function CategoryDetail({ category, grain, count, word, from, to }: {
  category: string;
  grain: Granularity;
  count: number;
  word: string;
  from: string;
  to: string;
}) {
  const { engine } = useStore();
  const trend = engine.categoryOverTime(category, grain, count);
  const items = engine.spendingIn(from, to, category);
  const spent = trend.filter(p => p.total > 0);
  const avg = spent.length
    ? Math.round(spent.reduce((t, p) => t + p.total, 0) / spent.length) : 0;
  const biggest = trend.reduce((a, b) => (b.total > a.total ? b : a), trend[0]);

  return (
    <div style={{ padding: '4px 0 16px' }}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
        {category} per {word} — averaging <strong>{money(avg)}</strong>
        {biggest && biggest.total > 0 && <> · highest {money(biggest.total)} in {biggest.longLabel}</>}
      </div>

      <SpendingBars
        periods={trend}
        selectedKey={trend[trend.length - 1].key}
        onPick={() => { /* the detail chart is for reading, not picking */ }}
      />

      {items.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="fld" style={{ marginBottom: 4 }}>What made it up</div>
          <div className="scroll-x">
            <table>
              <tbody>
                {items.map(t => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td>
                      {t.note || '—'}
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {engine.accountById[t.accountId]?.name ?? t.accountId}
                      </div>
                    </td>
                    <td className="num neg">{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
