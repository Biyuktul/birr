import { useRef, useState } from 'react';
import { money, fmtDate } from '../lib/engine';
import type { Forecast } from '../lib/types';

export interface Series {
  id: string;
  label: string;
  color: string;
  f: Forecast;
}

const W = 760, H = 250;
const P = { t: 14, r: 58, b: 28, l: 54 };
const iw = W - P.l - P.r, ih = H - P.t - P.b;

export default function ForecastChart({ runs }: { runs: Series[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = runs[0].f.series.length;

  let lo = Infinity, hi = -Infinity;
  runs.forEach(r => r.f.series.forEach(d => {
    lo = Math.min(lo, d.balance); hi = Math.max(hi, d.balance);
  }));
  lo = Math.min(lo, 0); hi = Math.max(hi, 1);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;

  const x = (i: number) => P.l + (i / Math.max(1, n - 1)) * iw;
  const y = (v: number) => P.t + ih - ((v - lo) / (hi - lo)) * ih;

  const ticks: number[] = [];
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, hi - lo)))) / 2;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  /* Pointer events cover mouse and touch with one path. */
  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    let i = Math.round(((loc.x - P.l) / iw) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    setHover(i);
  }

  // end labels, nudged apart so they never collide
  const ends = runs
    .map(r => ({ r, v: r.f.endBalance, yy: y(r.f.endBalance) }))
    .sort((a, b) => a.yy - b.yy);
  let prev = -Infinity;
  const endLabels = ends.map(e => {
    let ly = e.yy;
    if (ly - prev < 13) ly = prev + 13;
    prev = ly;
    return { ...e, ly };
  });

  const hoverDay = hover !== null ? runs[0].f.series[hover] : null;

  return (
    <div className="chart-shell" ref={shellRef}>
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Projected balance over ${n - 1} days under ${runs.length} scenarios`}
      >
        {ticks.map(v => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text
              x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize={10.5}
              fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.round(v / 1000)}k
            </text>
          </g>
        ))}

        {lo < 0 && hi > 0 && (
          <line
            x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)}
            stroke="var(--critical)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.85}
          />
        )}

        <line x1={P.l} x2={W - P.r} y1={P.t + ih} y2={P.t + ih} stroke="var(--baseline)" strokeWidth={1} />

        {[0, Math.floor((n - 1) / 2), n - 1].map((i, k) => (
          <text
            key={i} x={x(i)} y={H - 8} fontSize={10.5} fill="var(--text-muted)"
            textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}
          >
            {fmtDate(runs[0].f.series[i].date)}
          </text>
        ))}

        {runs.map(r => (
          <polyline
            key={r.id}
            points={r.f.series.map((d, i) => `${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(' ')}
            fill="none" stroke={r.color} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round"
          />
        ))}

        {endLabels.map(e => (
          <g key={e.r.id}>
            <circle cx={x(n - 1)} cy={e.yy} r={3.5} fill={e.r.color} stroke="var(--surface-1)" strokeWidth={2} />
            <text
              x={x(n - 1) + 8} y={e.ly + 3.5} fontSize={10.5} fill="var(--text-secondary)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {money(e.v)}
            </text>
          </g>
        ))}

        {/* lowest point on the honest (late) scenario */}
        {(() => {
          const late = runs.find(r => r.id === 'late') || runs[0];
          const li = late.f.series.findIndex(d => d.date === late.f.lowest.date);
          if (li < 0) return null;
          return (
            <circle
              cx={x(li)} cy={y(late.f.lowest.balance)} r={4.5}
              fill="none" stroke={late.color} strokeWidth={2}
            />
          );
        })()}

        {hover !== null && (
          <g>
            <line
              x1={x(hover)} x2={x(hover)} y1={P.t} y2={P.t + ih}
              stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3"
            />
            {runs.map(r => (
              <circle
                key={r.id} cx={x(hover)} cy={y(r.f.series[hover].balance)} r={4}
                fill={r.color} stroke="var(--surface-1)" strokeWidth={2}
              />
            ))}
          </g>
        )}

        <rect
          x={P.l} y={P.t} width={iw} height={ih} fill="transparent"
          style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hoverDay && (
        <div
          style={{
            marginTop: 10, padding: '10px 12px', borderRadius: 10,
            border: '1px solid var(--baseline)', background: 'var(--plane)', fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 650, marginBottom: 5 }}>{fmtDate(hoverDay.date)}</div>
          {runs.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="swatch" style={{ background: r.color }} />{r.label}
              </span>
              <span className={r.f.series[hover!].balance < 0 ? 'neg' : undefined}>
                {money(r.f.series[hover!].balance)}
              </span>
            </div>
          ))}
          {hoverDay.events.length > 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>
              {hoverDay.events.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
