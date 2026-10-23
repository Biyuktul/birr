import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import {
  loadConfig, saveConfig, resetClient, signIn, signUp, describeSync,
  takeAuthRedirectError, testConnection, makeSetupLink, readSetupLink, clearSetupLink,
  type ConnectionTest, type SupabaseConfig,
} from '../lib/sync';
import { money } from '../lib/engine';
import { Card, Field, useToast } from '../components/ui';

export default function Account() {
  const {
    data, session, syncConfigured, sync, online, busy, syncError, conflict,
    refreshAuth, syncNow, resolveConflict, signOutEverywhere,
  } = useStore();
  const { toast, show } = useToast();

  const cfg = loadConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.anonKey ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [test, setTest] = useState<ConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);
  const [offered, setOffered] = useState<SupabaseConfig | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);

  // A bounced confirmation / reset link leaves its reason in the URL.
  useEffect(() => { setLinkErr(takeAuthRedirectError()); }, []);
  // Settings handed over from another device.
  useEffect(() => { setOffered(readSetupLink()); }, []);

  async function runTest() {
    setTesting(true);
    setTest(await testConnection());
    setTesting(false);
  }

  const acceptOffered = async () => {
    if (!offered) return;
    saveConfig(offered);
    resetClient();
    clearSetupLink();
    setOffered(null);
    await refreshAuth();
    show('Settings applied');
  };

  const offerBanner = offered && (
    <div className="card" style={{ borderLeft: '4px solid var(--series-1)' }}>
      <h2>Settings from another device</h2>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 0 }}>
        This link sets this device up to use:
      </p>
      <div style={{ fontSize: 13, wordBreak: 'break-all', fontWeight: 600, marginBottom: 12 }}>
        {offered.url}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
        Only accept this if you made the link yourself. It decides where your figures are stored.
      </p>
      <div className="btnrow">
        <button className="btn primary" onClick={() => void acceptOffered()}>Use these settings</button>
        <button className="btn ghost" onClick={() => { clearSetupLink(); setOffered(null); }}>
          Ignore
        </button>
      </div>
    </div>
  );

  /* ---------- 1. not set up on this device ---------- */
  if (!syncConfigured) {
    return (
      <>
        {offerBanner}
        <Card title="Use Birr on more than one device">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 0 }}>
            Right now everything lives on this device only. Connecting an account lets your
            phone and your computer hold the same figures, and means losing the phone does
            not lose the data.
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            It needs a free Supabase project. Paste its two values here — they are meant to
            be public, and the database only ever lets you reach your own row.
          </p>
          <Field label="Project URL">
            <input
              type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://xxxxxxxx.supabase.co"
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
            />
          </Field>
          <Field label="Anon / publishable key">
            <textarea
              value={key} onChange={e => setKey(e.target.value)}
              placeholder="eyJhbGciOi…"
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
              style={{ minHeight: 80, fontSize: 12 }}
            />
          </Field>
          <button
            className="btn primary"
            disabled={!url.trim() || !key.trim()}
            onClick={async () => {
              saveConfig({ url: url.trim(), anonKey: key.trim() });
              resetClient();
              await refreshAuth();
              show('Connected');
            }}
          >Connect</button>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
            Never paste the <strong>service_role</strong> key anywhere. That one bypasses
            every protection. Only the anon key belongs here.
          </div>
        </Card>
      </>
    );
  }

  /* ---------- 2. set up, but nobody signed in ---------- */
  if (!session) {
    return (
      <>
        {offerBanner}
        <Card title={mode === 'in' ? 'Sign in' : 'Create your account'}>
          {linkErr && (
            <div className="alert warn"><span className="ico">△</span><span>{linkErr}</span></div>
          )}
          <Field label="Email">
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
              autoComplete="email" inputMode="email"
            />
          </Field>
          <Field label="Password">
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />
          </Field>
          {err && (
            <div className="alert danger"><span className="ico">!</span><span>{err}</span></div>
          )}
          <div className="btnrow">
            <button
              className="btn primary"
              disabled={working || !email.trim() || password.length < 6}
              onClick={async () => {
                setWorking(true); setErr(null);
                const e = mode === 'in'
                  ? await signIn(email.trim(), password)
                  : await signUp(email.trim(), password);
                setWorking(false);
                if (e) { setErr(e); return; }
                await refreshAuth();
                show(mode === 'in' ? 'Signed in' : 'Account created');
              }}
            >
              {working ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
            </button>
            <button className="btn ghost" onClick={() => { setMode(m => (m === 'in' ? 'up' : 'in')); setErr(null); }}>
              {mode === 'in' ? 'I need an account' : 'I already have one'}
            </button>
            <button className="btn ghost" disabled={testing} onClick={() => void runTest()}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          </div>
          {test && (
            <div className={`alert ${test.ok ? 'good' : 'warn'}`} style={{ marginTop: 10 }}>
              <span className="ico">{test.ok ? '✓' : '△'}</span><span>{test.message}</span>
            </div>
          )}
          <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
            Password must be at least 6 characters. Use the same account on your computer
            and both will hold the same figures.
          </div>
        </Card>

        <Card title="This device">
          <div className="muted" style={{ fontSize: 13 }}>
            Not signed in. Everything you have entered is still here and still works —
            signing in will send it up as the starting point.
          </div>
          <button
            className="btn ghost sm" style={{ marginTop: 10 }}
            onClick={async () => { saveConfig(null); resetClient(); await refreshAuth(); show('Disconnected'); }}
          >Use different project settings</button>
        </Card>
      </>
    );
  }

  /* ---------- 3. signed in ---------- */
  return (
    <>
      {conflict && (
        <div className="card" style={{ borderLeft: '4px solid var(--critical)' }}>
          <h2>Both devices changed things</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 0 }}>
            This device has changes that never went up, and your account has changes made
            somewhere else. Birr will not guess which to keep.
          </p>
          <div className="scroll-x">
            <table>
              <thead><tr><th /><th className="num">This device</th><th className="num">Your account</th></tr></thead>
              <tbody>
                <tr>
                  <td>Accounts</td>
                  <td className="num">{data.accounts.length}</td>
                  <td className="num">{conflict.remoteDoc.accounts?.length ?? 0}</td>
                </tr>
                <tr>
                  <td>Transactions</td>
                  <td className="num">{data.transactions.length}</td>
                  <td className="num">{conflict.remoteDoc.transactions?.length ?? 0}</td>
                </tr>
                <tr>
                  <td>Combined balance</td>
                  <td className="num">{money(data.accounts.reduce((s, a) => s + a.opening, 0))}</td>
                  <td className="num">
                    {money((conflict.remoteDoc.accounts ?? []).reduce((s, a) => s + a.opening, 0))}
                  </td>
                </tr>
                <tr>
                  <td>Sections confirmed</td>
                  <td className="num">{Object.values(data.confirmed).filter(Boolean).length}</td>
                  <td className="num">
                    {Object.values(conflict.remoteDoc.confirmed ?? {}).filter(Boolean).length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={busy} onClick={() => void resolveConflict('mine')}>
              Keep this device
            </button>
            <button className="btn" disabled={busy} onClick={() => void resolveConflict('theirs')}>
              Take the account's version
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Before choosing, take a backup under Setup → Show backup text. Whichever you
            discard is gone.
          </div>
        </div>
      )}

      <Card title="Account">
        <div style={{ fontSize: 15, marginBottom: 4 }}>{session.user.email}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {describeSync(sync, online)}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <span className={`pill ${!online ? 'warn' : sync.dirty ? 'warn' : 'ok'}`}>
            {!online ? 'offline' : sync.dirty ? 'not sent yet' : 'up to date'}
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>revision {sync.rev}</span>
        </div>
        {syncError && (
          <div className="alert warn" style={{ marginTop: 10 }}>
            <span className="ico">△</span><span>{syncError}</span>
          </div>
        )}
        <div className="btnrow" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy || !online} onClick={() => void syncNow()}>
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => void signOutEverywhere()}>
            Sign out
          </button>
        </div>
      </Card>

      <Card title="Set up another device">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 0 }}>
          Rather than typing that long key again, make a link and open it on the other
          device. It fills in the settings; you still sign in there yourself.
        </p>
        <div className="btnrow">
          <button className="btn" onClick={() => setShareLink(makeSetupLink())}>
            {shareLink ? 'Hide link' : 'Make a setup link'}
          </button>
          {shareLink && (
            <button
              className="btn"
              onClick={async () => {
                try { await navigator.clipboard.writeText(shareLink); show('Copied'); }
                catch { show('Select the text and copy it by hand'); }
              }}
            >Copy</button>
          )}
          <button className="btn ghost" disabled={testing} onClick={() => void runTest()}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {shareLink && (
          <textarea
            readOnly value={shareLink} onFocus={e => e.currentTarget.select()}
            style={{ marginTop: 10, minHeight: 90, fontSize: 12 }}
          />
        )}
        {test && (
          <div className={`alert ${test.ok ? 'good' : 'warn'}`} style={{ marginTop: 10 }}>
            <span className="ico">{test.ok ? '✓' : '△'}</span><span>{test.message}</span>
          </div>
        )}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Send it to yourself however you like. It carries the project address and the
          publishable key — never your password, and never your figures.
        </div>
      </Card>

      <Card title="How this works">
        <ul style={{ paddingLeft: 20, margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>
          <li style={{ marginBottom: 6 }}>
            Everything saves to this device first, so the app never waits on the network and
            works with no signal.
          </li>
          <li style={{ marginBottom: 6 }}>
            Changes go up a couple of seconds after you stop typing, and come down whenever
            you open the app.
          </li>
          <li style={{ marginBottom: 6 }}>
            If both devices changed things while apart, Birr stops and asks. It will never
            quietly pick one.
          </li>
          <li>
            Your wife signs in with her own email and gets her own separate figures. The
            database enforces that, not the app.
          </li>
        </ul>
      </Card>

      <Card title="Signing out">
        <div className="muted" style={{ fontSize: 13 }}>
          Signing out leaves this device's copy where it is. It does not delete anything
          from your account.
        </div>
      </Card>
      {toast}
    </>
  );
}
