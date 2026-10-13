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

export function Alerts({ items, emptyText }: { items: AlertT[]; emptyText?: string }) {
  if (!items.length) {
    return (
      <div className="alert good">
        <span className="ico">✓</span>
        <span>{emptyText || 'Nothing pressing.'}</span>
      </div>
    );
  }
  return (
    <>
      {items.map((a, i) => (
        <div key={i} className={`alert ${a.level}`}>
          <span className="ico">{a.level === 'danger' ? '!' : a.level === 'warn' ? '△' : '✓'}</span>
          <span>{a.text}</span>
        </div>
      ))}
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

/** A number input that lets the box be empty while typing without
 *  snapping the stored value to 0 on every keystroke. */
export function NumberInput({ value, onChange, placeholder, min, step }: {
  value: number; onChange: (n: number) => void;
  placeholder?: string; min?: number; step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
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
