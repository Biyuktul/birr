/* ============================================================
   BIRR — state, persistence and sync

   The device is always the working copy: everything is saved here
   first and the app never waits on the network. Syncing pushes that
   copy up and pulls other devices' work down, refusing any write
   that would overwrite something it has not seen.
   ============================================================ */

import React, {
  createContext, useContext, useEffect, useMemo, useState, useCallback, useRef,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Data, Section } from './types';
import { makeDefaultData, todayISO } from './defaults';
import { makeEngine, type Engine } from './engine';
import {
  getClient, loadSync, saveSync, clearSync, pull, push, planSync,
  signOut as authSignOut, type SyncState,
} from './sync';

const KEY = 'birr.data.v1';
const PUSH_DELAY_MS = 2500;

/* Storage can throw (private mode, blocked site data) and can come back empty.
   The app must work either way, so every access is guarded. */
export function loadData(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Data;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.accounts)) {
        return { ...parsed, meta: { ...parsed.meta, asOf: todayISO() } };
      }
    }
  } catch { /* fall through to defaults */ }
  return makeDefaultData();
}

export function saveData(d: Data): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; }
  catch { return false; }
}

export interface Conflict {
  remoteDoc: Data;
  remoteRev: number;
}

interface Ctx {
  data: Data;
  engine: Engine;
  update: (fn: (d: Data) => Data) => void;
  confirm: (s: Section, value?: boolean) => void;
  reset: () => void;
  saved: boolean;

  /* account + sync */
  session: Session | null;
  syncConfigured: boolean;
  sync: SyncState;
  online: boolean;
  busy: boolean;
  syncError: string | null;
  conflict: Conflict | null;
  refreshAuth: () => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (choice: 'mine' | 'theirs') => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>(() => loadData());
  const [saved, setSaved] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [syncConfigured, setSyncConfigured] = useState(() => !!getClient());
  const [sync, setSync] = useState<SyncState>(() => loadSync());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const dataRef = useRef(data);
  const syncRef = useRef(sync);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { syncRef.current = sync; }, [sync]);

  const writeSync = useCallback((s: SyncState) => { syncRef.current = s; saveSync(s); setSync(s); }, []);

  /* ---------- local persistence ---------- */
  useEffect(() => { setSaved(saveData(data)); }, [data]);

  /* ---------- online / offline ---------- */
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  /* ---------- auth ---------- */
  const refreshAuth = useCallback(async () => {
    setSyncConfigured(!!getClient());
    const c = getClient();
    if (!c) { setSession(null); return; }
    const { data: s } = await c.auth.getSession();
    setSession(s.session ?? null);
  }, []);

  useEffect(() => {
    void refreshAuth();
    const c = getClient();
    if (!c) return;
    const { data: listener } = c.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, [refreshAuth]);

  /* ---------- the one sync routine ---------- */
  const doSync = useCallback(async (): Promise<void> => {
    const c = getClient();
    const uid = session?.user?.id;
    if (!c || !uid || !navigator.onLine) return;

    setBusy(true);
    setSyncError(null);
    try {
      const local = syncRef.current;
      const remote = await pull(uid);
      if (remote.kind === 'error') { setSyncError(remote.message); return; }

      const plan = planSync(local.rev, local.dirty, remote);

      switch (plan.action) {
        case 'idle':
          return;

        case 'seed': {
          const r = await push(uid, dataRef.current, 0);
          if (r.kind === 'ok') {
            writeSync({ rev: r.rev, dirty: false, lastPulledAt: null, lastPushedAt: new Date().toISOString() });
          } else if (r.kind === 'conflict') {
            const again = await pull(uid);
            if (again.kind === 'data') setConflict({ remoteDoc: again.doc, remoteRev: again.rev });
          } else setSyncError(r.message);
          return;
        }

        case 'pull': {
          if (remote.kind !== 'data') return;
          setData({ ...remote.doc, meta: { ...remote.doc.meta, asOf: todayISO() } });
          writeSync({ ...local, rev: plan.rev, dirty: false, lastPulledAt: new Date().toISOString() });
          return;
        }

        case 'conflict': {
          if (remote.kind === 'data') setConflict({ remoteDoc: remote.doc, remoteRev: remote.rev });
          return;
        }

        case 'push': {
          const r = await push(uid, dataRef.current, plan.basedOnRev);
          if (r.kind === 'ok') {
            writeSync({ ...syncRef.current, rev: r.rev, dirty: false, lastPushedAt: new Date().toISOString() });
          } else if (r.kind === 'conflict') {
            // Somebody wrote between our read and our write.
            const again = await pull(uid);
            if (again.kind === 'data') setConflict({ remoteDoc: again.doc, remoteRev: again.rev });
          } else setSyncError(r.message);
          return;
        }
      }
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [session, writeSync]);

  /* ---------- sync when signing in, coming back online, or returning to the app ---------- */
  useEffect(() => {
    if (!session) return;
    void doSync();
    const onFocus = () => { if (document.visibilityState === 'visible') void doSync(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [session, doSync]);

  /* ---------- push shortly after you stop typing ---------- */
  const pushTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!session || !sync.dirty || conflict) return;
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => { void doSync(); }, PUSH_DELAY_MS);
    return () => window.clearTimeout(pushTimer.current);
  }, [session, sync.dirty, data, conflict, doSync]);

  /* ---------- mutations ---------- */
  const markDirty = useCallback(() => {
    const s = syncRef.current;
    if (!s.dirty) writeSync({ ...s, dirty: true });
  }, [writeSync]);

  const update = useCallback((fn: (d: Data) => Data) => {
    setData(prev => fn(prev));
    markDirty();
  }, [markDirty]);

  const confirm = useCallback((s: Section, value = true) => {
    setData(prev => ({ ...prev, confirmed: { ...prev.confirmed, [s]: value } }));
    markDirty();
  }, [markDirty]);

  const reset = useCallback(() => {
    setData(makeDefaultData());
    markDirty();
  }, [markDirty]);

  const resolveConflict = useCallback(async (choice: 'mine' | 'theirs') => {
    const uid = session?.user?.id;
    if (!conflict || !uid) return;
    setBusy(true);
    try {
      if (choice === 'theirs') {
        setData({ ...conflict.remoteDoc, meta: { ...conflict.remoteDoc.meta, asOf: todayISO() } });
        writeSync({
          ...syncRef.current, rev: conflict.remoteRev, dirty: false,
          lastPulledAt: new Date().toISOString(),
        });
        setConflict(null);
      } else {
        const r = await push(uid, dataRef.current, conflict.remoteRev);
        if (r.kind === 'ok') {
          writeSync({
            ...syncRef.current, rev: r.rev, dirty: false,
            lastPushedAt: new Date().toISOString(),
          });
          setConflict(null);
        } else if (r.kind === 'error') setSyncError(r.message);
      }
    } finally {
      setBusy(false);
    }
  }, [conflict, session, writeSync]);

  const signOutEverywhere = useCallback(async () => {
    await authSignOut();
    clearSync();
    setSync(loadSync());
    setConflict(null);
    setSyncError(null);
    setSession(null);
  }, []);

  const engine = useMemo(() => makeEngine(data), [data]);

  const value = useMemo<Ctx>(() => ({
    data, engine, update, confirm, reset, saved,
    session, syncConfigured, sync, online, busy, syncError, conflict,
    refreshAuth, syncNow: doSync, resolveConflict, signOutEverywhere,
  }), [
    data, engine, update, confirm, reset, saved,
    session, syncConfigured, sync, online, busy, syncError, conflict,
    refreshAuth, doSync, resolveConflict, signOutEverywhere,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error('useStore must be used inside StoreProvider');
  return c;
}

/* ---------- backup helpers ---------- */
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
  } catch {
    return { error: 'That file is not valid JSON.' };
  }
}
