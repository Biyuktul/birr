/* ============================================================
   BIRR — accounts and sync

   One row per person: their whole ledger as a single document.

   Why a document and not the relational schema in schema.sql:
   the app already works on one `Data` object and the engine reads
   it whole. Splitting it across a dozen tables would mean rewriting
   every read and every write for no benefit at two devices and one
   person. The relational schema stays in the repo for the day that
   changes.

   Every write carries the revision it was based on. If the server
   has moved on, the write is REFUSED rather than silently winning —
   so editing on the phone and the PC can never quietly lose an
   afternoon's work.
   ============================================================ */

import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import type { Data } from './types';

const CONFIG_KEY = 'birr.supabase.v1';
const SYNC_KEY = 'birr.sync.v1';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SyncState {
  /** revision this device last agreed with the server on */
  rev: number;
  /** local edits exist that the server has not got */
  dirty: boolean;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
}

const EMPTY_SYNC: SyncState = { rev: 0, dirty: false, lastPulledAt: null, lastPushedAt: null };

/* ---------- configuration ----------
   The anon key is designed to be public — it only ever grants what
   row-level security allows, which is "your own row and nothing else".
   It can be baked in at build time, or pasted into the app by hand so
   nobody has to send a key anywhere. */
export function loadConfig(): SupabaseConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SupabaseConfig;
    return c.url && c.anonKey ? c : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: SupabaseConfig | null): void {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch { /* storage blocked; the app still runs locally */ }
}

export function loadSync(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return { ...EMPTY_SYNC };
    return { ...EMPTY_SYNC, ...(JSON.parse(raw) as Partial<SyncState>) };
  } catch {
    return { ...EMPTY_SYNC };
  }
}

export function saveSync(s: SyncState): void {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function clearSync(): void {
  try { localStorage.removeItem(SYNC_KEY); } catch { /* ignore */ }
}

/* ---------- the client ---------- */
let client: SupabaseClient | null = null;
let clientUrl = '';

export function getClient(): SupabaseClient | null {
  const cfg = loadConfig();
  if (!cfg) { client = null; return null; }
  if (!client || clientUrl !== cfg.url) {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    clientUrl = cfg.url;
  }
  return client;
}

export function resetClient(): void { client = null; clientUrl = ''; }

/* ---------- results ---------- */
export type PullResult =
  | { kind: 'none' }                                  // nothing stored for this account yet
  | { kind: 'data'; doc: Data; rev: number }
  | { kind: 'error'; message: string };

export type PushResult =
  | { kind: 'ok'; rev: number }
  | { kind: 'conflict'; remoteRev: number }           // another device got there first
  | { kind: 'error'; message: string };

const TABLE = 'ledgers';

function friendly(message: string): string {
  const m = message.toLowerCase();
  // Safari says "Load failed" where Chrome says "Failed to fetch". Both mean
  // the request never arrived — usually a mistyped project URL or key on this
  // device, not a problem with the account.
  if (m.includes('failed to fetch') || m.includes('load failed') || m.includes('network'))
    return 'Could not reach your project from this device. Either you are offline, or the '
      + 'project URL or key saved here is wrong. Use "Test connection" below to find out which.';
  if (m.includes('relation') && m.includes('does not exist'))
    return 'The database is not set up yet — supabase-setup.sql has not been run on this project.';
  if (m.includes('email not confirmed'))
    return 'This email has not been confirmed yet. Either open the link Supabase emailed you, '
      + 'or switch confirmation off in Supabase → Authentication → Sign In / Providers → Email → '
      + '"Confirm email". For a private app of your own, switching it off is simpler and its '
      + 'built-in email sending is rate-limited anyway.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'That email already has an account here. Sign in instead of creating one.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Supabase is rate-limiting this for now — wait a few minutes and try again. '
      + 'Its built-in email sending allows only a couple of messages an hour.';
  if (m.includes('expired') && m.includes('link'))
    return 'That confirmation link has expired or was already used. Rather than wait for '
      + 'another, switch "Confirm email" off in Supabase → Authentication → Sign In / '
      + 'Providers → Email, then simply sign in.';
  if (m.includes('jwt') || m.includes('expired'))
    return 'Your sign-in expired. Sign in again.';
  if (m.includes('invalid login'))
    return 'That email and password do not match.';
  if (m.includes('password') && m.includes('6'))
    return 'The password must be at least 6 characters.';
  return message;
}

export async function pull(userId: string): Promise<PullResult> {
  const c = getClient();
  if (!c) return { kind: 'error', message: 'Sync is not set up on this device.' };
  const { data, error } = await c
    .from(TABLE)
    .select('doc, rev')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { kind: 'error', message: friendly(error.message) };
  if (!data) return { kind: 'none' };
  return { kind: 'data', doc: data.doc as Data, rev: data.rev as number };
}

/** Writes only if the server is still at `basedOnRev`. Anything else is a conflict. */
export async function push(userId: string, doc: Data, basedOnRev: number): Promise<PushResult> {
  const c = getClient();
  if (!c) return { kind: 'error', message: 'Sync is not set up on this device.' };

  if (basedOnRev === 0) {
    const { data, error } = await c
      .from(TABLE)
      .insert({ user_id: userId, doc, rev: 1 })
      .select('rev')
      .maybeSingle();
    if (!error && data) return { kind: 'ok', rev: data.rev as number };
    // A row already existed — fall through and treat it as a conflict to resolve.
    if (error && !/duplicate|conflict|unique/i.test(error.message)) {
      return { kind: 'error', message: friendly(error.message) };
    }
    const cur = await pull(userId);
    if (cur.kind === 'data') return { kind: 'conflict', remoteRev: cur.rev };
    return { kind: 'error', message: 'Could not start syncing this account.' };
  }

  const { data, error } = await c
    .from(TABLE)
    .update({ doc, rev: basedOnRev + 1, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('rev', basedOnRev)          // the optimistic lock
    .select('rev')
    .maybeSingle();

  if (error) return { kind: 'error', message: friendly(error.message) };
  if (!data) {
    const cur = await pull(userId);
    return { kind: 'conflict', remoteRev: cur.kind === 'data' ? cur.rev : basedOnRev };
  }
  return { kind: 'ok', rev: data.rev as number };
}

/* ============================================================
   The decision: pull, push, or stop and ask.
   Kept pure and separate because this is the one piece that can
   lose somebody's work, and it needs to be testable on its own.
   ============================================================ */
export type SyncPlan =
  | { action: 'seed' }                        // server has nothing; this device starts it
  | { action: 'pull'; rev: number }           // server is ahead and we have nothing local to lose
  | { action: 'push'; basedOnRev: number }    // we are ahead
  | { action: 'conflict'; remoteRev: number } // both moved, or the server went backwards
  | { action: 'idle' };                       // nothing to do

export function planSync(
  localRev: number,
  dirty: boolean,
  remote: { kind: 'none' } | { kind: 'data'; rev: number },
): SyncPlan {
  if (remote.kind === 'none') return { action: 'seed' };

  if (remote.rev > localRev) {
    // The server has work this device has not seen.
    return dirty ? { action: 'conflict', remoteRev: remote.rev } : { action: 'pull', rev: remote.rev };
  }

  if (remote.rev < localRev) {
    // The server is BEHIND us. That means it was reset, restored from a
    // backup, or this device is looking at a different account. Pushing
    // would bury whatever is there, so hand it to the person instead.
    return { action: 'conflict', remoteRev: remote.rev };
  }

  return dirty ? { action: 'push', basedOnRev: localRev } : { action: 'idle' };
}

/* ============================================================
   Diagnosing a device that cannot reach the project.
   Asks the project a question that needs the URL, the key AND the
   table to all be right, then reports which one is not.
   ============================================================ */
export interface ConnectionTest {
  ok: boolean;
  message: string;
}

export async function testConnection(): Promise<ConnectionTest> {
  const cfg = loadConfig();
  if (!cfg) return { ok: false, message: 'No project is saved on this device yet.' };

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(cfg.url.trim())) {
    return {
      ok: false,
      message: `The project URL does not look right: "${cfg.url}". It should be exactly like `
        + 'https://abcdefgh.supabase.co — no trailing path, no spaces.',
    };
  }

  const base = cfg.url.trim().replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/rest/v1/ledgers?select=user_id&limit=1`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
    });
  } catch {
    return {
      ok: false,
      message: 'Could not reach that address at all. Check this device is online, and that the '
        + 'project URL was copied in full — a single missing character does exactly this.',
    };
  }

  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => '');
    if (/invalid api key|jwt/i.test(body)) {
      return {
        ok: false,
        message: 'The address is right but the key is not. Copy the anon key again — it is long, '
          + 'and phone keyboards often clip the end or add a space.',
      };
    }
    return { ok: true, message: 'Reached the project. Sign in to go further.' };
  }

  if (res.status === 404) {
    return {
      ok: false,
      message: 'Reached the project, but the ledgers table is missing. Run supabase-setup.sql in '
        + "the project's SQL editor.",
    };
  }

  if (!res.ok) {
    return { ok: false, message: `The project answered with an error (${res.status}).` };
  }

  return { ok: true, message: 'Everything checks out — URL, key and table are all good.' };
}

/* ---------- moving the settings to another device ----------
   Typing a long key on a phone is how this goes wrong. The configured
   device makes a link instead; the other one opens it. The anon key is
   publishable, so carrying it in a link is no worse than it being in
   the app already. */
export function makeSetupLink(): string | null {
  const cfg = loadConfig();
  if (!cfg) return null;
  const payload = btoa(JSON.stringify(cfg))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const base = window.location.origin + window.location.pathname;
  return `${base}?cfg=${payload}`;
}

/** Reads a setup link, if this page was opened with one. Does not apply it —
 *  the person is shown which project it names and confirms first. */
export function readSetupLink(): SupabaseConfig | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('cfg');
  if (!raw) return null;
  try {
    const json = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    const cfg = JSON.parse(json) as SupabaseConfig;
    if (!cfg?.url || !cfg?.anonKey) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function clearSetupLink(): void {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.searchParams.delete('cfg');
  window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
}

/* Supabase sends people back from a confirmation or reset email with the
   outcome in the URL fragment. Read it once, scrub it, and say something
   useful — otherwise a failed link lands on a blank-looking app.
   (It only reaches us at all once the project's Site URL points here; by
   default it points at localhost:3000, which is a dead end.) */
export function takeAuthRedirectError(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash.includes('error')) return null;

  const q = new URLSearchParams(hash.replace(/^#\/?/, ''));
  const code = q.get('error_code');
  const desc = q.get('error_description');
  if (!code && !desc) return null;

  // put the app back on a normal route
  const clean = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', clean + '#/account');

  const readable = (desc || '').replace(/\+/g, ' ');
  if (code === 'otp_expired' || /expired|invalid/i.test(readable)) {
    return 'That email link has expired or was already used. Rather than wait for another, '
      + 'switch "Confirm email" off in Supabase → Authentication → Sign In / Providers → '
      + 'Email, then sign in normally.';
  }
  if (code === 'access_denied') return `The email link was refused: ${readable || code}.`;
  return readable || code || 'That email link did not work.';
}

/* ---------- auth ---------- */
export async function getSession(): Promise<Session | null> {
  const c = getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session;
}

export async function signUp(email: string, password: string): Promise<string | null> {
  const c = getClient();
  if (!c) return 'Sync is not set up on this device.';
  const { error } = await c.auth.signUp({ email, password });
  return error ? friendly(error.message) : null;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const c = getClient();
  if (!c) return 'Sync is not set up on this device.';
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? friendly(error.message) : null;
}

export async function signOut(): Promise<void> {
  const c = getClient();
  if (c) await c.auth.signOut();
  clearSync();
}

/** A short description of how far apart the two sides are. */
export function describeSync(s: SyncState, online: boolean): string {
  if (!online) return 'Offline — changes are saved here and will go up later.';
  if (s.dirty) return 'Changes on this device are not saved to your account yet.';
  if (s.lastPushedAt || s.lastPulledAt) {
    const when = new Date(s.lastPushedAt || s.lastPulledAt!);
    const mins = Math.round((Date.now() - when.getTime()) / 60000);
    if (mins < 1) return 'Up to date, just now.';
    if (mins < 60) return `Up to date, ${mins} minute${mins === 1 ? '' : 's'} ago.`;
    return `Up to date as of ${when.toLocaleString()}.`;
  }
  return 'Not synced yet.';
}
