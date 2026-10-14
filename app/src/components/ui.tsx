/* Small shared pieces. Nothing clever — just the bits every screen needs. */

import React, { useEffect, useState } from 'react';
import type { Alert as AlertT } from '../lib/types';

export function Card({ title, sub, children }: {
  title?: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <section className="card">
      {title && <h2>{title}{sub && <span className="sub"> — {sub}</span>}</h2>}
      {children}
    </section>
  );
}

export function Tile({ label, value, note, color, small }: {
  label: string; value: React.ReactNode; note?: React.ReactNode;
  color?: string; small?: boolean;
}) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className={small ? 'value sm' : 'value'} style={color ? { color } : undefined}>{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Alerts({ items, emptyText, go, max }: {
  items: AlertT[]; emptyText?: string;
  go?: (r: string) => void;
  /** Show only the first `max`, with a "show the rest" toggle. */
  max?: number;
}) {
  const [all, setAll] = useState(false);
  if (!items.length) {
    return (
      <div className="alert good">
        <span className="ico">✓</span>
        <span>{emptyText || 'Nothing pressing.'}</span>
      </div>
    );
  }
  const shown = max && !all ? items.slice(0, max) : items;
  const hidden = items.length - shown.length;
  return (
    <>
      {shown.map((a, i) => (
        <div key={i} className={`alert ${a.level}`}>
          <span className="ico">
            {a.level === 'danger' ? '!' : a.level === 'warn' ? '△' : a.level === 'good' ? '✓' : 'i'}
          </span>
          <span className="alert-body">
            <span>{a.text}</span>
            {a.action && go && (
              <button className="alert-act" onClick={() => go(a.action!.route)}>
                {a.action.label} ›
              </button>
            )}
          </span>
        </div>
      ))}
      {hidden > 0 && (
        <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => setAll(true)}>
          Show {hidden} more
        </button>
      )}
      {max && all && items.length > max && (
        <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => setAll(false)}>
          Show less
        </button>
      )}
    </>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="fld">{label}</label>
      {children}
    </div>
  );
}

/** A number input you can actually type in.
 *
 *  The box keeps its own text while you are typing, because the stored number
 *  and the text on screen are not the same thing: "12." parses to 12, and if we
 *  pushed that back into the box it would eat the decimal point as you typed it.
 *  So the text is only re-synced from the outside when the incoming value really
 *  differs from what the box currently says. */
export function NumberInput({ value, onChange, placeholder, min, step }: {
  value: number; onChange: (n: number) => void;
  placeholder?: string; min?: number; step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value));
    // deliberately keyed on `value` alone: re-running on `text` would undo
    // each keystroke that has not finished parsing yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step ?? 'any'}
      min={min}
      value={text}
      placeholder={placeholder}
      onChange={e => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (!isNaN(n)) onChange(n);
      }}
      onBlur={() => {
        const n = parseFloat(text);
        if (isNaN(n)) setText(String(value)); else onChange(n);
      }}
    />
  );
}

export function Switch({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="switch">
      <span className="txt">{label}{hint && <small>{hint}</small>}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

export function RowLink({ label, meta, onClick }: {
  label: React.ReactNode; meta?: React.ReactNode; onClick: () => void;
}) {
  return (
    <button className="rowlink" onClick={onClick}>
      <span>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {meta && <span className="meta">{meta}</span>}
        <span className="chev">›</span>
      </span>
    </button>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  return {
    toast: <Toast message={msg} onDone={() => setMsg(null)} />,
    show: (m: string) => setMsg(m),
  };
}
