/* ============================================================
   BIRR — state and persistence

   One Data object, saved to this device. When the backend lands,
   only `persist` and `load` change; nothing else in the app
   needs to know where the data lives.
   ============================================================ */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { Data, Section } from './types';
import { makeDefaultData, todayISO } from './defaults';
import { makeEngine, type Engine } from './engine';

const KEY = 'birr.data.v1';

/* Storage can throw (private mode, blocked site data) and can come back
   empty. The app must work either way, so every access is guarded. */
export function loadData(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Data;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.accounts)) {
        // the ledger always runs as of today, whatever was saved
        return { ...parsed, meta: { ...parsed.meta, asOf: todayISO() } };
      }
    }
  } catch {
    /* fall through to defaults */
  }
  return makeDefaultData();
}

export function saveData(d: Data): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

interface Ctx {
  data: Data;
  engine: Engine;
  /** Apply a change. The updater must return a NEW object. */
  update: (fn: (d: Data) => Data) => void;
  /** Mark a section as holding the person's real figures. */
  confirm: (s: Section, value?: boolean) => void;
  reset: () => void;
  saved: boolean;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>(() => loadData());
  const [saved, setSaved] = useState(true);

  useEffect(() => { setSaved(saveData(data)); }, [data]);

  const update = useCallback((fn: (d: Data) => Data) => {
    setData(prev => fn(prev));
  }, []);

  const confirm = useCallback((s: Section, value = true) => {
    setData(prev => ({ ...prev, confirmed: { ...prev.confirmed, [s]: value } }));
  }, []);

  const reset = useCallback(() => { setData(makeDefaultData()); }, []);

  const engine = useMemo(() => makeEngine(data), [data]);

  const value = useMemo<Ctx>(
    () => ({ data, engine, update, confirm, reset, saved }),
    [data, engine, update, confirm, reset, saved],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error('useStore must be used inside StoreProvider');
  return c;
}

/* ---------- small helpers used by screens ---------- */

export function exportJSON(d: Data): string {
  return JSON.stringify(d, null, 2);
}

export function importJSON(text: string): Data | { error: string } {
  try {
    const parsed = JSON.parse(text) as Data;
    if (!parsed || typeof parsed !== 'object') return { error: 'That is not a Birr backup.' };
    if (parsed.version !== 1) return { error: `Unsupported backup version ${String(parsed.version)}.` };
    if (!Array.isArray(parsed.accounts)) return { error: 'The backup has no accounts in it.' };
    return { ...parsed, meta: { ...parsed.meta, asOf: todayISO() } };
  } catch (e) {
    return { error: 'That file is not valid JSON.' };
  }
}
