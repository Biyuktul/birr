import { money } from '../lib/engine';
import type { PeriodSpend } from '../lib/types';

/* One series, so no legend is needed — the heading names it. The bar you are
   looking at is filled; the rest are recessive. Tapping picks a period.

   The viewBox is roughly phone width on purpose. These bars must all fit on
   screen — the newest period is the point of the chart, and pushing it off
   the right edge behind a scrollbar hides exactly what you came to see. */

const W = 360, H = 172;
const P = { t: 20, r: 6, b: 24, l: 6 };

export default function SpendingBars({ periods, selectedKey, onPick, average }: {
  periods: PeriodSpend[];
  selectedKey: string;
  onPick: (key: string) => void;
  average?: number;
}) {
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(1, ...periods.map(p => p.total));
  const n = periods.length;
  const slot = iw / n;
  const barW = Math.max(5, Math.min(30, slot * 0.64));

  // Label as many as will fit without colliding, judged by the longest one.
  const longest = periods.reduce((m, p) => Math.max(m, p.label.length), 0);
  const every = Math.max(1, Math.ceil((longest * 5.4 + 4) / slot));

  const avgY = average && average > 0 ? P.t + ih - (average / max) * ih : null;
  // The selected bar's figure sits above it. Put the average caption on the
  // other side of the chart so the two can never land on top of each other.
  const selIdx = Math.max(0, periods.findIndex(p => p.key === selectedKey));
  const avgOnLeft = selIdx >= n / 2;

  return (
    <div className="chart-shell">
      <svg
        className="chart chart-fit"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Spending per period over ${n} periods, highest ${money(max)}`}
      >
        {avgY !== null && (
          <>
            <line
              x1={P.l} x2={W - P.r} y1={avgY} y2={avgY}
              stroke="var(--text-muted)" strokeWidth={0.8} strokeDasharray="3 3"
            />
            <text
              x={avgOnLeft ? P.l : W - P.r}
              y={Math.max(9, avgY - 4)}
              textAnchor={avgOnLeft ? 'start' : 'end'}
              fontSize={8.5} fill="var(--text-muted)"
            >
              avg {money(average!)}
            </text>
          </>
        )}

        <line
          x1={P.l} x2={W - P.r} y1={P.t + ih} y2={P.t + ih}
          stroke="var(--baseline)" strokeWidth={0.8}
        />

        {periods.map((p, i) => {
          const h = p.total > 0 ? Math.max(1.5, (p.total / max) * ih) : 0;
          const cx = P.l + i * slot + slot / 2;
          const y = P.t + ih - h;
          const on = p.key === selectedKey;
          const showLabel = i % every === 0 || on || i === n - 1;
          return (
            <g key={p.key} onClick={() => onPick(p.key)} style={{ cursor: 'pointer' }}>
              {/* a full-slot target: the bar itself can be only a few pixels */}
              <rect x={P.l + i * slot} y={P.t} width={slot} height={ih + 6} fill="transparent" />
              {h > 0 && (
                <rect
                  x={cx - barW / 2} y={y} width={barW} height={h} rx={2.5}
                  fill={on ? 'var(--series-1)' : 'var(--grid)'}
                />
              )}
              {on && p.total > 0 && (
                <text
                  // clamped so the figure cannot run off either edge
                  x={Math.min(W - P.r - 22, Math.max(P.l + 22, cx))}
                  y={Math.max(9, y - 5)}
                  textAnchor="middle" fontSize={10} fontWeight={650}
                  fill="var(--text-primary)" style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {money(p.total)}
                </text>
              )}
              {showLabel && (
                <text
                  x={cx} y={H - 8} textAnchor="middle" fontSize={8.5}
                  fill={on ? 'var(--text-primary)' : 'var(--text-muted)'}
                  fontWeight={on ? 650 : 400}
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
