import { describe, it, expect } from 'vitest';
import { planSync, describeSync, type SyncState } from '../src/lib/sync';

/* The sync planner is the one piece that can lose somebody's work.
   These cases are written from the question "could this silently
   throw away an afternoon of entering figures?" */

const S = (rev: number, dirty: boolean): [number, boolean] => [rev, dirty];

describe('sync planner', () => {
  it('seeds the account when the server has nothing', () => {
    expect(planSync(0, false, { kind: 'none' })).toEqual({ action: 'seed' });
    expect(planSync(0, true, { kind: 'none' })).toEqual({ action: 'seed' });
  });

  it('does nothing when both sides agree and nothing changed here', () => {
    expect(planSync(...S(5, false), { kind: 'data', rev: 5 })).toEqual({ action: 'idle' });
  });

  it('pushes when this device is the only one that moved', () => {
    expect(planSync(...S(5, true), { kind: 'data', rev: 5 }))
      .toEqual({ action: 'push', basedOnRev: 5 });
  });

  it('pulls when the server moved and this device has nothing to lose', () => {
    expect(planSync(...S(5, false), { kind: 'data', rev: 9 }))
      .toEqual({ action: 'pull', rev: 9 });
  });

  it('REFUSES to choose when both sides moved', () => {
    expect(planSync(...S(5, true), { kind: 'data', rev: 9 }))
      .toEqual({ action: 'conflict', remoteRev: 9 });
  });

  it('refuses when the server has gone backwards, rather than burying it', () => {
    // e.g. the project was restored from a backup, or this device is pointed
    // at a different account. Pushing here would overwrite whatever is there.
    expect(planSync(...S(9, false), { kind: 'data', rev: 4 }))
      .toEqual({ action: 'conflict', remoteRev: 4 });
    expect(planSync(...S(9, true), { kind: 'data', rev: 4 }))
      .toEqual({ action: 'conflict', remoteRev: 4 });
  });

  it('never pushes over a revision it has not seen', () => {
    // exhaustive sweep: a push may only ever be based on the exact revision
    // the server currently holds
    for (let local = 0; local <= 12; local++) {
      for (let remoteRev = 1; remoteRev <= 12; remoteRev++) {
        for (const dirty of [true, false]) {
          const p = planSync(local, dirty, { kind: 'data', rev: remoteRev });
          if (p.action === 'push') {
            expect(p.basedOnRev).toBe(remoteRev);
            expect(local).toBe(remoteRev);
            expect(dirty).toBe(true);
          }
          // a pull may only happen when there is nothing local to lose
          if (p.action === 'pull') expect(dirty).toBe(false);
        }
      }
    }
  });

  it('only ever discards local work when that work does not exist', () => {
    for (let local = 0; local <= 8; local++) {
      for (let remoteRev = 1; remoteRev <= 8; remoteRev++) {
        const dirtyPlan = planSync(local, true, { kind: 'data', rev: remoteRev });
        // with unsent local changes, the only safe outcomes are: push them,
        // or stop and ask. Never pull over them.
        expect(['push', 'conflict']).toContain(dirtyPlan.action);
      }
    }
  });
});

describe('sync status wording', () => {
  const base: SyncState = { rev: 3, dirty: false, lastPulledAt: null, lastPushedAt: null };

  it('says so plainly when offline', () => {
    expect(describeSync(base, false)).toMatch(/offline/i);
  });

  it('says so when changes have not gone up', () => {
    expect(describeSync({ ...base, dirty: true }, true)).toMatch(/not saved to your account/i);
  });

  it('reports recency once something has synced', () => {
    const justNow = { ...base, lastPushedAt: new Date().toISOString() };
    expect(describeSync(justNow, true)).toMatch(/up to date/i);
  });

  it('does not claim to be up to date before anything has synced', () => {
    expect(describeSync(base, true)).toMatch(/not synced/i);
  });
});

describe('bounced email links', () => {
  function withHash(hash: string) {
    const replaced: string[] = [];
    (globalThis as any).window = {
      location: { hash, pathname: '/birr/', search: '' },
      history: { replaceState: (_a: unknown, _b: unknown, url: string) => replaced.push(url) },
    };
    return replaced;
  }

  it('explains an expired confirmation link and how to get past it', async () => {
    withHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    const { takeAuthRedirectError } = await import('../src/lib/sync');
    const msg = takeAuthRedirectError();
    expect(msg).toMatch(/expired or was already used/i);
    expect(msg).toMatch(/Confirm email/);
  });

  it('puts the app back on a real route so it is not left on an error URL', async () => {
    const replaced = withHash('#error=access_denied&error_code=otp_expired&error_description=x');
    const { takeAuthRedirectError } = await import('../src/lib/sync');
    takeAuthRedirectError();
    expect(replaced.at(-1)).toBe('/birr/#/account');
  });

  it('stays quiet on a normal route', async () => {
    withHash('#/account');
    const { takeAuthRedirectError } = await import('../src/lib/sync');
    expect(takeAuthRedirectError()).toBeNull();
  });
});

describe('moving settings to another device', () => {
  const CFG = { url: 'https://abcdefgh.supabase.co', anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload+with/slashes==' };

  function withWindow(search: string, store: Record<string, string> = {}) {
    const replaced: string[] = [];
    (globalThis as any).window = {
      location: {
        search, hash: '', pathname: '/birr/', origin: 'https://biyuktul.github.io',
        href: 'https://biyuktul.github.io/birr/' + search,
      },
      history: { replaceState: (_a: unknown, _b: unknown, url: string) => replaced.push(url) },
    };
    (globalThis as any).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    };
    return replaced;
  }

  it('survives a round trip, base64url and all', async () => {
    const store: Record<string, string> = { 'birr.supabase.v1': JSON.stringify(CFG) };
    withWindow('', store);
    const mod = await import('../src/lib/sync');
    const link = mod.makeSetupLink()!;
    expect(link).toContain('?cfg=');
    // the payload must be URL-safe — no +, / or = to be mangled in transit
    const payload = link.split('?cfg=')[1];
    expect(payload).not.toMatch(/[+/=]/);

    withWindow('?cfg=' + payload, {});
    const mod2 = await import('../src/lib/sync');
    expect(mod2.readSetupLink()).toEqual(CFG);
  });

  it('ignores a URL with no settings on it', async () => {
    withWindow('', {});
    const mod = await import('../src/lib/sync');
    expect(mod.readSetupLink()).toBeNull();
  });

  it('refuses rubbish rather than half-applying it', async () => {
    withWindow('?cfg=not-valid-base64!!', {});
    const mod = await import('../src/lib/sync');
    expect(mod.readSetupLink()).toBeNull();
  });

  it('refuses a payload that decodes but is missing the key', async () => {
    const half = Buffer.from(JSON.stringify({ url: CFG.url })).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    withWindow('?cfg=' + half, {});
    const mod = await import('../src/lib/sync');
    expect(mod.readSetupLink()).toBeNull();
  });

  it('makes no link when nothing is configured', async () => {
    withWindow('', {});
    const mod = await import('../src/lib/sync');
    expect(mod.makeSetupLink()).toBeNull();
  });
});

describe('connection test', () => {
  function setup(cfgUrl: string, fetchImpl?: typeof fetch) {
    const store = { 'birr.supabase.v1': JSON.stringify({ url: cfgUrl, anonKey: 'k' }) };
    (globalThis as any).window = { location: { search: '', hash: '' } };
    (globalThis as any).localStorage = {
      getItem: (k: string) => (k in store ? (store as any)[k] : null),
      setItem: () => {}, removeItem: () => {},
    };
    if (fetchImpl) (globalThis as any).fetch = fetchImpl;
  }

  it('catches a malformed project URL before going near the network', async () => {
    let called = false;
    setup('https://abcdefgh.supabase', (async () => { called = true; return new Response(); }) as any);
    const { testConnection } = await import('../src/lib/sync');
    const r = await testConnection();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/does not look right/i);
    expect(called).toBe(false);   // no pointless request
  });

  it('says the address is unreachable when the request throws', async () => {
    setup('https://abcdefgh.supabase.co', (async () => { throw new Error('Load failed'); }) as any);
    const { testConnection } = await import('../src/lib/sync');
    const r = await testConnection();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/could not reach/i);
  });

  it('blames the key, not the address, on an invalid API key', async () => {
    setup('https://abcdefgh.supabase.co',
      (async () => new Response('{"message":"Invalid API key"}', { status: 401 })) as any);
    const { testConnection } = await import('../src/lib/sync');
    const r = await testConnection();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/key is not/i);
  });

  it('points at the setup script when the table is missing', async () => {
    setup('https://abcdefgh.supabase.co', (async () => new Response('', { status: 404 })) as any);
    const { testConnection } = await import('../src/lib/sync');
    const r = await testConnection();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/supabase-setup\.sql/);
  });

  it('reports all clear when the project answers properly', async () => {
    setup('https://abcdefgh.supabase.co', (async () => new Response('[]', { status: 200 })) as any);
    const { testConnection } = await import('../src/lib/sync');
    const r = await testConnection();
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/checks out/i);
  });
});
