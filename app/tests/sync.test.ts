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
